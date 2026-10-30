import { normalizeTicketStatus } from "./ticketEligibility.js";
import {
  TICKET_ADJUSTMENTS_COLLECTION,
  buildTicketAdjustmentRecord,
} from "./ticketAdjustmentAudit.js";
import { getTicketOrigin } from "./ticketOrigin.js";
import {
  getCompetitionAdjustmentBlock,
  getReferenceId,
  isWinnerTicket,
} from "./ticketAdjustmentPolicy.js";

const MAX_BATCH_OPERATIONS = 400;
const ACCOUNT_DELETION_REASON = "account_deletion";

async function loadUserTickets(db, uid, userRef) {
  const snapshots = await Promise.all([
    db.collection("ticket").where("user_id", "==", uid).get(),
    db.collection("ticket").where("user_id", "==", userRef).get(),
    db.collection("ticket").where("user_ref", "==", userRef).get(),
    db.collection("ticket").where("user", "==", userRef).get(),
  ]);

  const uniqueTickets = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((ticketDoc) => {
      uniqueTickets.set(ticketDoc.id, ticketDoc);
    });
  });

  return Array.from(uniqueTickets.values());
}

async function loadUserOrders(db, uid, userRef) {
  const snapshots = await Promise.all([
    db.collection("order").where("user_id", "==", uid).get(),
    db.collection("order").where("user_ref", "==", userRef).get(),
  ]);

  const uniqueOrders = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((orderDoc) => {
      uniqueOrders.set(orderDoc.id, orderDoc);
    });
  });

  return Array.from(uniqueOrders.values());
}

function buildOrderAnonymizationUpdate(orderData, uid, admin) {
  const updateData = { updated_at: admin.firestore.FieldValue.serverTimestamp() };

  if (orderData.customer_name) updateData.customer_name = "Anonymous";
  if (orderData.customer_email) updateData.customer_email = `deleted_${uid}@nesswin.com`;
  if (orderData.name) updateData.name = "Anonymous";
  if (orderData.email) updateData.email = `deleted_${uid}@nesswin.com`;
  if (orderData.billing_details) {
    updateData.billing_details = {
      ...orderData.billing_details,
      name: "Anonymous",
      email: `deleted_${uid}@nesswin.com`,
      phone: "",
    };
  }

  return updateData;
}

export function createSoftDeleteUserHandler({ db, admin, HttpsError }) {
  async function invalidateTicketIfSafe(ticketDoc, userRef) {
    return db.runTransaction(async (transaction) => {
      const ticketSnap = await transaction.get(ticketDoc.ref);
      if (!ticketSnap.exists) return "preserved";

      const ticketData = ticketSnap.data();
      if (isWinnerTicket(ticketData)) return "preserved";
      if (normalizeTicketStatus(ticketData.status) !== "active") return "preserved";

      const auditRef = db
        .collection(TICKET_ADJUSTMENTS_COLLECTION)
        .doc(`account_deletion_${userRef.id}_${ticketDoc.id}`);
      const auditSnap = await transaction.get(auditRef);
      if (auditSnap.exists) return "preserved";

      const competitionId = getReferenceId(ticketData.competition_id);
      if (!competitionId) return "preserved";

      const competitionRef = db.collection("competition").doc(competitionId);
      const competitionSnap = await transaction.get(competitionRef);
      if (!competitionSnap.exists) return "preserved";

      const block = getCompetitionAdjustmentBlock(competitionSnap.data(), {
        allowSoldOut: true,
        requireDrawDate: true,
      });
      if (block) return "preserved";

      const now = admin.firestore.FieldValue.serverTimestamp();
      const orderRefs = ticketData.order_id ? [ticketData.order_id] : [];
      const ticketSequence =
        ticketData.ticket_sequence ?? ticketData.ticket_number ?? ticketDoc.id;
      const result = {
        success: true,
        complete: true,
        invalidatedCount: 1,
        alreadyInvalidCount: 0,
        cancelledCount: 0,
        skippedCount: 0,
        totalRelevantCount: 1,
        ticketIds: [ticketDoc.id],
        ticketSequences: [ticketSequence],
      };

      transaction.update(ticketSnap.ref, {
        status: "invalid",
        invalidated_at: now,
        invalidated_by: userRef,
        invalidation_reason: ACCOUNT_DELETION_REASON,
        invalidation_source: ACCOUNT_DELETION_REASON,
        status_before_invalidation: "active",
        updated_at: now,
      });

      transaction.set(
        auditRef,
        buildTicketAdjustmentRecord({
          operation: "ticket_invalidation",
          source: "account_deletion",
          userRef,
          competitionRef,
          orderRefs,
          primaryOrderRef: orderRefs[0] || null,
          quantity: 1,
          direction: "decrease",
          ticketIds: [ticketDoc.id],
          ticketNumbers: [
            typeof ticketData.ticket_number === "number" ? ticketData.ticket_number : null,
          ],
          ticketSequences: [ticketSequence],
          ticketOrigins: [getTicketOrigin(ticketData)],
          quantityScope: "account_deletion_ticket",
          previousQuantity: 1,
          newQuantity: 0,
          activeCountScope: "account_deletion_ticket",
          activeCountBefore: 1,
          activeCountAfter: 0,
          selectedCountBefore: 1,
          selectedCountAfter: 0,
          reason: ACCOUNT_DELETION_REASON,
          actorRef: userRef,
          actorRole: "user",
          paymentEffect: "none",
          requestId: auditRef.id,
          result,
          serverNow: now,
        })
      );

      return "invalidated";
    });
  }

  return async function handleSoftDeleteUser(request) {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to delete your account."
      );
    }

    const uid = request.auth.uid;

    try {
      const userRef = db.collection("user").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "User not found.");
      }

      const [userTickets, userOrders] = await Promise.all([
        loadUserTickets(db, uid, userRef),
        loadUserOrders(db, uid, userRef),
      ]);

      const batches = [];
      let currentBatch = db.batch();
      let opCount = 0;

      const scheduleUpdate = (ref, data) => {
        currentBatch.update(ref, data);
        opCount += 1;
        if (opCount >= MAX_BATCH_OPERATIONS) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          opCount = 0;
        }
      };

      userOrders.forEach((orderDoc) => {
        scheduleUpdate(
          orderDoc.ref,
          buildOrderAnonymizationUpdate(orderDoc.data(), uid, admin)
        );
      });

      if (opCount > 0) {
        batches.push(currentBatch);
      }

      for (const batch of batches) {
        await batch.commit();
      }

      let ticketsInvalidated = 0;
      let ticketsPreserved = 0;

      for (const ticketDoc of userTickets) {
        const outcome = await invalidateTicketIfSafe(ticketDoc, userRef);
        if (outcome === "invalidated") {
          ticketsInvalidated += 1;
        } else {
          ticketsPreserved += 1;
        }
      }

      const existingUser = userSnap.data();
      await userRef.update({
        is_deleted: true,
        is_active: false,
        status: "deleted",
        display_name: "Anonymous",
        deleted_at: existingUser.deleted_at || admin.firestore.FieldValue.serverTimestamp(),
        email: `deleted_${uid}@nesswin.com`,
        phone_number: admin.firestore.FieldValue.delete(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      try {
        await admin.auth().deleteUser(uid);
      } catch (authError) {
        if (authError?.code !== "auth/user-not-found") {
          try {
            await userRef.update({
              is_active: true,
              updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (rollbackError) {
            console.error(
              `Failed to re-enable user ${uid} after Auth deletion failure:`,
              rollbackError
            );
          }
          throw authError;
        }
      }

      return {
        success: true,
        message: "Account successfully deleted.",
        ticketsInvalidated,
        ticketsPreserved,
      };
    } catch (error) {
      console.error(`Error deleting user ${uid}:`, error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Failed to delete account. Please try again later.",
        error.message
      );
    }
  };
}
