import { countTicketOrigins } from "./ticketOrigin.js";

export const TICKET_ADJUSTMENTS_COLLECTION = "ticket_adjustments";

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
