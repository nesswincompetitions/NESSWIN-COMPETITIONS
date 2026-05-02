import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { admin, db } from "../config/firebaseAdmin.js";
import { validateAuth, validateQuestionAnswer } from "../services/validationService.js";

/**
 * Phase 2 — Order Engine (Zero-Trust Transaction)
 *
 * Input:  { competitionId, ticketQuantity, questionId, selectedOptionId }
 * Output: { success, orderId, tickets: [...] }
 */
export const processOrder = onCall({ cors: true }, async (request) => {
  const uid = validateAuth(request);

  const { competitionId, ticketQuantity, questionId, selectedOptionId } = request.data;

  // ── Input validation ─────────────────────────────────────────────────────────
  if (!competitionId || !questionId) {
    throw new HttpsError("invalid-argument", "competitionId and questionId are required.");
  }

  const qty = Number(ticketQuantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError("invalid-argument", "Quantity must be a positive integer.");
  }
  if (qty > 100) {
    throw new HttpsError("invalid-argument", "Maximum 100 tickets per order.");
  }

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const userRef = db.collection("user").doc(uid);
  const competitionRef = db.collection("competition").doc(competitionId);
  const questionRef = db.collection("questions").doc(questionId);
  const orderRef = db.collection("order").doc(); // auto-id

  // ── Transaction ──────────────────────────────────────────────────────────────
  const result = await db.runTransaction(async (transaction) => {
    // ── 2A: The Reads & Validation ───────────────────────────────────────────
    const [userSnap, compSnap, questionSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(competitionRef),
      transaction.get(questionRef)
    ]);

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    const userData = userSnap.data();

    if (userData.status === "deleted" || userData.status === "suspended") {
      throw new HttpsError("permission-denied", "Your account is not allowed to make purchases.");
    }

    if (!compSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }
    const compData = compSnap.data();

    if (compData.status !== "active") {
      throw new HttpsError("failed-precondition", "This competition is not active.");
    }

    if (!questionSnap.exists) {
      throw new HttpsError("not-found", "Question not found.");
    }
    const questionData = questionSnap.data();

    // ── 2A: Skill Check & History ────────────────────────────────────────────
    
    // 1. Did they already pass this exact question?
    const pastAttemptsQuery = db.collection("skill_attempts")
      .where("user_id", "==", uid)
      .where("question_id", "==", questionId)
      .where("passed", "==", true)
      .limit(1);
      
    const pastAttemptsSnap = await transaction.get(pastAttemptsQuery);
    const hasAlreadyPassed = !pastAttemptsSnap.empty;

    let skillPassed = false;
    let correctOptionId = questionData.answer?.option_id;

    if (hasAlreadyPassed) {
      // User already passed! Bypass the test.
      skillPassed = true;
    } else {
      // User hasn't passed. They MUST provide an answer right now.
      if (selectedOptionId === undefined || selectedOptionId === null) {
        throw new HttpsError("invalid-argument", "You must answer the skill question.");
      }

      // Grade the answer
      // eslint-disable-next-line eqeqeq
      skillPassed = (selectedOptionId == correctOptionId);

      // Log this new attempt
      const attemptRef = db.collection("skill_attempts").doc();
      transaction.set(attemptRef, {
        user_id: uid,
        competition_id: competitionId,
        question_id: questionId,
        selected_option_id: selectedOptionId,
        passed: skillPassed,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      if (!skillPassed) {
        // Return early to commit the failed attempt to the database without crashing
        return { success: false, reason: "skill_check_failed" };
      }
    }

    // ── 2B: The Server-Side Math Engine ──────────────────────────────────────
    let discount = 0;
    let freeTickets = 0;
    let packType = "Manual";

    if (qty === 15) {
      discount = 0.10;
      freeTickets = 1;
      packType = "Pack Prestige";
    } else if (qty === 20) {
      discount = 0.15;
      freeTickets = 2;
      packType = "Pack Elite";
    } else if (qty === 25) {
      discount = 0.20;
      freeTickets = 2;
      packType = "Pack Gold";
    } else if (qty === 50) {
      discount = 0.25;
      freeTickets = 5;
      packType = "Pack Diamond";
    } else {
      discount = 0;
      freeTickets = Math.floor(qty / 10);
      packType = "Manual";
    }

    const ticketPrice = Number(compData.ticket_price || 0);
    const subtotal = qty * ticketPrice;
    const discountAmount = subtotal * discount;
    const totalAmount = subtotal - discountAmount;
    const totalTicketsToGenerate = qty + freeTickets;

    const currentStock = Number(compData.stock_quantity || 0);
    if (currentStock < totalTicketsToGenerate) {
      throw new HttpsError("resource-exhausted", `Out of stock. Only ${currentStock} ticket(s) remaining.`);
    }

    // ── 2C: The Writes ───────────────────────────────────────────────────────
    
    // Order Receipt
    const correctOption = questionData.option?.find(
      // eslint-disable-next-line eqeqeq
      (opt) => opt.option_id == correctOptionId
    );

    const orderSequenceId = `ORD-${orderRef.id.substring(0, 8).toUpperCase()}`;

    const orderData = {
      order_sequence_id: orderSequenceId,
      competition_id: competitionId,
      user_ref: uid,
      total_ticket: qty,
      free_ticket: freeTickets,
      pack_type: packType,
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      status: "Paid", // Mocking stripe for now
      question_answer: {
        question_id: questionId,
        question: questionData.question || "",
        correct_answer: correctOption?.option || "",
        correct_option_id: correctOptionId || null,
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      paid_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    transaction.set(orderRef, orderData);

    // ── 2C: Ticket Sequence Logic ───────────────────────────────────────────
    // 1. Generate Prefix from Competition Title (e.g., "Mega Car Giveaway" -> "MCG")
    const title = compData.title || "TKT";
    const prefix = title
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word[0].toUpperCase())
      .join("") || "TKT";

    // 2. Read last_ticket_sequence (Now a string like "MCG002")
    let currentSequenceNum = 0;
    if (compData.last_ticket_sequence) {
      const seqStr = String(compData.last_ticket_sequence);
      if (seqStr.startsWith(prefix)) {
        currentSequenceNum = Number(seqStr.substring(prefix.length)) || 0;
      } else {
        // Fallback for old integer format
        currentSequenceNum = Number(seqStr.replace(/\D/g, '')) || Number(seqStr) || 0;
      }
    }

    const tickets = [];
    let finalTicketSequence = "";
    for (let i = 0; i < totalTicketsToGenerate; i++) {
      currentSequenceNum += 1;
      const ticketRef = db.collection("ticket").doc();
      // Format: PREFIX + 3-digit padded number (or more if sequence > 999)
      const ticketSequence = `${prefix}${String(currentSequenceNum).padStart(3, "0")}`;
      finalTicketSequence = ticketSequence;

      transaction.set(ticketRef, {
        competition_id: competitionId,
        user_id: uid,
        order_id: orderRef.id,
        ticket_number: currentSequenceNum,
        ticket_sequence: ticketSequence,
        status: "active",
        is_winner: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      tickets.push({ ticketId: ticketRef.id, ticketSequence });
    }

    // Free Ticket Log
    if (freeTickets > 0) {
      const freeTicketLogRef = db.collection("free_ticket_log").doc();
      transaction.set(freeTicketLogRef, {
        user_id: uid,
        order_id: orderRef.id,
        competition_id: competitionId,
        quantity: freeTickets,
        reason: `${packType} Bonus`,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Competition Update
    const newStock = currentStock - totalTicketsToGenerate;

    const compUpdate = {
      stock_quantity: admin.firestore.FieldValue.increment(-totalTicketsToGenerate),
      sold_tickets: admin.firestore.FieldValue.increment(totalTicketsToGenerate),
      last_ticket_sequence: finalTicketSequence || String(currentSequenceNum), // Store as string
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (newStock === 0) {
      compUpdate.status = "sold_out";
    }
    
    // Add user to participants if not already there
    const participants = Array.isArray(compData.participants) ? [...compData.participants] : [];
    if (!participants.includes(uid)) {
      participants.push(uid);
      compUpdate.participants = participants;
    }
    
    transaction.update(competitionRef, compUpdate);

    // User Update
    transaction.update(userRef, {
      // Only increment by the quantity they actually PAID for
      total_tickets_bought: admin.firestore.FieldValue.increment(qty), 
      
      // NEW: Increment the free ticket counters by the bonus amount
      free_tickets: admin.firestore.FieldValue.increment(freeTickets),
      total_free_tickets: admin.firestore.FieldValue.increment(freeTickets),
      
      total_spent: admin.firestore.FieldValue.increment(totalAmount),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, orderId: orderRef.id, tickets, totalAmount, packType, freeTickets };
  });

  if (!result.success && result.reason === "skill_check_failed") {
    throw new HttpsError("permission-denied", "Incorrect answer. You must pass the skill gate first.");
  }

  return {
    success: true,
    orderId: result.orderId,
    tickets: result.tickets,
    totalAmount: result.totalAmount,
    packType: result.packType,
    freeTickets: result.freeTickets
  };
});


/**
 * Trigger: aggregateOrderMetrics
 * Listen for changes to the order/{orderId} collection.
 * If the order status is 'Paid' (and wasn't previously paid), increment metrics.
 */
export const aggregateOrderMetrics = onDocumentWritten("order/{orderId}", async (event) => {
  const beforeData = event.data.before?.data() || {};
  const afterData = event.data.after?.data() || {};

  // Check if order transitioned to 'Paid'
  const wasPaid = beforeData.status === "Paid";
  const isPaid = afterData.status === "Paid";

  if (!wasPaid && isPaid) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    const totalAmount = Number(afterData.total_amount || 0);
    const totalTickets = Number(afterData.total_ticket || 0) + Number(afterData.free_ticket || 0);

    console.log(`Aggregating metrics for order ${event.params.orderId}: Amount=${totalAmount}, Tickets=${totalTickets}`);

    const batch = db.batch();
    
    // Daily Metrics
    const dailyRef = db.collection("daily_metrics").doc(todayStr);
    batch.set(dailyRef, {
      daily_revenue: admin.firestore.FieldValue.increment(totalAmount),
      daily_tickets_sold: admin.firestore.FieldValue.increment(totalTickets),
      date: todayStr
    }, { merge: true });

    // Global Metrics
    const globalRef = db.collection("system_metrics").doc("global_stats");
    batch.set(globalRef, {
      total_revenue: admin.firestore.FieldValue.increment(totalAmount),
      total_tickets_sold: admin.firestore.FieldValue.increment(totalTickets)
    }, { merge: true });

    await batch.commit();
  }
});
