import { normalizeTicketStatus } from "./ticketEligibility.js";

export const ADJUSTMENT_MAX_TICKETS = 400;
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const ADJUSTMENT_BLOCKED_STATUSES = new Set([
  "draft",
  "paused",
  "ready_to_draw",
  "drawing",
  "winner_announced",
  "completed",
  "end",
  "closed",
  "cancelled",
  "deleted",
]);

export function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function getReferenceId(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const parts = value.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }
  return value.id || null;
}

export function isWinnerTicket(data) {
  return data?.is_winner === true || normalizeTicketStatus(data?.status) === "winner";
}

export function ticketBelongsToUser(data, userId) {
  return [data?.user_id, data?.user_ref, data?.user]
    .some((value) => getReferenceId(value) === userId);
}

export function ticketBelongsToCompetition(data, competitionId) {
  return getReferenceId(data?.competition_id) === competitionId;
}

export function competitionHasWinnerReference(data) {
  return Boolean(data?.winner_ref) || Boolean(data?.winner_ticket_ref);
}

export function hasDrawStarted(data) {
  return Boolean(data?.draw_started_at);
}

export function getDrawDateState(value) {
  if (value === undefined || value === null || value === "") {
    return { present: false, valid: false, millis: null };
  }

  let millis = null;
  if (typeof value?.toMillis === "function") {
    millis = value.toMillis();
  } else if (typeof value?.toDate === "function") {
    const date = value.toDate();
    millis = date instanceof Date ? date.getTime() : null;
  } else if (value instanceof Date) {
    millis = value.getTime();
  } else if (typeof value === "number") {
    millis = value;
  } else if (typeof value === "string") {
    millis = Date.parse(value);
  } else if (typeof value?.seconds === "number") {
    millis = value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }

  return {
    present: true,
    valid: Number.isFinite(millis),
    millis: Number.isFinite(millis) ? millis : null,
  };
}

export function getCompetitionAdjustmentBlock(
  competitionData,
  { now = Date.now(), allowSoldOut = false, requireDrawDate = true } = {},
) {
  if (!competitionData) {
    return "Competition not found.";
  }

  if (competitionHasWinnerReference(competitionData)) {
    return "Tickets cannot be adjusted after a winner has been declared.";
  }

  if (hasDrawStarted(competitionData)) {
    return "Tickets cannot be adjusted after the draw has started.";
  }

  const status = normalizeStatus(competitionData.status);
  if (ADJUSTMENT_BLOCKED_STATUSES.has(status)) {
    return "Tickets cannot be adjusted after the draw has started or the competition has closed.";
  }

  const allowedStatuses = allowSoldOut ? new Set(["active", "sold_out"]) : new Set(["active"]);
  if (!allowedStatuses.has(status)) {
    return "Tickets can only be adjusted while the competition is accepting entries.";
  }

  const drawDate = getDrawDateState(competitionData.draw_date);
  if (!drawDate.present) {
    return requireDrawDate
      ? "The competition draw date is missing, so the adjustment cannot be verified safely."
      : null;
  }
  if (!drawDate.valid) {
    return "The competition draw date is invalid, so the adjustment cannot be verified safely.";
  }
  if (drawDate.millis <= now) {
    return "The competition draw date has passed, so the adjustment cannot be made.";
  }

  return null;
}

const COMPETITION_MUTATION_BLOCKED_STATUSES = new Set([
  "ready_to_draw",
  "drawing",
  "winner_announced",
  "completed",
  "end",
  "closed",
  "cancelled",
  "deleted",
]);

export function getCompetitionMutationBlock(competitionData) {
  if (!competitionData) {
    return "Competition not found.";
  }

  if (competitionHasWinnerReference(competitionData)) {
    return "Competition details cannot be changed after a winner has been declared.";
  }

  if (hasDrawStarted(competitionData)) {
    return "Competition details cannot be changed after the draw has started.";
  }

  const status = normalizeStatus(competitionData.status);
  if (COMPETITION_MUTATION_BLOCKED_STATUSES.has(status)) {
    return "Competition details cannot be changed after the draw has started or the competition has closed.";
  }

  return null;
}

export function getLiveDrawStartBlock(competitionData, { now = Date.now() } = {}) {
  if (!competitionData) {
    return "Competition not found.";
  }

  if (competitionHasWinnerReference(competitionData)) {
    return "The live draw cannot start because a winner has already been declared.";
  }

  const status = normalizeStatus(competitionData.status);
  if (status === "drawing") {
    return "The live draw has already started.";
  }
  if (status !== "ready_to_draw") {
    return "Only competitions that are ready to draw can start the live draw.";
  }

  if (!String(competitionData.instagram_live_url || "").trim()) {
    return "The Instagram Live URL is required before the live draw can start.";
  }

  const drawDate = getDrawDateState(competitionData.draw_date);
  if (!drawDate.present) {
    return "The competition draw date is missing, so the live draw cannot be started.";
  }
  if (!drawDate.valid) {
    return "The competition draw date is invalid, so the live draw cannot be started.";
  }
  if (drawDate.millis > now) {
    return "The competition draw date has not been reached yet.";
  }

  return null;
}

export function getCompetitionInventoryBlock(competitionData) {
  if (!competitionData) {
    return "Competition not found.";
  }
  if (
    !isFiniteNonNegativeInteger(competitionData.stock_quantity) ||
    !isFiniteNonNegativeInteger(competitionData.sold_tickets) ||
    !isFiniteNonNegativeInteger(competitionData.last_ticket_sequence)
  ) {
    return "Competition inventory or ticket sequence is malformed, so the adjustment cannot be verified safely.";
  }
  return null;
}

export function normalizeAdjustmentReason(reason, maxLength = 500) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function normalizeRequestId(requestId) {
  const value = typeof requestId === "string" ? requestId.trim() : "";
  return REQUEST_ID_PATTERN.test(value) ? value : null;
}

export function isFiniteNonNegativeInteger(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export function partitionRefundTickets(ticketDocs) {
  const cancellable = [];
  const preserved = [];

  ticketDocs.forEach((ticketDoc) => {
    const ticketData = ticketDoc.data();
    if (!isWinnerTicket(ticketData) && normalizeTicketStatus(ticketData?.status) !== "invalid") {
      cancellable.push(ticketDoc);
    } else {
      preserved.push(ticketDoc);
    }
  });

  return { cancellable, preserved };
}
