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
  const freeUse = Number(freeTicketsToUse) || 0;
  const referralsArr = Array.isArray(referralsToBurn) ? referralsToBurn : [];

  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 0) {
    throw new HttpsError("invalid-argument", "ticketQuantity must be a non-negative integer.");
  }

  // Allow zero paid tickets only when the user is redeeming free/referral tickets
  if (qty === 0 && freeUse === 0 && referralsArr.length === 0) {
    throw new HttpsError("invalid-argument", "At least one ticket must be requested (paid or free).");
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

    // ── Non-blocking push notifications ───────────────────────────────────────
    // Fire-and-forget — notification failures must never roll back the order.
    try {
      const userRef = db.collection("user").doc(uid);
      const competitionRef = db.collection("competition").doc(competitionId);
      const orderRef = db.collection("order").doc(result.orderId);

      const buildNotificationPayload = ({
        type,
        title,
        text,
        category,
        ctaText,
        initialPageName,
        parameterData,
      }) => ({
        user_refs: userRef.path,
        notification_title: title,
        notification_text: text,
        notification_image_url: "",
        notification_sound: "default",
        initial_page_name: initialPageName || "",
        parameter_data: parameterData || "{}",
        category: category || "Orders",
        type,
        cta_text: ctaText || "View",
        status: "",
        is_read: false,
        num_sent: 0,
        order_ref: orderRef,
        competition_ref: competitionRef,
        sender: userRef,
        chat_ref: null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 1) Order confirmed (total tickets allocated)
      const totalAllocated = result.tickets.length;
      const writes = [];

      writes.push(
        db.collection("ff_user_push_notifications").add({
          ...buildNotificationPayload({
            type: "order_confirmed",
            title: "Tickets Confirmed! 🎟️",
            text: `Your ${totalAllocated} ticket${totalAllocated > 1 ? "s are" : " is"} in the draw.`,
            category: "Orders",
            ctaText: "View Tickets",
            initialPageName: "MyTickets",
            parameterData: JSON.stringify({ orderId: result.orderId, competitionId }),
          }),
        })
      );

      // 2) Referral tickets used (if any)
      if (typeof result.referralTicketsUsed === "number" && result.referralTicketsUsed > 0) {
        writes.push(
          db.collection("ff_user_push_notifications").add({
            ...buildNotificationPayload({
              type: "referral_tickets_used",
              title: "Referral Reward Used",
              text: `You used ${result.referralTicketsUsed} referral ticket${result.referralTicketsUsed > 1 ? "s" : ""} on this competition.`,
              category: "Rewards",
              ctaText: "View",
              initialPageName: "Referral",
              parameterData: JSON.stringify({ orderId: result.orderId, competitionId }),
            }),
          })
        );
      }

      // 3) Pack bonus tickets added (if any)
      if (typeof result.packBonusTickets === "number" && result.packBonusTickets > 0) {
        writes.push(
          db.collection("ff_user_push_notifications").add({
            ...buildNotificationPayload({
              type: "bonus_tickets_added",
              title: "Bonus Tickets Added",
              text: `You received ${result.packBonusTickets} bonus ticket${result.packBonusTickets > 1 ? "s" : ""} with your pack for Nesswin.`,
              category: "Orders",
              ctaText: "View Order",
              initialPageName: "OrderHistory",
              parameterData: JSON.stringify({ orderId: result.orderId, competitionId }),
            }),
          })
        );
      }

      // Await all writes but don't let failures roll back order — log if any fail.
      const settled = await Promise.allSettled(writes);
      settled.forEach((s) => {
        if (s.status === "rejected") {
          logger.warn("[processOrder] Notification write failed (non-fatal):", s.reason?.message || s.reason);
        }
      });
    } catch (notifErr) {
      logger.warn("[processOrder] Notification orchestration failed (non-fatal):", notifErr.message || notifErr);
    }

    return result;
  } catch (err) {
    logger.error("[processOrder] Error:", err.message);
    throw toHttpsError(err, "Order processing failed. Please try again.");
  }
});

// Removed aggregateOrderMetrics (now handled by dashboardController.js)
