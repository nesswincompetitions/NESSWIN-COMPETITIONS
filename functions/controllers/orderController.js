import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { admin, db } from "../config/firebaseAdmin.js";

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
