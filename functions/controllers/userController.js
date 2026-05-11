import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
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

/**
 * Trigger: softDeleteUser
 * Callable function to securely soft-delete a user's account.
 * Updates Firestore with is_deleted=true and removes the user from Firebase Auth.
 */
export const softDeleteUser = onCall(async (request) => {
  // 1. Authentication Guard
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to delete your account."
    );
  }

  const uid = request.auth.uid;

  try {
    // 2. Firestore Update (The Soft Delete)
    const userRef = db.collection("user").doc(uid);
    
    await userRef.update({
      is_deleted: true,
      is_active: false,
      deleted_at: admin.firestore.FieldValue.serverTimestamp(),
      email: `deleted_${uid}@nesswin.com`,
      phone_number: admin.firestore.FieldValue.delete(),
    });

    // 3. Firebase Auth Hard Delete
    await admin.auth().deleteUser(uid);

    return { success: true, message: "Account successfully deleted." };
  } catch (error) {
    console.error(`Error deleting user ${uid}:`, error);
    
    // Check if the error is already an HttpsError
    if (error instanceof HttpsError) {
      throw error;
    }
    
    // Otherwise, throw a generic internal error
    throw new HttpsError(
      "internal",
      "Failed to delete account. Please try again later.",
      error.message
    );
  }
});
