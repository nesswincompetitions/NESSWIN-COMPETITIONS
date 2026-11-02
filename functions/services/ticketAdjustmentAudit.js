import { countTicketOrigins } from "./ticketOrigin.js";
import { getReferenceId } from "./ticketAdjustmentPolicy.js";

export const TICKET_ADJUSTMENTS_COLLECTION = "ticket_adjustments";
export const PARTICIPANT_REMOVAL_DRAW_BLOCK_MESSAGE =
  "Participant removal is incomplete for at least one restricted participant. Complete the removal before starting the draw.";

// Request IDs are restricted to [A-Za-z0-9_-]. The colon keeps chunk IDs out of
// the logical request-ID namespace, so a request ID can never equal a chunk ID.
export function buildParticipantRemovalChunkId(requestId, chunkIndex) {
  return `${requestId}:chunk:${chunkIndex}`;
}

export async function assertRequestIdNotUsedByParticipantRemoval(
  db,
  requestId,
  HttpsError
) {
  if (!requestId) return;
  const chunkSnap = await db
    .collection(TICKET_ADJUSTMENTS_COLLECTION)
    .doc(buildParticipantRemovalChunkId(requestId, 0))
    .get();
  if (chunkSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different ticket adjustment."
    );
  }
}

export async function assertRequestIdNotUsedByParticipantRemovalInTransaction(
  transaction,
  db,
  requestId,
  HttpsError
) {
  if (!requestId) return;
  const chunkSnap = await transaction.get(
    db
      .collection(TICKET_ADJUSTMENTS_COLLECTION)
      .doc(buildParticipantRemovalChunkId(requestId, 0))
  );
  if (chunkSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different ticket adjustment."
    );
  }
}

export async function assertRequestIdNotUsedByUnsuffixedOperationInTransaction(
  transaction,
  db,
  requestId,
  HttpsError
) {
  if (!requestId) return;
  const adjustmentSnap = await transaction.get(
    db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc(requestId)
  );
  if (adjustmentSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different ticket adjustment."
    );
  }
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.getTime()
      : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getChunkIndex(recordId, requestId) {
  const prefix = `${requestId}:chunk:`;
  if (!recordId.startsWith(prefix)) return null;
  const suffix = recordId.slice(prefix.length);
  if (!/^(0|[1-9][0-9]*)$/.test(suffix)) return null;
  return Number(suffix);
}

function isRestrictedRemovalRecord(record, competitionId) {
  return (
    record?.operation === "ticket_invalidation" &&
    record?.source === "admin_all_active_tickets" &&
    record?.result?.restrictedFutureParticipation === true &&
    getReferenceId(record?.competition_ref) === competitionId
  );
}

function evaluateRemovalRequestGroup(records, requestId) {
  const unsuffixed = records.find((record) => record.id === requestId);
  const chunkRecords = records.filter((record) => record.id !== requestId);

  if (unsuffixed) {
    if (chunkRecords.length > 0) {
      return { complete: false, reason: "ambiguous_unsuffixed_and_chunk_records" };
    }
    if (unsuffixed.result?.mode !== "participant_removal") {
      return { complete: false, reason: "unexpected_unsuffixed_record" };
    }
    if (unsuffixed.result?.noop === true) {
      return { complete: true };
    }
    return { complete: false, reason: "unsuffixed_removal_not_noop" };
  }

  if (chunkRecords.length === 0) {
    return { complete: false, reason: "missing_chunk_records" };
  }

  const chunksByIndex = new Map();
  for (const record of chunkRecords) {
    const chunkIndex = getChunkIndex(record.id, requestId);
    if (chunkIndex === null || chunksByIndex.has(chunkIndex)) {
      return { complete: false, reason: "ambiguous_chunk_identities" };
    }
    chunksByIndex.set(chunkIndex, record);
  }

  if (!chunksByIndex.has(0)) {
    return { complete: false, reason: "missing_chunk_zero" };
  }

  let highestChunkIndex = -1;
  for (const chunkIndex of chunksByIndex.keys()) {
    highestChunkIndex = Math.max(highestChunkIndex, chunkIndex);
  }
  for (let index = 0; index <= highestChunkIndex; index += 1) {
    if (!chunksByIndex.has(index)) {
      return { complete: false, reason: "chunk_gap" };
    }
  }

  const lastChunk = chunksByIndex.get(highestChunkIndex);
  if (lastChunk?.result?.complete !== true) {
    return { complete: false, reason: "last_chunk_incomplete" };
  }

  return { complete: true };
}

/**
 * Determines whether every restricted participant has a completed
 * remove_and_block operation. Uses the existing ticket_adjustments progress
 * records: an unsuffixed noop reservation or a contiguous chunk sequence whose
 * final chunk is marked complete. Any missing, ambiguous, or incomplete latest
 * operation blocks draw progression.
 */
export async function getParticipantRemovalDrawBlock({
  db,
  competitionId,
  competitionData,
  readQuery = (query) => query.get(),
}) {
  const restrictedParticipants = Array.isArray(
    competitionData?.restricted_participants
  )
    ? competitionData.restricted_participants
    : [];
  if (restrictedParticipants.length === 0) return null;

  const competitionRef = db.collection("competition").doc(competitionId);

  for (const participant of restrictedParticipants) {
    const userId = getReferenceId(participant);
    if (!userId) {
      return `${PARTICIPANT_REMOVAL_DRAW_BLOCK_MESSAGE} A restricted participant reference is unresolved.`;
    }

    const userRef = db.collection("user").doc(userId);
    const snapshot = await readQuery(
      db
        .collection(TICKET_ADJUSTMENTS_COLLECTION)
        .where("user_ref", "==", userRef)
        .where("competition_ref", "==", competitionRef)
    );
    const records = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((record) => isRestrictedRemovalRecord(record, competitionId));

    if (records.length === 0) {
      return `${PARTICIPANT_REMOVAL_DRAW_BLOCK_MESSAGE} No completed removal record was found for participant ${userId}.`;
    }

    const groupsByRequest = new Map();
    for (const record of records) {
      const requestId =
        typeof record.request_id === "string" ? record.request_id.trim() : "";
      if (!requestId) {
        return `${PARTICIPANT_REMOVAL_DRAW_BLOCK_MESSAGE} A removal record for participant ${userId} has no request identity.`;
      }
      if (!groupsByRequest.has(requestId)) {
        groupsByRequest.set(requestId, []);
      }
      groupsByRequest.get(requestId).push(record);
    }

    const groups = [...groupsByRequest.entries()]
      .map(([requestId, groupRecords]) => ({
        requestId,
        records: groupRecords,
        latestTimestamp: Math.max(
          ...groupRecords.map((record) => timestampToMillis(record.created_at))
        ),
      }))
      .sort(
        (left, right) =>
          right.latestTimestamp - left.latestTimestamp ||
          String(right.requestId).localeCompare(String(left.requestId))
      );

    const latestGroup = groups[0];
    const tiedLatestGroups = groups.filter(
      (group) => group.latestTimestamp === latestGroup.latestTimestamp
    );

    if (latestGroup.latestTimestamp === 0 && groups.length > 1) {
      return `${PARTICIPANT_REMOVAL_DRAW_BLOCK_MESSAGE} Removal progress for participant ${userId} is ambiguous.`;
    }

    for (const group of tiedLatestGroups) {
      const evaluation = evaluateRemovalRequestGroup(group.records, group.requestId);
      if (!evaluation.complete) {
        return `${PARTICIPANT_REMOVAL_DRAW_BLOCK_MESSAGE} Participant ${userId} removal request ${group.requestId} is not complete (${evaluation.reason}).`;
      }
    }
  }

  return null;
}

export function buildTicketAdjustmentRecord({
  operation,
  source,
  userRef,
  competitionRef,
  orderRefs = [],
  primaryOrderRef = null,
  quantity,
  direction,
  ticketIds = [],
  ticketNumbers = [],
  ticketSequences = [],
  quantityScope = null,
  requestedOrigin = null,
  previousQuantity = null,
  newQuantity = null,
  activeCountScope = null,
  activeCountBefore = null,
  activeCountAfter = null,
  selectedCountBefore = null,
  selectedCountAfter = null,
  inventoryBefore = null,
  inventoryAfter = null,
  orderSnapshot = null,
  ticketOrigins = [],
  originBreakdown = null,
  actorRole = null,
  paymentEffect = "none",
  reason,
  actorRef,
  requestId,
  result,
  serverNow,
}) {
  return {
    operation,
    source,
    user_ref: userRef,
    competition_ref: competitionRef,
    order_refs: orderRefs,
    primary_order_ref: primaryOrderRef,
    quantity,
    direction,
    quantity_scope: quantityScope,
    requested_origin: requestedOrigin,
    previous_quantity: previousQuantity,
    new_quantity: newQuantity,
    ticket_ids: ticketIds,
    ticket_numbers: ticketNumbers,
    ticket_sequences: ticketSequences,
    active_count_scope: activeCountScope,
    active_count_before: activeCountBefore,
    active_count_after: activeCountAfter,
    selected_count_before: selectedCountBefore,
    selected_count_after: selectedCountAfter,
    inventory_before: inventoryBefore,
    inventory_after: inventoryAfter,
    order_snapshot: orderSnapshot,
    ticket_origins: ticketOrigins,
    origin_breakdown: originBreakdown || countTicketOrigins(ticketOrigins),
    reason,
    performed_by: actorRef,
    actor_role: actorRole,
    request_id: requestId,
    payment_effect: paymentEffect,
    result,
    created_at: serverNow,
  };
}

function normalizeReplayTicketIds(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((id) => String(id).trim()).filter(Boolean))].sort();
}

function normalizeReplayReason(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function adjustmentReplayMatches(existing, expected) {
  if (!existing || !expected) return false;
  const existingUser = existing.user_ref?.id || existing.user_ref;
  const expectedUser = expected.userRef?.id || expected.userRef;
  const existingCompetition = existing.competition_ref?.id || existing.competition_ref;
  const expectedCompetition = expected.competitionRef?.id || expected.competitionRef;
  const existingOrder = existing.primary_order_ref?.id || existing.primary_order_ref;
  const expectedOrder = expected.primaryOrderRef?.id || expected.primaryOrderRef;

  if (existing.operation !== expected.operation) return false;
  if (existing.source !== expected.source) return false;
  if (existing.direction !== expected.direction) return false;
  if (Number(existing.quantity) !== Number(expected.quantity)) return false;
  if (existingUser !== expectedUser) return false;
  if (existingCompetition !== expectedCompetition) return false;
  if (expectedOrder && existingOrder !== expectedOrder) return false;
  if (
    expected.requestedOrigin !== undefined &&
    existing.requested_origin !== expected.requestedOrigin
  ) {
    return false;
  }

  if (expected.ticketIds !== undefined) {
    const existingIds = normalizeReplayTicketIds(existing.ticket_ids);
    const expectedIds = normalizeReplayTicketIds(expected.ticketIds);
    if (!existingIds || !expectedIds) return false;
    if (existingIds.length !== expectedIds.length) return false;
    if (existingIds.some((id, index) => id !== expectedIds[index])) return false;
  }

  if (
    expected.reason !== undefined &&
    normalizeReplayReason(existing.reason) !== normalizeReplayReason(expected.reason)
  ) {
    return false;
  }

  return true;
}
