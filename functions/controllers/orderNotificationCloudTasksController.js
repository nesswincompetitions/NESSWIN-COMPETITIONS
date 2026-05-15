import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { buildNotificationPayload } from "../services/orderNotificationService.js";

const REGION = "us-central1";

/**
 * Cloud Task Worker: paymentPendingWorker
 * Triggered 30 minutes after an order is initiated.
 * Checks if the order is still "pending" and sends a notification if so.
 */
export const paymentPendingWorker = onTaskDispatched(
  {
    region: REGION,
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 60,
    },
  },
  async (request) => {
    const { orderId, userId } = request.data;

    if (!orderId || !userId) {
      logger.error("[paymentPendingWorker] Missing orderId or userId in task payload.");
      return;
    }

    try {
      const orderRef = db.collection("order").doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        logger.info(`[paymentPendingWorker] Order ${orderId} no longer exists. Skipping.`);
        return;
      }

      const orderData = orderSnap.data();

      // Sniper logic: Only send if still pending
      if (orderData.status !== "pending") {
        logger.info(`[paymentPendingWorker] Order ${orderId} status is "${orderData.status}". User likely completed checkout. Skipping notification.`);
        return;
      }

      const userRef = db.collection("user").doc(userId);
      const competitionRef = orderData.competition_id;
      
      let compTitle = "the competition";
      if (competitionRef) {
        const compSnap = await competitionRef.get();
        if (compSnap.exists) {
          compTitle = compSnap.data()?.title || compTitle;
        }
      }

      // Send the abandoned cart notification
      const notificationDoc = buildNotificationPayload({
        type: "payment_pending",
        title: "Complete Your Entry! 🕒",
        text: `You started an entry for ${compTitle} but didn't finish. Complete it now before tickets sell out!`,
        status: "pending",
        userRefs: userRef.path,
        userRef: userRef,
        orderRef: orderRef,
        competitionRef: competitionRef,
        senderRef: db.collection("user").doc("system"), // Or a specific system UID
        pageName: "OrderHistory",
        parameterData: { orderId, competitionId: competitionRef?.id },
      });

      await db.collection("ff_user_push_notifications").add(notificationDoc);
      
      logger.info(`[paymentPendingWorker] Sent abandoned cart notification to user ${userId} for order ${orderId}`);
    } catch (error) {
      logger.error(`[paymentPendingWorker] Error processing task for order ${orderId}:`, error);
      throw error; // Retry according to config
    }
  }
);
