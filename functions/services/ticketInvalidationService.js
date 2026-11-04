import {
  ADJUSTMENT_MAX_TICKETS,
  getCompetitionAdjustmentBlock,
  getPostDrawCorrectionBlock,
  getReferenceId,
  isFiniteNonNegativeInteger,
  isParticipantRestricted,
  isWinnerTicket,
  normalizeAdjustmentReason,
  normalizeRequestId,
  PARTICIPANT_RESTRICTION_FIELD,
  ticketBelongsToCompetition,
  ticketBelongsToUser,
} from "./ticketAdjustmentPolicy.js";
import { getTicketOrigin } from "./ticketOrigin.js";
import { normalizeTicketStatus } from "./ticketEligibility.js";
import { enforceAdditionalPaymentRestriction } from "./additionalPaymentService.js";
import { reconcilePendingOrdersForParticipantRestriction } from "./orderTransactionService.js";
import {
  TICKET_ADJUSTMENTS_COLLECTION,
  adjustmentReplayMatches,
  assertRequestIdNotUsedByParticipantRemoval,
  assertRequestIdNotUsedByParticipantRemovalInTransaction,
  assertRequestIdNotUsedByUnsuffixedOperationInTransaction,
  buildParticipantRemovalChunkId,
  buildTicketAdjustmentRecord,
} from "./ticketAdjustmentAudit.js";
import {
  AUDIT_ACTIONS,
  buildTicketAdjustmentAuditEvent,
  createAdminAuditActor,
  createAdminAuditService,
} from "./adminAuditService.js";

export const INVALIDATION_MAX_TICKETS = ADJUSTMENT_MAX_TICKETS;
export const PARTICIPANT_REMOVAL_CHUNK_SIZE = ADJUSTMENT_MAX_TICKETS;
export const PARTICIPANT_REMOVAL_MAX_CHUNKS_PER_CALL = 10;

export const PARTICIPANT_REMOVAL_MODES = Object.freeze({
  INVALIDATE_ONLY: "invalidate_only",
  REMOVE_AND_BLOCK: "remove_and_block",
});

function normalizeParticipantRemovalMode(value, HttpsError) {
  if (value === undefined || value === null || value === "") {
    return PARTICIPANT_REMOVAL_MODES.INVALIDATE_ONLY;
  }
  if (
    value === PARTICIPANT_REMOVAL_MODES.INVALIDATE_ONLY ||
    value === PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK
  ) {
    return value;
  }
  throw new HttpsError(
    "invalid-argument",
    "mode must be invalidate_only or remove_and_block."
  );
}

function requestRestrictsParticipation(removalMode) {
  return removalMode === PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK;
}

function storedRestrictsParticipation(record) {
  return record?.result?.restrictedFutureParticipation === true;
}

function assertRemovalRecordMatches(record, expected, HttpsError) {
  if (record?.result?.mode === "participant_removal" && record.result.noop === true) {
    if (!isParticipantRemovalNoop(record, expected)) {
      throw new HttpsError(
        "failed-precondition",
        "This request ID was already used for a different ticket adjustment."
      );
    }
    return;
  }

  if (
    record?.operation === "ticket_invalidation" &&
    record?.source === "admin_all_active_tickets"
  ) {
    assertChunkIdentity(record, expected, HttpsError);
    return;
  }

  throw new HttpsError(
    "failed-precondition",
    "This request ID was already used for a different ticket adjustment."
  );
}

async function assertParticipantRemovalRequestIdentity({
  db,
  readDocument,
  requestId,
  userId,
  competitionId,
  reasonText,
  restrictedFutureParticipation,
  HttpsError,
}) {
  if (!requestId) return;

  const expected = {
    requestId,
    userId,
    competitionId,
    reasonText,
    restrictedFutureParticipation,
  };
  const adjustmentRefs = [
    db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc(requestId),
    db
      .collection(TICKET_ADJUSTMENTS_COLLECTION)
      .doc(buildParticipantRemovalChunkId(requestId, 0)),
  ];

  for (const adjustmentRef of adjustmentRefs) {
    const snap = await readDocument(adjustmentRef);
    if (!snap.exists) continue;
    assertRemovalRecordMatches(snap.data(), expected, HttpsError);
  }
}

async function applyParticipantRestriction({
  db,
  admin,
  auditService,
  competitionRef,
  userRef,
  userId,
  competitionId,
  adminUid,
  reasonText,
  requestId,
  HttpsError,
}) {
  return db.runTransaction(async (transaction) => {
    await assertParticipantRemovalRequestIdentity({
      db,
      readDocument: (ref) => transaction.get(ref),
      requestId,
      userId,
      competitionId,
      reasonText,
      restrictedFutureParticipation: true,
      HttpsError,
    });

    const competitionSnap = await transaction.get(competitionRef);
    if (!competitionSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }

    const competitionData = competitionSnap.data();

    // A retried/completed removal remains replayable after the draw has been
    // protected. The restriction fence is already durable in that case.
    if (isParticipantRestricted(competitionData, userId)) {
      return { applied: false, alreadyRestricted: true };
    }

    const block = getCompetitionAdjustmentBlock(competitionData, {
      allowSoldOut: true,
      requireDrawDate: true,
    });
    if (block) {
      throw new HttpsError("failed-precondition", block);
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(competitionRef, {
      [PARTICIPANT_RESTRICTION_FIELD]: admin.firestore.FieldValue.arrayUnion(
        userRef
      ),
      updated_at: now,
    });

    auditService.recordEventInTransaction(
      transaction,
      {
        action: AUDIT_ACTIONS.PARTICIPANT_RESTRICTED,
        entity_type: "competition",
        entity_id: competitionId,
        summary: `Blocked ${userId} from future participation in ${competitionId}.`,
        reason: reasonText,
        before: { restricted: false },
        after: { restricted: true },
        related: {
          user_id: userId,
          competition_id: competitionId,
        },
        source: "ticketInvalidationService.removeAndBlock",
        correlation_id: requestId,
      },
      { actor: createAdminAuditActor(adminUid) }
    );

    return { applied: true, alreadyRestricted: false };
  });
}

// Scalability note: this runs five unbounded equality queries and deduplicates
// in memory because historical tickets use several user-reference formats.
// Cost grows with all tickets owned by the user across competitions, and every
// chunked participant-removal call repeats this prefetch. Pagination is not
// used because the operation needs a complete eligible set to compute stable
// chunk progress; adding it would require a durable ordering/cursor contract.
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

function getTicketSortNumber(data) {
  return isFiniteNonNegativeInteger(data?.ticket_number)
    ? data.ticket_number
    : Number.MAX_SAFE_INTEGER;
}

function sortTicketDocs(ticketDocs) {
  return [...ticketDocs].sort((left, right) => {
    const numberDiff = getTicketSortNumber(left.data()) - getTicketSortNumber(right.data());
    if (numberDiff !== 0) return numberDiff;
    return left.id.localeCompare(right.id);
  });
}

function classifyParticipantTickets(ticketDocs, userId, competitionId) {
  const relevant = [];
  const active = [];
  const alreadyInvalid = [];
  const cancelled = [];
  const skipped = [];
  const winners = [];

  ticketDocs.forEach((docSnap) => {
    const data = docSnap.data();
    if (!ticketBelongsToCompetition(data, competitionId)) return;
    relevant.push(docSnap);

    if (isWinnerTicket(data)) {
      winners.push(docSnap);
      return;
    }

    const status = normalizeTicketStatus(data.status);
    if (status === "active") {
      active.push(docSnap);
    } else if (status === "invalid") {
      alreadyInvalid.push(docSnap);
    } else if (status === "cancelled") {
      cancelled.push(docSnap);
    } else {
      skipped.push(docSnap);
    }
  });

  return {
    relevant: sortTicketDocs(relevant),
    active: sortTicketDocs(active),
    alreadyInvalid,
    cancelled,
    skipped,
    winners,
  };
}

function isParticipantRemovalNoop(existing, expected) {
  const existingUser = existing.user_ref?.id || existing.user_ref;
  const existingCompetition = existing.competition_ref?.id || existing.competition_ref;
  const existingReason = typeof existing.reason === "string" ? existing.reason.trim() : "";

  return (
    existing.operation === "ticket_invalidation" &&
    existing.source === "admin_all_active_tickets" &&
    existing.request_id === expected.requestId &&
    existing.result?.mode === "participant_removal" &&
    existing.result?.noop === true &&
    Number(existing.quantity) === 0 &&
    existingUser === expected.userId &&
    existingCompetition === expected.competitionId &&
    existingReason === expected.reasonText &&
    storedRestrictsParticipation(existing) ===
      (expected.restrictedFutureParticipation === true)
  );
}

function assertChunkIdentity(existing, expected, HttpsError) {
  const existingUser = existing.user_ref?.id || existing.user_ref;
  const existingCompetition = existing.competition_ref?.id || existing.competition_ref;
  const existingReason = typeof existing.reason === "string" ? existing.reason.trim() : "";

  if (
    existing.operation !== "ticket_invalidation" ||
    existing.source !== "admin_all_active_tickets" ||
    existing.request_id !== expected.requestId ||
    existingUser !== expected.userId ||
    existingCompetition !== expected.competitionId ||
    existingReason !== expected.reasonText ||
    storedRestrictsParticipation(existing) !==
      (expected.restrictedFutureParticipation === true)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different ticket adjustment."
    );
  }
}

async function findParticipantRemovalProgress(
  db,
  expected,
  activeTicketIds,
  HttpsError
) {
  let chunkIndex = 0;
  let processedCount = 0;
  const processedTicketIds = new Set();

  while (true) {
    const chunkRef = db
      .collection(TICKET_ADJUSTMENTS_COLLECTION)
      .doc(buildParticipantRemovalChunkId(expected.requestId, chunkIndex));
    const chunkSnap = await chunkRef.get();
    if (!chunkSnap.exists) break;

    const chunk = chunkSnap.data();
    assertChunkIdentity(chunk, expected, HttpsError);

    if (!isFiniteNonNegativeInteger(Number(chunk.quantity))) {
      throw new HttpsError(
        "failed-precondition",
        "A participant removal chunk has a malformed quantity. Resolve the operation before retrying."
      );
    }

    const ticketIds = Array.isArray(chunk.ticket_ids) ? chunk.ticket_ids : [];
    ticketIds.forEach((ticketId) => {
      const normalized = String(ticketId || "").trim();
      if (!normalized) return;
      if (activeTicketIds.has(normalized)) {
        throw new HttpsError(
          "failed-precondition",
          "A previously processed participant removal ticket is still active. Resolve the operation before retrying."
        );
      }
      processedTicketIds.add(normalized);
    });

    processedCount += Number(chunk.quantity);
    chunkIndex += 1;
  }

  return { nextChunkIndex: chunkIndex, processedCount, processedTicketIds };
}

async function invalidateTicketsInTransaction({
  db,
  admin,
  auditService,
  transaction,
  adminUid,
  adminRef,
  userRef,
  userId,
  competitionRef,
  competitionId,
  ticketRefs,
  ticketIds,
  reasonText,
  adjustmentId,
  requestId,
  source,
  adjustmentExtras = {},
  resultExtras = {},
  postDrawCorrection = false,
  HttpsError,
}) {
  const freshCompetitionSnap = await transaction.get(competitionRef);
  if (!freshCompetitionSnap.exists) {
    throw new HttpsError("not-found", "Competition not found.");
  }

  const freshCompetitionData = freshCompetitionSnap.data();
  const freshBlock = postDrawCorrection
    ? getPostDrawCorrectionBlock(freshCompetitionData)
    : getCompetitionAdjustmentBlock(freshCompetitionData, {
        allowSoldOut: true,
        requireDrawDate: true,
      });
  if (freshBlock) {
    throw new HttpsError("failed-precondition", freshBlock);
  }

  const winnerTicketId = postDrawCorrection
    ? getReferenceId(freshCompetitionData.winner_ticket_ref)
    : null;
  const ticketSnaps = await Promise.all(ticketRefs.map((ref) => transaction.get(ref)));
  const ticketNumbers = [];
  const ticketSequences = [];
  const ticketOrigins = [];
  const orderRefs = [];
  const orderRefsToCheck = [];
  const seenOrderIds = new Set();
  const toInvalidate = [];

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
    if (postDrawCorrection && winnerTicketId === ticketSnap.ref.id) {
      throw new HttpsError(
        "failed-precondition",
        "The published winning ticket cannot be corrected. No tickets were changed."
      );
    }
    if (normalizeTicketStatus(ticketData.status) !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "Every selected ticket must be active. No tickets were changed."
      );
    }

    const ticketId = ticketIds[index];
    toInvalidate.push({ ref: ticketSnap.ref, ticketId, data: ticketData });
    ticketSequences.push(
      ticketData.ticket_sequence ?? ticketData.ticket_number ?? ticketId
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
      if (postDrawCorrection) {
        orderRefsToCheck.push(db.collection("order").doc(orderId));
      }
    }
  });

  if (postDrawCorrection && orderRefsToCheck.length > 0) {
    const orderSnaps = await Promise.all(
      orderRefsToCheck.map((ref) => transaction.get(ref))
    );
    if (orderSnaps.some((snap) => snap.exists && snap.data()?.is_winner === true)) {
      throw new HttpsError(
        "failed-precondition",
        "A selected ticket belongs to a winning order and cannot be corrected. No tickets were changed."
      );
    }
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

  const result = {
    success: true,
    complete: true,
    invalidatedCount: toInvalidate.length,
    alreadyInvalidCount: 0,
    cancelledCount: 0,
    skippedCount: 0,
    totalRelevantCount: toInvalidate.length,
    ticketIds: toInvalidate.map(({ ticketId }) => ticketId),
    ticketSequences,
    ...resultExtras,
  };

  const adjustmentRef = db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc(adjustmentId);
  transaction.set(
    adjustmentRef,
    buildTicketAdjustmentRecord({
      operation: "ticket_invalidation",
      source,
      userRef,
      competitionRef,
      orderRefs,
      primaryOrderRef: orderRefs[0] || null,
      quantity: toInvalidate.length,
      direction: "decrease",
      ticketIds: result.ticketIds,
      ticketNumbers,
      ticketSequences,
      ticketOrigins,
      quantityScope: adjustmentExtras.quantityScope || "selected_active_tickets",
      previousQuantity: adjustmentExtras.previousQuantity ?? toInvalidate.length,
      newQuantity: adjustmentExtras.newQuantity ?? 0,
      activeCountScope: adjustmentExtras.activeCountScope || "selected_tickets",
      activeCountBefore: adjustmentExtras.activeCountBefore ?? null,
      activeCountAfter: adjustmentExtras.activeCountAfter ?? null,
      selectedCountBefore:
        adjustmentExtras.selectedCountBefore ?? toInvalidate.length,
      selectedCountAfter: adjustmentExtras.selectedCountAfter ?? 0,
      inventoryBefore: null,
      inventoryAfter: null,
      reason: reasonText,
      actorRef: adminRef,
      actorRole: "admin",
      paymentEffect: "none",
      requestId,
      result,
      serverNow: now,
    })
  );

  auditService.recordEventInTransaction(
    transaction,
    buildTicketAdjustmentAuditEvent({
      adjustmentId: adjustmentRef.id,
      requestId,
      operation: "ticket_invalidation",
      userId,
      competitionId,
      quantity: toInvalidate.length,
      direction: "decrease",
      reason: reasonText,
      summary:
        resultExtras.summary ||
        `Invalidated ${toInvalidate.length} ticket(s) for ${userId} in ${competitionId}.`,
      source,
    }),
    { actor: createAdminAuditActor(adminUid) }
  );

  return result;
}

export function createCorrectCompetitionTicketsAfterDrawHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
}) {
  const auditService = createAdminAuditService({ db, admin, logger, HttpsError });

  return async function handleCorrectCompetitionTicketsAfterDraw(request) {
    const adminUid = await assertAdmin(request);
    const { userId, competitionId, ticketIds, reason, requestId } = request.data || {};

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }
    if (!competitionId || typeof competitionId !== "string") {
      throw new HttpsError("invalid-argument", "competitionId is required.");
    }

    const reasonText = normalizeAdjustmentReason(reason);
    if (!reasonText) {
      throw new HttpsError(
        "invalid-argument",
        "A reason is required to correct tickets after the draw."
      );
    }

    const selectedIdsResult = normalizeSelectedTicketIds(ticketIds);
    if (selectedIdsResult.error) {
      throw new HttpsError("invalid-argument", selectedIdsResult.error);
    }
    const selectedTicketIds = selectedIdsResult.ticketIds;

    const normalizedRequestId = normalizeRequestId(requestId);
    if (!normalizedRequestId) {
      throw new HttpsError("invalid-argument", "A valid requestId is required.");
    }

    const userRef = db.collection("user").doc(userId);
    const competitionRef = db.collection("competition").doc(competitionId);
    const adminRef = db.collection("user").doc(adminUid);
    const replayExpectation = {
      operation: "ticket_invalidation",
      source: "admin_post_draw_correction",
      direction: "decrease",
      quantity: selectedTicketIds.length,
      ticketIds: selectedTicketIds,
      reason: reasonText,
      userRef,
      competitionRef,
      primaryOrderRef: null,
    };

    const existingAdjustment = await db
      .collection(TICKET_ADJUSTMENTS_COLLECTION)
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
      return { ...existing.result, idempotentReplay: true };
    }

    await assertRequestIdNotUsedByParticipantRemoval(
      db,
      normalizedRequestId,
      HttpsError
    );

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

    const preflightBlock = getPostDrawCorrectionBlock(competitionSnap.data());
    if (preflightBlock) {
      throw new HttpsError("failed-precondition", preflightBlock);
    }

    const result = await db.runTransaction(async (transaction) => {
      const adjustmentRef = db
        .collection(TICKET_ADJUSTMENTS_COLLECTION)
        .doc(normalizedRequestId);
      const existingAdjustment = await transaction.get(adjustmentRef);
      await assertRequestIdNotUsedByParticipantRemovalInTransaction(
        transaction,
        db,
        normalizedRequestId,
        HttpsError
      );
      if (existingAdjustment.exists) {
        const existing = existingAdjustment.data();
        if (!adjustmentReplayMatches(existing, replayExpectation)) {
          throw new HttpsError(
            "failed-precondition",
            "This request ID was already used for a different ticket adjustment."
          );
        }
        return { ...existing.result, idempotentReplay: true };
      }

      return invalidateTicketsInTransaction({
        db,
        admin,
        auditService,
        transaction,
        adminUid,
        adminRef,
        userRef,
        userId,
        competitionRef,
        competitionId,
        ticketRefs: selectedTicketIds.map((id) => db.collection("ticket").doc(id)),
        ticketIds: selectedTicketIds,
        reasonText,
        adjustmentId: normalizedRequestId,
        requestId: normalizedRequestId,
        source: "admin_post_draw_correction",
        adjustmentExtras: {
          quantityScope: "selected_post_draw_tickets",
          previousQuantity: selectedTicketIds.length,
          newQuantity: 0,
          activeCountScope: "selected_post_draw_tickets",
          activeCountBefore: null,
          activeCountAfter: null,
          selectedCountBefore: selectedTicketIds.length,
          selectedCountAfter: 0,
        },
        resultExtras: {
          mode: "post_draw_correction",
          ticketStatusBefore: "active",
          ticketStatusAfter: "invalid",
          summary: `Post-draw correction invalidated ${selectedTicketIds.length} ticket(s) for ${userId} in ${competitionId}.`,
        },
        postDrawCorrection: true,
        HttpsError,
      });
    });

    logger.info(
      `[correctCompetitionTicketsAfterDraw] admin=${adminUid} user=${userId} competition=${competitionId} corrected=${result.invalidatedCount}`
    );

    return result;
  };
}

export function createInvalidateUserCompetitionTicketsHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
  stripeFactory,
  getStripeSecretKey,
}) {
  const auditService = createAdminAuditService({ db, admin, logger, HttpsError });

  return async function handleInvalidateUserCompetitionTickets(request) {
    const adminUid = await assertAdmin(request);
    const { userId, competitionId, reason, ticketIds, requestId, mode } =
      request.data || {};

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

    const removalMode = normalizeParticipantRemovalMode(mode, HttpsError);
    const restrictedFutureParticipation =
      requestRestrictsParticipation(removalMode);

    const hasExplicitSelection = ticketIds !== undefined;
    if (hasExplicitSelection && restrictedFutureParticipation) {
      throw new HttpsError(
        "invalid-argument",
        "mode remove_and_block cannot be combined with an explicit ticket selection."
      );
    }
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
      normalizedRequestId = normalizeRequestId(requestId);
      if (!normalizedRequestId) {
        throw new HttpsError(
          "invalid-argument",
          "requestId must be a valid operation identifier when provided."
        );
      }
    }

    if (restrictedFutureParticipation && !normalizedRequestId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid requestId is required when removing and blocking a participant."
      );
    }

    const userRef = db.collection("user").doc(userId);
    const competitionRef = db.collection("competition").doc(competitionId);
    const adminRef = db.collection("user").doc(adminUid);

    if (!hasExplicitSelection) {
      await assertParticipantRemovalRequestIdentity({
        db,
        readDocument: (ref) => ref.get(),
        requestId: normalizedRequestId,
        userId,
        competitionId,
        reasonText,
        restrictedFutureParticipation,
        HttpsError,
      });
    }

    if (hasExplicitSelection) {
      const replayExpectation = {
        operation: "ticket_invalidation",
        source: "admin_selected_tickets",
        direction: "decrease",
        quantity: selectedTicketIds.length,
        ticketIds: selectedTicketIds,
        reason: reasonText,
        userRef,
        competitionRef,
        primaryOrderRef: null,
      };

      // A completed request remains replayable even if the competition has since
      // entered a blocked draw or finality state. Authorization already ran above.
      const existingAdjustment = await db
        .collection(TICKET_ADJUSTMENTS_COLLECTION)
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

      await assertRequestIdNotUsedByParticipantRemoval(
        db,
        normalizedRequestId,
        HttpsError
      );

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

      const preflightBlock = getCompetitionAdjustmentBlock(competitionSnap.data(), {
        allowSoldOut: true,
        requireDrawDate: true,
      });
      if (preflightBlock) {
        throw new HttpsError("failed-precondition", preflightBlock);
      }

      const result = await db.runTransaction(async (transaction) => {
        const adjustmentRef = db
          .collection(TICKET_ADJUSTMENTS_COLLECTION)
          .doc(normalizedRequestId);
        const existingAdjustment = await transaction.get(adjustmentRef);
        await assertRequestIdNotUsedByParticipantRemovalInTransaction(
          transaction,
          db,
          normalizedRequestId,
          HttpsError
        );
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

        return invalidateTicketsInTransaction({
          db,
          admin,
          auditService,
          transaction,
          adminUid,
          adminRef,
          userRef,
          userId,
          competitionRef,
          competitionId,
          ticketRefs: selectedTicketIds.map((id) => db.collection("ticket").doc(id)),
          ticketIds: selectedTicketIds,
          reasonText,
          adjustmentId: normalizedRequestId,
          requestId: normalizedRequestId,
          source: "admin_selected_tickets",
          adjustmentExtras: {
            quantityScope: "selected_active_tickets",
            previousQuantity: selectedTicketIds.length,
            newQuantity: 0,
            activeCountScope: "selected_tickets",
            activeCountBefore: null,
            activeCountAfter: null,
            selectedCountBefore: selectedTicketIds.length,
            selectedCountAfter: 0,
          },
          resultExtras: {
            summary: `Invalidated ${selectedTicketIds.length} selected ticket(s) for ${userId} in ${competitionId}.`,
          },
          HttpsError,
        });
      });

      logger.info(
        `[invalidateUserCompetitionTickets] admin=${adminUid} user=${userId} competition=${competitionId} selectedInvalidated=${result.invalidatedCount}`
      );

      return result;
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

    let userTicketDocs;
    let classified;

    if (restrictedFutureParticipation) {
      const alreadyRestricted = isParticipantRestricted(
        competitionSnap.data(),
        userId
      );

      if (!alreadyRestricted) {
        const preflightDocs = await fetchUserTicketDocs(db, userId, userRef);
        const preflightClassified = classifyParticipantTickets(
          preflightDocs,
          userId,
          competitionId
        );

        const preflightBlock = getCompetitionAdjustmentBlock(
          competitionSnap.data(),
          {
            allowSoldOut: true,
            requireDrawDate: true,
          }
        );
        if (preflightBlock) {
          throw new HttpsError("failed-precondition", preflightBlock);
        }
        if (preflightClassified.winners.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            "A winning ticket was found for this user. Winner tickets cannot be invalidated and the participant cannot be restricted."
          );
        }
      }

      await applyParticipantRestriction({
        db,
        admin,
        auditService,
        competitionRef,
        userRef,
        userId,
        competitionId,
        adminUid,
        reasonText,
        requestId: normalizedRequestId,
        HttpsError,
      });

      try {
        await enforceAdditionalPaymentRestriction({
          db,
          admin,
          logger,
          userId,
          competitionId,
          HttpsError,
          ...(stripeFactory ? { stripeFactory } : {}),
          ...(getStripeSecretKey ? { getStripeSecretKey } : {}),
        });
      } catch (error) {
        logger.error(
          `[invalidateUserCompetitionTickets] Outstanding payment restriction failed admin=${adminUid} user=${userId} competition=${competitionId}:`,
          error
        );
      }

      try {
        await reconcilePendingOrdersForParticipantRestriction({
          db,
          admin,
          logger,
          userId,
          competitionId,
          ...(stripeFactory ? { stripeFactory } : {}),
          ...(getStripeSecretKey ? { getStripeSecretKey } : {}),
        });
      } catch (error) {
        logger.error(
          `[invalidateUserCompetitionTickets] Ordinary pending order reconciliation failed admin=${adminUid} user=${userId} competition=${competitionId}:`,
          error
        );
      }

      // Re-fetch after the restriction fence commits. No fulfillment can create
      // tickets after the fence, so this set is stable for invalidation.
      userTicketDocs = await fetchUserTicketDocs(db, userId, userRef);
      classified = classifyParticipantTickets(
        userTicketDocs,
        userId,
        competitionId
      );
    } else {
      userTicketDocs = await fetchUserTicketDocs(db, userId, userRef);
      classified = classifyParticipantTickets(
        userTicketDocs,
        userId,
        competitionId
      );
    }

    const resultCounts = {
      alreadyInvalidCount: classified.alreadyInvalid.length,
      cancelledCount: classified.cancelled.length,
      skippedCount: classified.skipped.length,
      totalRelevantCount: classified.relevant.length,
    };
    const restrictionResultFields = {
      removalMode,
      restrictedFutureParticipation,
    };

    const buildParticipantRemovalPartialResponse = ({
      error,
      retryable,
      processedCount,
      remainingCount,
      totalEligibleCount,
      ticketIds = [],
      ticketSequences = [],
      chunksProcessed = 0,
    }) => ({
      success: false,
      complete: false,
      hasMore: remainingCount > 0,
      retryable,
      blocked: !retryable,
      error,
      mode: "participant_removal",
      operationId: normalizedRequestId,
      invalidatedCount: ticketIds.length,
      processedCount,
      remainingCount,
      totalEligibleCount,
      ticketIds,
      ticketSequences,
      chunksProcessed,
      ...resultCounts,
      ...restrictionResultFields,
      paymentEffect: "none",
    });

    if (!normalizedRequestId) {
      const preflightBlock = getCompetitionAdjustmentBlock(competitionSnap.data(), {
        allowSoldOut: true,
        requireDrawDate: true,
      });
      if (preflightBlock) {
        throw new HttpsError("failed-precondition", preflightBlock);
      }

      if (classified.winners.length > 0) {
        throw new HttpsError(
          "failed-precondition",
          "A winning ticket was found for this user. Winner tickets cannot be invalidated."
        );
      }

      if (classified.relevant.length > INVALIDATION_MAX_TICKETS) {
        throw new HttpsError(
          "failed-precondition",
          `This user has ${classified.relevant.length} tickets in this competition. The safe limit for one invalidation request is ${INVALIDATION_MAX_TICKETS}. Retry with a requestId to process this participant removal in safe chunks. No tickets were changed.`
        );
      }

      if (classified.active.length === 0) {
        return {
          success: true,
          complete: true,
          invalidatedCount: 0,
          alreadyInvalidCount: resultCounts.alreadyInvalidCount,
          cancelledCount: resultCounts.cancelledCount,
          skippedCount: resultCounts.skippedCount,
          totalRelevantCount: resultCounts.totalRelevantCount,
          ticketIds: [],
          ticketSequences: [],
          ...restrictionResultFields,
        };
      }

      const result = await db.runTransaction(async (transaction) =>
        invalidateTicketsInTransaction({
          db,
          admin,
          auditService,
          transaction,
          adminUid,
          adminRef,
          userRef,
          userId,
          competitionRef,
          competitionId,
          ticketRefs: classified.active.map((docSnap) => docSnap.ref),
          ticketIds: classified.active.map((docSnap) => docSnap.id),
          reasonText,
          adjustmentId: db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc().id,
          requestId: null,
          source: "admin_all_active_tickets",
          adjustmentExtras: {
            quantityScope: "all_active_tickets",
            previousQuantity: classified.active.length,
            newQuantity: 0,
            activeCountScope: "all_active_tickets",
            activeCountBefore: classified.active.length,
            activeCountAfter: 0,
            selectedCountBefore: classified.active.length,
            selectedCountAfter: 0,
          },
          resultExtras: {
            ...resultCounts,
            ...restrictionResultFields,
            summary: `Invalidated ${classified.active.length} active ticket(s) for ${userId} in ${competitionId}.`,
          },
          HttpsError,
        })
      );

      logger.info(
        `[invalidateUserCompetitionTickets] admin=${adminUid} user=${userId} competition=${competitionId} invalidated=${result.invalidatedCount} alreadyInvalid=${result.alreadyInvalidCount} cancelled=${result.cancelledCount} skipped=${result.skippedCount}`
      );

      return result;
    }

    const existingRequestRecord = await db
      .collection(TICKET_ADJUSTMENTS_COLLECTION)
      .doc(normalizedRequestId)
      .get();
    if (existingRequestRecord.exists) {
      const existing = existingRequestRecord.data();
      if (
        isParticipantRemovalNoop(existing, {
          requestId: normalizedRequestId,
          userId,
          competitionId,
          reasonText,
          restrictedFutureParticipation,
        })
      ) {
        return { ...existing.result, ...restrictionResultFields };
      }
      throw new HttpsError(
        "failed-precondition",
        "This request ID was already used for a different ticket adjustment."
      );
    }

    const activeTicketIds = new Set(classified.active.map((docSnap) => docSnap.id));
    const progress = await findParticipantRemovalProgress(
      db,
      {
        requestId: normalizedRequestId,
        userId,
        competitionId,
        reasonText,
        restrictedFutureParticipation,
      },
      activeTicketIds,
      HttpsError
    );

    let remainingDocs = classified.active.filter(
      (docSnap) => !progress.processedTicketIds.has(docSnap.id)
    );
    let processedCount = progress.processedCount;
    let nextChunkIndex = progress.nextChunkIndex;
    const totalEligibleCount = processedCount + remainingDocs.length;

    if (remainingDocs.length === 0) {
      if (progress.nextChunkIndex > 0) {
        return {
          success: true,
          complete: true,
          hasMore: false,
          retryable: false,
          mode: "participant_removal",
          operationId: normalizedRequestId,
          invalidatedCount: 0,
          processedCount,
          remainingCount: 0,
          totalEligibleCount: processedCount,
          ticketIds: [],
          ticketSequences: [],
          chunksProcessed: 0,
          ...resultCounts,
          ...restrictionResultFields,
          paymentEffect: "none",
        };
      }

      const noopResult = {
        success: true,
        complete: true,
        hasMore: false,
        retryable: false,
        mode: "participant_removal",
        noop: true,
        operationId: normalizedRequestId,
        invalidatedCount: 0,
        processedCount: 0,
        remainingCount: 0,
        totalEligibleCount: 0,
        ticketIds: [],
        ticketSequences: [],
        chunksProcessed: 0,
        ...resultCounts,
        ...restrictionResultFields,
        paymentEffect: "none",
      };

      return db.runTransaction(async (transaction) => {
        const existingSnap = await transaction.get(
          db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc(normalizedRequestId)
        );
        if (existingSnap.exists) {
          const existing = existingSnap.data();
          if (
            isParticipantRemovalNoop(existing, {
              requestId: normalizedRequestId,
              userId,
              competitionId,
              reasonText,
              restrictedFutureParticipation,
            })
          ) {
            return { ...existing.result, ...restrictionResultFields };
          }
          throw new HttpsError(
            "failed-precondition",
            "This request ID was already used for a different ticket adjustment."
          );
        }

        const chunkSnap = await transaction.get(
          db
            .collection(TICKET_ADJUSTMENTS_COLLECTION)
            .doc(buildParticipantRemovalChunkId(normalizedRequestId, 0))
        );
        if (chunkSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "This request ID was already used for a different ticket adjustment."
          );
        }

        const freshUserSnap = await transaction.get(userRef);
        if (!freshUserSnap.exists) {
          throw new HttpsError("not-found", "User not found.");
        }
        const freshCompetitionSnap = await transaction.get(competitionRef);
        if (!freshCompetitionSnap.exists) {
          throw new HttpsError("not-found", "Competition not found.");
        }

        const freshBlock = getCompetitionAdjustmentBlock(
          freshCompetitionSnap.data(),
          {
            allowSoldOut: true,
            requireDrawDate: true,
          }
        );
        if (freshBlock) {
          throw new HttpsError("failed-precondition", freshBlock);
        }

        const winnerTicketSnaps = await Promise.all(
          classified.winners.map((docSnap) => transaction.get(docSnap.ref))
        );
        if (
          winnerTicketSnaps.some(
            (ticketSnap) => ticketSnap.exists && isWinnerTicket(ticketSnap.data())
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            "A winning ticket was found for this user. Winner tickets cannot be invalidated."
          );
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const adjustmentRef = db
          .collection(TICKET_ADJUSTMENTS_COLLECTION)
          .doc(normalizedRequestId);

        transaction.set(
          adjustmentRef,
          buildTicketAdjustmentRecord({
            operation: "ticket_invalidation",
            source: "admin_all_active_tickets",
            userRef,
            competitionRef,
            orderRefs: [],
            primaryOrderRef: null,
            quantity: 0,
            direction: "decrease",
            ticketIds: [],
            ticketNumbers: [],
            ticketSequences: [],
            ticketOrigins: [],
            quantityScope: "participant_removal_noop",
            requestedOrigin: null,
            previousQuantity: 0,
            newQuantity: 0,
            activeCountScope: "participant_removal_noop",
            activeCountBefore: 0,
            activeCountAfter: 0,
            selectedCountBefore: 0,
            selectedCountAfter: 0,
            inventoryBefore: null,
            inventoryAfter: null,
            orderSnapshot: null,
            reason: reasonText,
            actorRef: adminRef,
            actorRole: "admin",
            paymentEffect: "none",
            requestId: normalizedRequestId,
            result: noopResult,
            serverNow: now,
          })
        );

        auditService.recordEventInTransaction(
          transaction,
          buildTicketAdjustmentAuditEvent({
            adjustmentId: adjustmentRef.id,
            requestId: normalizedRequestId,
            operation: "ticket_invalidation",
            userId,
            competitionId,
            quantity: 0,
            direction: "decrease",
            reason: reasonText,
            summary: `Participant removal reserved with no eligible tickets for ${userId} in ${competitionId}.`,
            source: "admin_all_active_tickets",
          }),
          { actor: createAdminAuditActor(adminUid) }
        );

        return noopResult;
      });
    }

    const preflightBlock = getCompetitionAdjustmentBlock(competitionSnap.data(), {
      allowSoldOut: true,
      requireDrawDate: true,
    });
    if (preflightBlock) {
      if (progress.processedCount > 0) {
        return buildParticipantRemovalPartialResponse({
          error: preflightBlock,
          retryable: false,
          processedCount,
          remainingCount: remainingDocs.length,
          totalEligibleCount: processedCount + remainingDocs.length,
        });
      }
      throw new HttpsError("failed-precondition", preflightBlock);
    }

    if (classified.winners.length > 0) {
      const winnerBlock =
        "A winning ticket was found for this user. Winner tickets cannot be invalidated.";
      if (progress.processedCount > 0) {
        return buildParticipantRemovalPartialResponse({
          error: winnerBlock,
          retryable: false,
          processedCount,
          remainingCount: remainingDocs.length,
          totalEligibleCount: processedCount + remainingDocs.length,
        });
      }
      throw new HttpsError("failed-precondition", winnerBlock);
    }

    const invalidatedTicketIds = [];
    const invalidatedTicketSequences = [];
    let chunksProcessed = 0;
    let operationError = null;

    while (
      remainingDocs.length > 0 &&
      chunksProcessed < PARTICIPANT_REMOVAL_MAX_CHUNKS_PER_CALL
    ) {
      const chunkDocs = remainingDocs.slice(0, PARTICIPANT_REMOVAL_CHUNK_SIZE);
      const chunkIds = chunkDocs.map((docSnap) => docSnap.id);
      const adjustmentId = buildParticipantRemovalChunkId(
        normalizedRequestId,
        nextChunkIndex
      );

      try {
        const result = await db.runTransaction(async (transaction) => {
          const adjustmentRef = db
            .collection(TICKET_ADJUSTMENTS_COLLECTION)
            .doc(adjustmentId);
          const existingAdjustment = await transaction.get(adjustmentRef);
          await assertRequestIdNotUsedByUnsuffixedOperationInTransaction(
            transaction,
            db,
            normalizedRequestId,
            HttpsError
          );
          if (existingAdjustment.exists) {
            const existing = existingAdjustment.data();
            assertChunkIdentity(
              existing,
              {
                requestId: normalizedRequestId,
                userId,
                competitionId,
                reasonText,
                restrictedFutureParticipation,
              },
              HttpsError
            );
            return existing.result;
          }

          return invalidateTicketsInTransaction({
            db,
            admin,
            auditService,
            transaction,
            adminUid,
            adminRef,
            userRef,
            userId,
            competitionRef,
            competitionId,
            ticketRefs: chunkDocs.map((docSnap) => docSnap.ref),
            ticketIds: chunkIds,
            reasonText,
            adjustmentId,
            requestId: normalizedRequestId,
            source: "admin_all_active_tickets",
            adjustmentExtras: {
              quantityScope: "participant_removal_chunk",
              previousQuantity: remainingDocs.length,
              newQuantity: remainingDocs.length - chunkDocs.length,
              activeCountScope: "participant_removal",
              activeCountBefore: remainingDocs.length,
              activeCountAfter: remainingDocs.length - chunkDocs.length,
              selectedCountBefore: chunkDocs.length,
              selectedCountAfter: 0,
            },
            resultExtras: {
              ...resultCounts,
              ...restrictionResultFields,
              mode: "participant_removal",
              operationId: normalizedRequestId,
              chunkIndex: nextChunkIndex,
              processedCount: processedCount + chunkDocs.length,
              remainingCount: remainingDocs.length - chunkDocs.length,
              totalEligibleCount,
              hasMore: remainingDocs.length - chunkDocs.length > 0,
              complete: remainingDocs.length - chunkDocs.length === 0,
              summary: `Invalidated ${chunkDocs.length} participant ticket(s) for ${userId} in ${competitionId} (chunk ${nextChunkIndex + 1}).`,
            },
            HttpsError,
          });
        });

        const resultTicketIds = Array.isArray(result?.ticketIds)
          ? result.ticketIds
          : chunkIds;
        const resultTicketSequences = Array.isArray(result?.ticketSequences)
          ? result.ticketSequences
          : [];

        invalidatedTicketIds.push(...resultTicketIds);
        invalidatedTicketSequences.push(...resultTicketSequences);

        const removedIds = new Set(resultTicketIds);
        const beforeLength = remainingDocs.length;
        remainingDocs = remainingDocs.filter(
          (docSnap) => !removedIds.has(docSnap.id)
        );
        if (remainingDocs.length === beforeLength) {
          throw new HttpsError(
            "failed-precondition",
            "A participant removal chunk did not invalidate any of the remaining tickets. Resolve the operation before retrying."
          );
        }

        processedCount += resultTicketIds.length;
        nextChunkIndex += 1;
        chunksProcessed += 1;
      } catch (error) {
        operationError = error;
        break;
      }
    }

    const remainingCount = remainingDocs.length;
    const complete = remainingCount === 0 && !operationError;

    if (operationError) {
      if (progress.processedCount === 0 && invalidatedTicketIds.length === 0) {
        throw operationError;
      }

      const retryable =
        operationError?.code !== "failed-precondition" &&
        operationError?.code !== "not-found";

      logger.error(
        `[invalidateUserCompetitionTickets] participant removal partially processed admin=${adminUid} user=${userId} competition=${competitionId} operation=${normalizedRequestId} processed=${processedCount} remaining=${remainingCount}:`,
        operationError
      );

      return buildParticipantRemovalPartialResponse({
        error:
          operationError?.message ||
          "Participant removal stopped before all eligible tickets were processed.",
        retryable,
        processedCount,
        remainingCount,
        totalEligibleCount: processedCount + remainingCount,
        ticketIds: invalidatedTicketIds,
        ticketSequences: invalidatedTicketSequences,
        chunksProcessed,
      });
    }

    logger.info(
      `[invalidateUserCompetitionTickets] admin=${adminUid} user=${userId} competition=${competitionId} participantRemoval=${normalizedRequestId} invalidated=${invalidatedTicketIds.length} processed=${processedCount} remaining=${remainingCount} complete=${complete}`
    );

    return {
      success: true,
      complete,
      hasMore: !complete,
      retryable: !complete,
      mode: "participant_removal",
      operationId: normalizedRequestId,
      invalidatedCount: invalidatedTicketIds.length,
      processedCount,
      remainingCount,
      totalEligibleCount: processedCount + remainingCount,
      ticketIds: invalidatedTicketIds,
      ticketSequences: invalidatedTicketSequences,
      chunksProcessed,
      ...resultCounts,
      ...restrictionResultFields,
      paymentEffect: "none",
    };
  };
}
