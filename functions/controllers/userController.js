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
    const userRef = db.collection("user").doc(uid);
    const batch = db.batch();

    // 2. Anonymize User Data & Update Status
    batch.update(userRef, {
      is_deleted: true,
      is_active: false,
      status: "deleted",
      display_name: "Anonymous",
      deleted_at: admin.firestore.FieldValue.serverTimestamp(),
      email: `deleted_${uid}@nesswin.com`,
      phone_number: admin.firestore.FieldValue.delete(),
    });

    // 3. Invalidate User's Tickets
    // Assuming ticket stores user reference in 'user_id', 'user_ref', or 'user'
    const ticketsQuery = db.collection("ticket").where("user_id", "==", uid);
    const ticketsSnap = await ticketsQuery.get();
    
    // Also check for document reference in case it's stored that way
    const ticketsRefQuery = db.collection("ticket").where("user_id", "==", userRef);
    const ticketsRefSnap = await ticketsRefQuery.get();

    const ticketsRefQuery2 = db.collection("ticket").where("user_ref", "==", userRef);
    const ticketsRefSnap2 = await ticketsRefQuery2.get();

    const ticketsRefQuery3 = db.collection("ticket").where("user", "==", userRef);
    const ticketsRefSnap3 = await ticketsRefQuery3.get();

    const allTickets = [
      ...ticketsSnap.docs, 
      ...ticketsRefSnap.docs, 
      ...ticketsRefSnap2.docs, 
      ...ticketsRefSnap3.docs
    ];
    
    // Deduplicate tickets by ID
    const uniqueTickets = new Map();
    allTickets.forEach(doc => uniqueTickets.set(doc.id, doc));

    uniqueTickets.forEach((ticketDoc) => {
      batch.update(ticketDoc.ref, { 
        status: "invalid",
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    // 4. Anonymize User's Orders
    const ordersQuery = db.collection("order").where("user_id", "==", uid);
    const ordersSnap = await ordersQuery.get();

    const ordersRefQuery = db.collection("order").where("user_ref", "==", userRef);
    const ordersRefSnap = await ordersRefQuery.get();

    const allOrders = [...ordersSnap.docs, ...ordersRefSnap.docs];
    
    const uniqueOrders = new Map();
    allOrders.forEach(doc => uniqueOrders.set(doc.id, doc));

    uniqueOrders.forEach((orderDoc) => {
      const updateData = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
      const orderData = orderDoc.data();
      
      if (orderData.customer_name) updateData.customer_name = "Anonymous";
      if (orderData.customer_email) updateData.customer_email = `deleted_${uid}@nesswin.com`;
      if (orderData.name) updateData.name = "Anonymous";
      if (orderData.email) updateData.email = `deleted_${uid}@nesswin.com`;
      if (orderData.billing_details) {
         updateData.billing_details = {
             ...orderData.billing_details,
             name: "Anonymous",
             email: `deleted_${uid}@nesswin.com`,
             phone: ""
         };
      }
      
      batch.update(orderDoc.ref, updateData);
    });

    // Commit all Firestore updates
    await batch.commit();

    // 5. Firebase Auth Hard Delete
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
