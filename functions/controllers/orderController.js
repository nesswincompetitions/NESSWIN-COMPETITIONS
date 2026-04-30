import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";
import { validateAuth, validateQuestionAnswer } from "../services/validationService.js";

/**
 * Phase 2 — Order Engine (Atomic Transaction)
 *
 * Re-validates the skill answer, then atomically:
 *   1. Updates competition stock/sold counts
 *   2. Creates an order document
 *   3. Creates individual ticket documents
 *   4. Updates the user's aggregate stats
 *
 * Input:  { competitionId, quantity, questionId, selectedOptionId }
 * Output: { success, orderId, tickets: [{ ticketId, ticketSequence }] }
 */
export const processMockCheckout = onCall(async (request) => {
  const uid = validateAuth(request);

  const { competitionId, quantity, questionId, selectedOptionId } = request.data;

  // ── Input validation ─────────────────────────────────────────────────────────
  if (!competitionId || !questionId || selectedOptionId === undefined || selectedOptionId === null) {
    throw new HttpsError("invalid-argument", "competitionId, questionId, and selectedOptionId are required.");
  }

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError("invalid-argument", "Quantity must be a positive integer.");
  }
  if (qty > 100) {
    throw new HttpsError("invalid-argument", "Maximum 100 tickets per order.");
  }

  // ── 1. Fetch & Validate Question ───────────────────────────────────────────
  const { passed: isCorrectAnswer, questionData } = await validateQuestionAnswer(db, questionId, selectedOptionId);

  // SECURITY: Ensure the question actually belongs to this competition
  // Handles both string ID and DocumentReference formats
  const questionCompId = typeof questionData.competition_id === "string" 
    ? questionData.competition_id 
    : questionData.competition_id?.id;

  if (questionCompId !== competitionId) {
    throw new HttpsError("permission-denied", "This question does not belong to the selected competition.");
  }

  // ── 2. Check for a previously "passed" attempt for this specific question ──
  // This handles persistence after refresh and ensures that if the admin changes
  // the question, the user's old pass won't work (since question_id won't match).
  const previousPass = await db
    .collection("skill_attempts")
    .where("user_id", "==", uid)
    .where("competition_id", "==", competitionId)
    .where("question_id", "==", questionId)
    .where("passed", "==", true)
    .limit(1)
    .get();

  const hasAlreadyPassed = !previousPass.empty;

  if (!hasAlreadyPassed && !isCorrectAnswer) {
    throw new HttpsError("permission-denied", "Incorrect answer. You must pass the skill gate first.");
  }

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const competitionRef = db.collection("competition").doc(competitionId);
  const userRef = db.collection("user").doc(uid);
  const orderRef = db.collection("order").doc(); // auto-id

  // ── Transaction ──────────────────────────────────────────────────────────────
  const result = await db.runTransaction(async (transaction) => {
    // Read competition
    const compSnap = await transaction.get(competitionRef);
    if (!compSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }
    const comp = compSnap.data();

    // Read user
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};

    // ── Pre-condition checks ─────────────────────────────────────────────────
    if (comp.status !== "active") {
      throw new HttpsError("failed-precondition", `Competition is not active (status: ${comp.status}).`);
    }

    const currentStock = Number(comp.stock_quantity || 0);
    if (currentStock < qty) {
      throw new HttpsError(
        "resource-exhausted",
        currentStock === 0
          ? "This competition is sold out."
          : `Only ${currentStock} ticket(s) remaining.`
      );
    }

    // ── Compute values ───────────────────────────────────────────────────────
    const ticketPrice = Number(comp.ticket_price || 0);
    const subtotal = ticketPrice * qty;
    const totalAmount = subtotal; // no tax in mock checkout

    const currentSequence = Number(comp.last_ticket_sequence || 0);
    const newStock = currentStock - qty;
    const newSold = Number(comp.sold_tickets || 0) + qty;
    const newSequence = currentSequence + qty;

    // Build participants array — append uid if not already present
    const participants = Array.isArray(comp.participants) ? [...comp.participants] : [];
    if (!participants.includes(uid)) {
      participants.push(uid);
    }

    // ── 1. Update competition ────────────────────────────────────────────────
    const compUpdate = {
      sold_tickets: newSold,
      stock_quantity: newStock,
      last_ticket_sequence: newSequence,
      participants,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (newStock === 0) {
      compUpdate.status = "sold_out";
    }
    transaction.update(competitionRef, compUpdate);

    // ── 2. Create order ──────────────────────────────────────────────────────
    // Build the question_answer map for the order receipt
    const correctOption = questionData.option?.find(
      // eslint-disable-next-line eqeqeq
      (opt) => opt.option_id == questionData.answer?.option_id
    );

    const orderSequenceId = `ORD-${orderRef.id.substring(0, 8).toUpperCase()}`;

    const orderData = {
      order_sequence_id: orderSequenceId,
      competition_id: competitionId,
      competition_title: comp.title || "Unknown Competition",
      user_ref: uid,
      user_name: userData.display_name || userData.name || "Unknown User",
      user_email: userData.email || "Unknown Email",
      total_ticket: qty,
      subtotal,
      total_amount: totalAmount,
      status: "Paid",
      question_answer: {
        question_id: questionId,
        question: questionData.question || "",
        correct_answer: correctOption?.option || "",
        correct_option_id: questionData.answer?.option_id || null,
      },
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      paid_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    transaction.set(orderRef, orderData);

    // ── 3. Create tickets ────────────────────────────────────────────────────
    const tickets = [];
    for (let i = 0; i < qty; i++) {
      const seq = currentSequence + i + 1;
      const ticketRef = db.collection("ticket").doc();
      const ticketSequence = `TKT-${String(seq).padStart(5, "0")}`;

      const ticketData = {
        competition_id: competitionId,
        user_id: uid,
        order_id: orderRef.id,
        ticket_number: seq,
        ticket_sequence: ticketSequence,
        status: "active",
        is_winner: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      transaction.set(ticketRef, ticketData);
      tickets.push({ ticketId: ticketRef.id, ticketSequence });
    }

    // ── 4. Update user ───────────────────────────────────────────────────────
    transaction.update(userRef, {
      total_tickets_bought: (Number(userData.total_tickets_bought) || 0) + qty,
      total_spent: (Number(userData.total_spent) || 0) + totalAmount,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── 5. Update Metrics ────────────────────────────────────────────────────
    const globalStatsRef = db.collection("system_metrics").doc("global_stats");
    const todayStr = new Date().toISOString().split("T")[0];
    const dailyMetricsRef = db.collection("daily_metrics").doc(todayStr);

    transaction.set(
      globalStatsRef,
      { total_revenue: admin.firestore.FieldValue.increment(totalAmount) },
      { merge: true }
    );

    transaction.set(
      dailyMetricsRef,
      {
        tickets_sold: admin.firestore.FieldValue.increment(qty),
        revenue: admin.firestore.FieldValue.increment(totalAmount),
        date: todayStr,
      },
      { merge: true }
    );

    return { orderId: orderRef.id, tickets, totalAmount };
  });

  return {
    success: true,
    orderId: result.orderId,
    tickets: result.tickets,
    totalAmount: result.totalAmount,
  };
});
