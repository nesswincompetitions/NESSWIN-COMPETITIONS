import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, toHttpsError } from "../services/functionGuards.js";
import { buildNotificationPayload } from "../services/orderNotificationService.js";

/**
 * Callable: grantAdminBonus
 * Payload: { userId: string, quantity: number, reason?: string }
 */
export const grantAdminBonus = onCall(async (request) => {
  await assertAdmin(request);

  const { userId, quantity, reason = "" } = request.data || {};

  try {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpsError("invalid-argument", "Quantity must be a positive integer.");
    }
    if (qty > 5000) {
      throw new HttpsError("invalid-argument", "Maximum 5000 tickets per grant.");
    }
    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }

    const userRef = db.collection("user").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }

    const adminRef = db.collection("user").doc(request.auth.uid);
    const MAX_TICKETS_PER_BATCH = 400; // Leaves plenty of room for user update, log, and notification
    let remainingQty = qty;
    let grantedSoFar = 0;

    // Process in sequential, self-contained atomic chunks
    while (remainingQty > 0) {
      const chunkSize = Math.min(remainingQty, MAX_TICKETS_PER_BATCH);
      const batch = db.batch();
      const serverTs = admin.firestore.FieldValue.serverTimestamp();

      // 1. Create referral docs for this chunk
      for (let i = 0; i < chunkSize; i++) {
        const referralRef = db.collection("referrals").doc();
        batch.set(referralRef, {
          referrer_id: userRef,
          referred_user_id: adminRef,
          referral_code: "ADMIN_BONUS",
          reward_type: "admin_bonus",
          reward_value: 1,
          reward_issued: false,
          created_at: serverTs,
        });
      }

      // 2. Increment user balance for this chunk only
      batch.update(userRef, {
        free_tickets: admin.firestore.FieldValue.increment(chunkSize),
        total_free_tickets: admin.firestore.FieldValue.increment(chunkSize),
        updated_at: serverTs,
      });

      // 3. Create a log entry specifically for this chunk
      const logRef = db.collection("free_ticket_log").doc();
      batch.set(logRef, {
        user_id: userRef,
        quantity: chunkSize,
        reason: reason || "Admin Bonus",
        reward_type: "admin_bonus",
        admin_note: reason,
        competition_id: null,
        reward_issued: false,
        type: "grant",
        created_at: serverTs,
      });

      // 4. If this is the final chunk, send the consolidated notification
      if (remainingQty === chunkSize) {
        const notifRef = db.collection("ff_user_push_notifications").doc();
        batch.set(notifRef, {
          user_refs: userRef.path,
          notification_title: `🎁 ${qty} Free Ticket${qty !== 1 ? 's' : ''} Granted!`,
          notification_text: `You've received ${qty} free ticket${qty !== 1 ? 's' : ''} from an admin.${reason ? ` Reason: ${reason}` : ''}`,
          notification_image_url: "",
          scheduled_time: null,
          notification_sound: "default",
          category: "rewards",
          type: "free_ticket_earned",
          cta_text: "View",
          initial_page_name: "MyTickets",
          parameter_data: JSON.stringify({ quantity: qty, reason: "admin_bonus", admin_note: reason }),
          status: "",
          is_read: false,
          num_sent: 0,
          sender: userRef,
          chat_ref: null,
          order_ref: null,
          competition_ref: null,
          timestamp: serverTs,
          created_at: serverTs,
        });
      }

      try {
        await batch.commit();
        grantedSoFar += chunkSize;
        remainingQty -= chunkSize;
      } catch (chunkErr) {
        logger.error(`[grantAdminBonus] Batch commit failed after granting ${grantedSoFar} tickets.`, chunkErr);
        throw new HttpsError(
          "aborted",
          `Partial success: Granted ${grantedSoFar} out of ${qty} tickets before failing. Please try again for the remainder.`
        );
      }
    }

    logger.info(`[grantAdminBonus] Successfully granted all ${qty} tickets to user=${userId}`);
    return { success: true, message: `Granted ${qty} ticket${qty !== 1 ? 's' : ''} successfully.` };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("[grantAdminBonus] Error:", err?.message || err);
    throw toHttpsError(err, "Failed to grant admin bonus.");
  }
});

/**
 * Callable: refundOrder
 * Marks an order as Refunded and CANCELS all associated tickets.
 */
export const refundOrder = onCall(async (request) => {
  const adminUid = await assertAdmin(request);
  const { orderId } = request.data || {};

  if (!orderId || typeof orderId !== "string") {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }

  try {
    const orderRef = db.collection("order").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const orderData = orderSnap.data();
    if (orderData.status === "Refunded") {
      return { success: true, message: "Order is already refunded." };
    }

    const userRef = orderData.user_ref;
    const competitionRef = orderData.competition_id;
    const adminRef = db.collection("user").doc(adminUid);

    const ticketsSnap = await db.collection("ticket")
      .where("order_id", "==", orderRef)
      .get();

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    batch.update(orderRef, {
      status: "Refunded",
      updated_at: now,
    });

    ticketsSnap.docs.forEach((ticketDoc) => {
      batch.update(ticketDoc.ref, {
        status: "cancelled",
        updated_at: now,
      });
    });

    const notifRef = db.collection("ff_user_push_notifications").doc();
    batch.set(notifRef, buildNotificationPayload({
      type: "refund_processed",
      title: "Order Refunded 💸",
      text: "Your order has been cancelled and a refund has been processed.",
      status: "refunded",
      userRefs: userRef.path,
      userRef: userRef,
      orderRef: orderRef,
      competitionRef: competitionRef,
      senderRef: adminRef,
      pageName: "OrderHistory",
      parameterData: { orderId },
    }));

    await batch.commit();

    logger.info(`[refundOrder] Admin ${adminUid} refunded order ${orderId}. ${ticketsSnap.size} tickets cancelled.`);

    return { 
      success: true, 
      message: "Order refunded and tickets cancelled successfully.",
      ticketsCancelled: ticketsSnap.size
    };
  } catch (err) {
    logger.error("[refundOrder] Error:", err.message);
    throw toHttpsError(err, "Failed to refund order.");
  }
});
