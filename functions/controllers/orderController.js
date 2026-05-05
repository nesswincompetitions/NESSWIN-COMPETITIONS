import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { admin, db } from "../config/firebaseAdmin.js";
import { getOrderPricing } from "../services/orderPricingService.js";
import { validateAuth } from "../services/validationService.js";

function questionBelongsToCompetition(questionCompetitionRef, competitionId) {
  if (!questionCompetitionRef || !competitionId) {
    return false;
  }

  if (typeof questionCompetitionRef === "string") {
    return questionCompetitionRef === competitionId || questionCompetitionRef.endsWith(`/${competitionId}`);
  }

  return questionCompetitionRef.id === competitionId;
}

/**
 * Phase 2 — Order Engine (Zero-Trust Transaction)
 *
 * Input:  { competitionId, ticketQuantity, questionId, selectedOptionId }
 * Output: { success, orderId, tickets: [...] }
 */
export const processOrder = onCall({ cors: true }, async (request) => {
  const uid = validateAuth(request);

  const { competitionId, ticketQuantity, questionId, selectedOptionId } = request.data || {};

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
  const orderRef = db.collection("order").doc(); // auto-id
  const questionRef = db.collection("questions").doc(questionId);

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

    if (userData.is_active === false) {
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
    if (!questionBelongsToCompetition(questionData.competition_id, competitionId)) {
      throw new HttpsError("failed-precondition", "Question does not belong to this competition.");
    }

    // ── 2A: Skill Check & History ────────────────────────────────────────────
    
    // 1. Did they already pass this exact question?
    // Query by user_id only to avoid composite index requirement
    const userAttemptsQuery = db.collection("skill_attempts").where("user_id", "==", userRef);
    const userAttemptsSnap = await transaction.get(userAttemptsQuery);
    
    let hasAlreadyPassed = false;
    let attemptNumber = 1;

    userAttemptsSnap.forEach(doc => {
      const data = doc.data();
      if (data.question_id?.id === questionId) {
        if (data.passed === true) {
          hasAlreadyPassed = true;
        }
        if (data.competition_id?.id === competitionId) {
          attemptNumber++;
        }
      }
    });

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
      
      const selectedOption = questionData.option?.find(
        (opt) => String(opt.option_id) === String(selectedOptionId)
      );
      const answerGivenText = selectedOption ? selectedOption.option : String(selectedOptionId);

      transaction.set(attemptRef, {
        user_id: userRef,
        competition_id: competitionRef,
        question_id: questionRef,
        answer_given: answerGivenText,
        passed: skillPassed,
        attempt_number: attemptNumber,
        attempted_at: admin.firestore.FieldValue.serverTimestamp()
      });

      if (!skillPassed) {
        // Return early to commit the failed attempt to the database without crashing
        return { success: false, reason: "skill_check_failed" };
      }
    }

    // ── 2B: The Server-Side Math Engine ──────────────────────────────────────
    const { discount, freeTickets, packType } = getOrderPricing(qty);

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


    const orderData = {
      competition_id: competitionRef,
      user_ref: userRef,
      total_ticket: qty,
      free_ticket: freeTickets,
      pack_type: packType,
      discount_percent: Math.round(discount * 100),
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      currency: "GBP",
      status: "paid", // Mocking stripe for now
      is_winner: false,
      stripe_payment_intent_id: "",
      stripe_status: "mock",
      question_answer: {
        question_id: questionId,
        question: questionData.question || "",
        option: questionData.option || [],
        answer: questionData.answer || {},
        image: questionData.images || [],
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

    // 2. Read last_ticket_sequence (Now stored as an integer)
    let currentSequenceNum = Number(compData.last_ticket_sequence) || 0;


    const tickets = [];
    for (let i = 0; i < totalTicketsToGenerate; i++) {
      currentSequenceNum += 1;
      const ticketRef = db.collection("ticket").doc();
      // Format: PREFIX + 3-digit padded number (or more if sequence > 999)
      const ticketSequence = `${prefix}${String(currentSequenceNum).padStart(3, "0")}`;

      transaction.set(ticketRef, {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
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
        user_id: userRef,
        order_id: orderRef,
        competition_id: competitionRef,
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
      last_ticket_sequence: currentSequenceNum, // Store as integer
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (newStock === 0) {
      compUpdate.status = "sold_out";
    }
    
    // Add user to participants if not already there
    const participants = Array.isArray(compData.participants) ? [...compData.participants] : [];
    // Check if the userRef path already exists in the array
    if (!participants.some(p => p.path === userRef.path)) {
      participants.push(userRef);
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
  const wasPaid = beforeData.status === "paid";
  const isPaid = afterData.status === "paid";

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
