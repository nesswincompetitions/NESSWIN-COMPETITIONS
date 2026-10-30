import {
  ADJUSTMENT_MAX_TICKETS,
  getCompetitionAdjustmentBlock,
  getReferenceId,
  isFiniteNonNegativeInteger,
  isWinnerTicket,
  normalizeRequestId,
  ticketBelongsToCompetition,
  ticketBelongsToUser,
} from "./ticketAdjustmentPolicy.js";
import { getTicketOrigin } from "./ticketOrigin.js";
import { normalizeTicketStatus } from "./ticketEligibility.js";
import {
  TICKET_ADJUSTMENTS_COLLECTION,
  adjustmentReplayMatches,
  buildTicketAdjustmentRecord,
} from "./ticketAdjustmentAudit.js";

export const INVALIDATION_MAX_TICKETS = ADJUSTMENT_MAX_TICKETS;

async function fetchUserTicketDocs(db, userId, userRef) {
  const queries = [
    db.collection("ticket").where("user_id", "==", userRef).get(),
    db.collection("ticket").where("user_id", "==", userId).get(),
    db.collection("ticket").where("user_id", "==", `/user/${userId}`).get(),
    db.collection("ticket").where("user_ref", "==", userRef).get(),
    db.collection("ticket").where("user", "==", userRef).get(),
  ];

  const snapshots = await Promise.all(queries);
  const uniqueDocs = new Map();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnap) => {
      if (!uniqueDocs.has(docSnap.id)) {
        uniqueDocs.set(docSnap.id, docSnap);
      }
    });
  });

  return Array.from(uniqueDocs.values());
}

function normalizeSelectedTicketIds(ticketIds) {
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return { error: "ticketIds must be a non-empty array when provided." };
  }
  if (ticketIds.length > INVALIDATION_MAX_TICKETS) {
    return { error: `Maximum ${INVALIDATION_MAX_TICKETS} tickets can be invalidated per request.` };
  }
  if (ticketIds.some((id) => typeof id !== "string" || !id.trim())) {
    return { error: "ticketIds must contain non-empty string values." };
  }

  const normalized = ticketIds.map((id) => id.trim());
  if (new Set(normalized).size !== normalized.length) {
    return { error: "ticketIds must not contain duplicates." };
  }

  return { ticketIds: normalized };
}

function buildInvalidationResult(ticketIds, ticketSequences, totalRelevantCount) {
  return {
    success: true,
    complete: true,
    invalidatedCount: ticketIds.length,
    alreadyInvalidCount: 0,
    cancelledCount: 0,
    skippedCount: 0,
    totalRelevantCount,
    ticketIds,
    ticketSequences,
  };
}

export function createInvalidateUserCompetitionTicketsHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
}) {
  return async function handleInvalidateUserCompetitionTickets(request) {
    const adminUid = await assertAdmin(request);
    const { userId, competitionId, reason, ticketIds, requestId } = request.data || {};

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }
    if (!competitionId || typeof competitionId !== "string") {
      throw new HttpsError("invalid-argument", "competitionId is required.");
    }
    const reasonText = typeof reason === "string" ? reason.trim() : "";
    if (!reasonText) {
      throw new HttpsError("invalid-argument", "A reason is required to invalidate tickets.");
    }

    const hasExplicitSelection = ticketIds !== undefined;
    const selectedIdsResult = hasExplicitSelection
      ? normalizeSelectedTicketIds(ticketIds)
      : { ticketIds: null };
    if (selectedIdsResult.error) {
      throw new HttpsError("invalid-argument", selectedIdsResult.error);
    }
    const selectedTicketIds = selectedIdsResult.ticketIds;

    let normalizedRequestId = null;
    if (hasExplicitSelection) {
      normalizedRequestId = normalizeRequestId(requestId);
      if (!normalizedRequestId) {
        throw new HttpsError(
          "invalid-argument",
          "A valid requestId is required for selected-ticket invalidation."
        );
      }
    } else if (requestId !== undefined) {
      throw new HttpsError(
        "invalid-argument",
        "requestId is only supported when ticketIds are provided."
      );
    }

    const userRef = db.collection("user").doc(userId);
    const competitionRef = db.collection("competition").doc(competitionId);
    const adminRef = db.collection("user").doc(adminUid);
    const replayExpectation = hasExplicitSelection
      ? {
          operation: "ticket_invalidation",
          source: "admin_selected_tickets",
          direction: "decrease",
          quantity: selectedTicketIds.length,
          ticketIds: selectedTicketIds,
          reason: reasonText,
          userRef,
          competitionRef,
          primaryOrderRef: null,
        }
      : null;

    // A completed request remains replayable even if the competition has since
    // entered a blocked draw or finality state. Authorization already ran above.
    if (hasExplicitSelection) {
      const existingAdjustment = await db.collection(TICKET_ADJUSTMENTS_COLLECTION)
        .doc(normalizedRequestId)
        .get();
      if (existingAdjustment.exists) {
        const existing = existingAdjustment.data();
        if (!adjustmentReplayMatches(existing, replayExpectation)) {
          throw new HttpsError(
            "failed-precondition",
            "This request ID was already used for a different ticket adjustment."
          );
        }
        return existing.result;
      }
    }

    const [userSnap, competitionSnap] = await Promise.all([
      userRef.get(),
      competitionRef.get(),
    ]);

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    if (!competitionSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }

    // Draw date and finality state remain required for every invalidation path,
    // including legacy all-active calls. Inventory counters are not used here.
    const preflightBlock = getCompetitionAdjustmentBlock(competitionSnap.data(), {
      allowSoldOut: true,
      requireDrawDate: true,
    });
    if (preflightBlock) {
      throw new HttpsError("failed-precondition", preflightBlock);
    }

    if (hasExplicitSelection) {
      const result = await db.runTransaction(async (transaction) => {
        const adjustmentRef = db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc(normalizedRequestId);
        const existingAdjustment = await transaction.get(adjustmentRef);
        if (existingAdjustment.exists) {
          const existing = existingAdjustment.data();
          if (!adjustmentReplayMatches(existing, replayExpectation)) {
            throw new HttpsError(
              "failed-precondition",
              "This request ID was already used for a different ticket adjustment."
            );
          }
          return existing.result;
        }

        const freshCompetitionSnap = await transaction.get(competitionRef);
        if (!freshCompetitionSnap.exists) {
          throw new HttpsError("not-found", "Competition not found.");
        }
        const freshBlock = getCompetitionAdjustmentBlock(freshCompetitionSnap.data(), {
          allowSoldOut: true,
          requireDrawDate: true,
        });
        if (freshBlock) {
          throw new HttpsError("failed-precondition", freshBlock);
        }

        const ticketRefs = selectedTicketIds.map((id) => db.collection("ticket").doc(id));
        const ticketSnaps = await Promise.all(ticketRefs.map((ref) => transaction.get(ref)));
        const ticketSequences = [];
        const ticketNumbers = [];
        const ticketOrigins = [];
        const orderRefs = [];
        const seenOrderIds = new Set();

        ticketSnaps.forEach((ticketSnap, index) => {
          if (!ticketSnap.exists) {
            throw new HttpsError(
              "failed-precondition",
              "A selected ticket no longer exists. No tickets were changed."
            );
          }

          const ticketData = ticketSnap.data();
          if (
            !ticketBelongsToUser(ticketData, userId) ||
            !ticketBelongsToCompetition(ticketData, competitionId)
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Every selected ticket must belong to the specified user and competition. No tickets were changed."
            );
          }
          if (isWinnerTicket(ticketData)) {
            throw new HttpsError(
              "failed-precondition",
              "Winning tickets cannot be invalidated. No tickets were changed."
            );
          }
          if (normalizeTicketStatus(ticketData.status) !== "active") {
            throw new HttpsError(
              "failed-precondition",
              "Every selected ticket must be active. No tickets were changed."
            );
          }

          ticketSequences.push(
            ticketData.ticket_sequence ?? ticketData.ticket_number ?? selectedTicketIds[index]
          );
          ticketNumbers.push(
            isFiniteNonNegativeInteger(ticketData.ticket_number)
              ? ticketData.ticket_number
              : null
          );
          ticketOrigins.push(getTicketOrigin(ticketData));

          const orderId = getReferenceId(ticketData.order_id);
          if (orderId && !seenOrderIds.has(orderId)) {
            seenOrderIds.add(orderId);
            orderRefs.push(ticketData.order_id);
          }
        });

        const now = admin.firestore.FieldValue.serverTimestamp();
        ticketRefs.forEach((ref) => {
          transaction.update(ref, {
            status: "invalid",
            invalidated_at: now,
            invalidated_by: adminRef,
            invalidation_reason: reasonText,
            status_before_invalidation: "active",
            updated_at: now,
          });
        });

        const result = buildInvalidationResult(
          selectedTicketIds,
          ticketSequences,
          selectedTicketIds.length
        );

        transaction.set(
          adjustmentRef,
          buildTicketAdjustmentRecord({
            operation: "ticket_invalidation",
            source: "admin_selected_tickets",
            userRef,
            competitionRef,
            orderRefs,
            primaryOrderRef: orderRefs[0] || null,
            quantity: selectedTicketIds.length,
            direction: "decrease",
            ticketIds: selectedTicketIds,
            ticketNumbers,
            ticketSequences,
            ticketOrigins,
            quantityScope: "selected_active_tickets",
            previousQuantity: selectedTicketIds.length,
            newQuantity: 0,
            // The selected set is the only active-ticket scope verified here.
            activeCountScope: "selected_tickets",
            activeCountBefore: null,
            activeCountAfter: null,
            selectedCountBefore: selectedTicketIds.length,
            selectedCountAfter: 0,
            inventoryBefore: null,
            inventoryAfter: null,
            reason: reasonText,
            actorRef: adminRef,
            actorRole: "admin",
            paymentEffect: "none",
            requestId: normalizedRequestId,
            result,
            serverNow: now,
          })
        );

        return result;
      });

      logger.info(
        `[invalidateUserCompetitionTickets] admin=${adminUid} user=${userId} competition=${competitionId} selectedInvalidated=${result.invalidatedCount}`
      );

      return result;
    }

    const userTicketDocs = await fetchUserTicketDocs(db, userId, userRef);
    const relevantTickets = userTicketDocs.filter((docSnap) =>
      ticketBelongsToCompetition(docSnap.data(), competitionId)
    );

    if (relevantTickets.length > INVALIDATION_MAX_TICKETS) {
      throw new HttpsError(
        "failed-precondition",
        `This user has ${relevantTickets.length} tickets in this competition. The safe limit for one invalidation request is ${INVALIDATION_MAX_TICKETS}. No tickets were changed.`
      );
    }

    if (relevantTickets.length === 0) {
      return {
        success: true,
        complete: true,
        invalidatedCount: 0,
        alreadyInvalidCount: 0,
        cancelledCount: 0,
        skippedCount: 0,
        totalRelevantCount: 0,
        ticketIds: [],
        ticketSequences: [],
      };
    }

    const result = await db.runTransaction(async (transaction) => {
      const freshCompetitionSnap = await transaction.get(competitionRef);

      if (!freshCompetitionSnap.exists) {
        throw new HttpsError("not-found", "Competition not found.");
      }
      const freshBlock = getCompetitionAdjustmentBlock(freshCompetitionSnap.data(), {
        allowSoldOut: true,
        requireDrawDate: true,
      });
      if (freshBlock) {
        throw new HttpsError("failed-precondition", freshBlock);
      }

      const ticketSnaps = await Promise.all(
        relevantTickets.map((docSnap) => transaction.get(docSnap.ref))
      );

      const toInvalidate = [];
      const alreadyInvalid = [];
      const cancelled = [];
      const skipped = [];

      ticketSnaps.forEach((ticketSnap, index) => {
        const expectedDoc = relevantTickets[index];

        if (!ticketSnap.exists) {
          throw new HttpsError(
            "aborted",
            "A ticket changed while preparing this invalidation. No tickets were changed; retry the request."
          );
        }

        const ticketData = ticketSnap.data();

        if (
          !ticketBelongsToUser(ticketData, userId) ||
          !ticketBelongsToCompetition(ticketData, competitionId)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "A ticket no longer belongs to the selected user and competition. No tickets were changed."
          );
        }

        if (isWinnerTicket(ticketData)) {
          throw new HttpsError(
            "failed-precondition",
            "A winning ticket was found for this user. Winner tickets cannot be invalidated."
          );
        }

        const status = normalizeTicketStatus(ticketData.status);
        if (status === "active") {
          toInvalidate.push({
            ref: expectedDoc.ref,
            sequence: ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id,
            ticketNumber: isFiniteNonNegativeInteger(ticketData.ticket_number)
              ? ticketData.ticket_number
              : null,
            origin: getTicketOrigin(ticketData),
            orderRef: ticketData.order_id || null,
          });
        } else if (status === "invalid") {
          alreadyInvalid.push(ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id);
        } else if (status === "cancelled") {
          cancelled.push(ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id);
        } else {
          skipped.push(ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id);
        }
      });

      if (toInvalidate.length === 0) {
        return {
          success: true,
          complete: true,
          invalidatedCount: 0,
          alreadyInvalidCount: alreadyInvalid.length,
          cancelledCount: cancelled.length,
          skippedCount: skipped.length,
          totalRelevantCount: ticketSnaps.length,
          ticketIds: [],
          ticketSequences: [],
        };
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      toInvalidate.forEach(({ ref }) => {
        transaction.update(ref, {
          status: "invalid",
          invalidated_at: now,
          invalidated_by: adminRef,
          invalidation_reason: reasonText,
          status_before_invalidation: "active",
          updated_at: now,
        });
      });

      const orderRefs = [];
      const seenOrderIds = new Set();
      toInvalidate.forEach(({ orderRef }) => {
        const orderId = getReferenceId(orderRef);
        if (orderId && !seenOrderIds.has(orderId)) {
          seenOrderIds.add(orderId);
          orderRefs.push(orderRef);
        }
      });

      const result = {
        success: true,
        complete: true,
        invalidatedCount: toInvalidate.length,
        alreadyInvalidCount: alreadyInvalid.length,
        cancelledCount: cancelled.length,
        skippedCount: skipped.length,
        totalRelevantCount: ticketSnaps.length,
        ticketIds: toInvalidate.map(({ ref }) => ref.id),
        ticketSequences: toInvalidate.map(({ sequence }) => sequence),
      };

      const adjustmentRef = db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc();
      transaction.set(
        adjustmentRef,
        buildTicketAdjustmentRecord({
          operation: "ticket_invalidation",
          source: "admin_all_active_tickets",
          userRef,
          competitionRef,
          orderRefs,
          primaryOrderRef: orderRefs[0] || null,
          quantity: toInvalidate.length,
          direction: "decrease",
          ticketIds: result.ticketIds,
          ticketNumbers: toInvalidate.map(({ ticketNumber }) => ticketNumber),
          ticketSequences: result.ticketSequences,
          ticketOrigins: toInvalidate.map(({ origin }) => origin),
          quantityScope: "all_active_tickets",
          previousQuantity: toInvalidate.length,
          newQuantity: 0,
          activeCountScope: "all_active_tickets",
          activeCountBefore: toInvalidate.length,
          activeCountAfter: 0,
          selectedCountBefore: toInvalidate.length,
          selectedCountAfter: 0,
          reason: reasonText,
          actorRef: adminRef,
          actorRole: "admin",
          paymentEffect: "none",
          requestId: null,
          result,
          serverNow: now,
        })
      );

      return result;
    });

    logger.info(
      `[invalidateUserCompetitionTickets] admin=${adminUid} user=${userId} competition=${competitionId} invalidated=${result.invalidatedCount} alreadyInvalid=${result.alreadyInvalidCount} cancelled=${result.cancelledCount} skipped=${result.skippedCount}`
    );

    return result;
  };
}
