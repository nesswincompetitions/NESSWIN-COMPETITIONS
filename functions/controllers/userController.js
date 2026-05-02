import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { admin, db } from "../config/firebaseAdmin.js";

/**
 * Soft deletes a user by disabling their auth account, revoking sessions,
 * and marking their Firestore document as DELETED.
 */
export const softDeleteUser = onCall({ cors: true }, async (request) => {
  // 1. Authentication & Authorization Check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to perform this action.");
  }

  // Verify admin role
  try {
    const adminDoc = await db.collection("user").doc(request.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Only administrators can delete users.");
    }
  } catch (err) {
    console.error("Error checking admin role:", err);
    throw new HttpsError("internal", "Failed to verify administrative permissions.");
  }

  const { userId } = request.data;

  if (!userId) {
    throw new HttpsError("invalid-argument", "The function must be called with a valid userId.");
  }

  try {
    // 2. Auth Lockout: Permanently prevent the user from logging in
    console.log(`Disabling user: ${userId}`);
    await admin.auth().updateUser(userId, { disabled: true });

    // 3. Session Revocation: Kick them out immediately
    console.log(`Revoking tokens for user: ${userId}`);
    await admin.auth().revokeRefreshTokens(userId);

    // 4. Firestore Soft Delete: Update status and timestamp
    console.log(`Updating Firestore for user: ${userId}`);
    const userRef = db.collection("user").doc(userId);
    await userRef.update({
      status: "deleted",
      deleted_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: `User ${userId} has been soft deleted successfully.`
    };
  } catch (error) {
    console.error("Error in softDeleteUser:", error);
    
    // Handle specific Auth errors
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError("not-found", "The specified user was not found in Firebase Authentication.");
    }

    throw new HttpsError("internal", error.message || "An error occurred while attempting to soft delete the user.");
  }
});

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
