import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";

// Removed aggregateUserMetrics (now handled by dashboardController.js)

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
