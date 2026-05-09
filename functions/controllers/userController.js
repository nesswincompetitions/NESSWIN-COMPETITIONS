import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { admin, db } from "../config/firebaseAdmin.js";

/**
 * Trigger: aggregateUserMetrics
 * Listen for changes to the user/{userId} collection.
 * Check if the user transitioned from is_verified == false to is_verified == true.
 */
export const aggregateUserMetrics = onDocumentUpdated("user/{userId}", async (event) => {
  const beforeData = event.data.before?.data() || {};
  const afterData = event.data.after?.data() || {};

  // Check if user transitioned to verified
  const wasVerified = beforeData.is_verified === true;
  const isVerified = afterData.is_verified === true;

  if (!wasVerified && isVerified) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    console.log(`Aggregating metrics for newly verified user ${event.params.userId}`);

    const batch = db.batch();

    // Global Metrics: increment total_registered_users
    const globalRef = db.collection("system_metrics").doc("global_stats");
    batch.set(globalRef, {
      total_registered_users: admin.firestore.FieldValue.increment(1)
    }, { merge: true });

    // Daily Metrics: increment daily_new_users
    const dailyRef = db.collection("daily_metrics").doc(todayStr);
    batch.set(dailyRef, {
      daily_new_users: admin.firestore.FieldValue.increment(1),
      date: todayStr
    }, { merge: true });

    await batch.commit();
  }
});
