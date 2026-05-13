import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAuthenticated, toHttpsError } from "../services/functionGuards.js";
import { runOrderTransaction } from "../services/orderTransactionService.js";

// ─── processOrder ─────────────────────────────────────────────────────────────

/**
 * Callable: processOrder
 *
 * Handles the complete ticket purchase flow atomically.
 * All critical Firestore writes (order, tickets, free_ticket_log) happen
 * server-side so Security Rules can fully lock down those collections.
 *
 * Expected payload:
 * {
 *   competitionId:    string,
 *   ticketQuantity:   number,   // Paid tickets
 *   questionAnswer:   object,   // Embedded question_answer Map
 *   freeTicketsToUse: number,   // Referral tickets to redeem (optional, default 0)
 *   referralsToBurn:  Array<{ id: string }>,  // Referral doc IDs (optional)
 * }
 *
 * Returns:
 * {
 *   orderId:    string,
 *   tickets:    Array<{ ticketId, ticketNumber, ticketSequence }>,
 *   totalAmount: number,
 *   packType:   string,
 *   freeTickets: number,
 * }
 */
export const processOrder = onCall(async (request) => {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const uid = assertAuthenticated(request);

  const {
    competitionId,
    ticketQuantity,
    questionAnswer,
    freeTicketsToUse = 0,
    referralsToBurn = [],
  } = request.data;

  // ── Input validation ────────────────────────────────────────────────────────
  if (!competitionId || typeof competitionId !== "string") {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }

  const qty = Number(ticketQuantity);
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    throw new HttpsError("invalid-argument", "ticketQuantity must be a positive integer.");
  }
  if (qty > 100) {
    throw new HttpsError("invalid-argument", "Maximum 100 tickets per order.");
  }

  logger.info(`[processOrder] uid=${uid} competition=${competitionId} qty=${qty} referrals=${referralsToBurn?.length || 0}`);

  try {
    // ── Run atomic transaction ─────────────────────────────────────────────────
    const result = await runOrderTransaction(db, admin, {
      uid,
      competitionId,
      ticketQuantity: qty,
      questionAnswer,
      freeTicketsToUse: Number(freeTicketsToUse) || 0,
      referralsToBurn: Array.isArray(referralsToBurn) ? referralsToBurn : [],
    });

    logger.info(`[processOrder] ✅ Order ${result.orderId} created — ${result.tickets.length} tickets`);

    // ── Non-blocking push notification ────────────────────────────────────────
    // Fire-and-forget — a notification failure must never roll back the order.
    try {
      const userRef = db.collection("user").doc(uid);
      const competitionRef = db.collection("competition").doc(competitionId);
      const orderRef = db.collection("order").doc(result.orderId);

      await db.collection("ff_user_push_notifications").add({
        user_ref: userRef,
        competition_ref: competitionRef,
        order_ref: orderRef,
        type: "order_confirmed",
        title: "Tickets Confirmed! 🎟️",
        body: `Your ${result.tickets.length} ticket${result.tickets.length > 1 ? "s are" : " is"} in the draw.`,
        is_read: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (notifErr) {
      logger.warn("[processOrder] Notification write failed (non-fatal):", notifErr.message);
    }

    return result;
  } catch (err) {
    logger.error("[processOrder] Error:", err.message);
    throw toHttpsError(err, "Order processing failed. Please try again.");
  }
});

// ─── aggregateOrderMetrics ────────────────────────────────────────────────────

/**
 * Trigger: aggregateOrderMetrics
 * Listen for changes to the order/{orderId} collection.
 * If the order status is 'paid' (and wasn't previously paid), increment metrics.
 */
export const aggregateOrderMetrics = onDocumentWritten("order/{orderId}", async (event) => {
  const beforeData = event.data.before?.data() || {};
  const afterData = event.data.after?.data() || {};

  const wasPaid = beforeData.status === "paid";
  const isPaid = afterData.status === "paid";

  if (!wasPaid && isPaid) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    const totalAmount = Number(afterData.total_amount || 0);
    const totalTickets = Number(afterData.total_ticket || 0) + Number(afterData.free_ticket || 0);

    logger.info(`[aggregateOrderMetrics] order=${event.params.orderId} amount=${totalAmount} tickets=${totalTickets}`);

    const batch = db.batch();

    // Daily Metrics
    const dailyRef = db.collection("daily_metrics").doc(todayStr);
    batch.set(dailyRef, {
      daily_revenue: admin.firestore.FieldValue.increment(totalAmount),
      daily_tickets_sold: admin.firestore.FieldValue.increment(totalTickets),
      date: todayStr,
    }, { merge: true });

    // Global Metrics
    const globalRef = db.collection("system_metrics").doc("global_stats");
    batch.set(globalRef, {
      total_revenue: admin.firestore.FieldValue.increment(totalAmount),
      total_tickets_sold: admin.firestore.FieldValue.increment(totalTickets),
    }, { merge: true });

    await batch.commit();
  }
});
