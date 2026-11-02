export const ADMIN_AUDIT_COLLECTION = "admin_audit_events";
export const ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 25;
export const ADMIN_AUDIT_MAX_PAGE_SIZE = 100;
export const ADMIN_AUDIT_MAX_SUMMARY_LENGTH = 500;
export const ADMIN_AUDIT_MAX_REASON_LENGTH = 2000;
export const ADMIN_AUDIT_MAX_SOURCE_LENGTH = 200;
export const ADMIN_AUDIT_MAX_ID_LENGTH = 200;
export const ADMIN_AUDIT_MAX_TICKET_IDS = 500;

export const AUDIT_ACTOR_TYPES = Object.freeze({
  ADMIN: "admin",
  SYSTEM: "system",
});

export const AUDIT_ACTIONS = Object.freeze({
  COMPETITION_CREATED: "competition.created",
  COMPETITION_UPDATED: "competition.updated",
  COMPETITION_DELETED: "competition.deleted",
  COMPETITION_HANDOVER_UPDATED: "competition.handover_updated",
  WINNER_SELECTED: "winner.selected",
  TICKET_INVALIDATED: "ticket.invalidated",
  TICKET_ADJUSTED: "ticket.adjusted",
  TICKET_QUANTITY_INCREASED: "ticket.quantity_increased",
  TICKET_QUANTITY_DECREASED: "ticket.quantity_decreased",
  PARTICIPANT_RESTRICTED: "participant.restricted",
  ORDER_UPDATED: "order.updated",
  PAYMENT_REQUEST_CREATED: "payment.request_created",
  PAYMENT_REQUEST_FULFILLED: "payment.request_fulfilled",
  PAYMENT_REQUEST_FAILED: "payment.request_failed",
  PAYMENT_REQUEST_EXPIRED: "payment.request_expired",
  PAYMENT_REQUEST_RECOVERY_ATTEMPTED: "payment.request_recovery_attempted",
  PAYMENT_RECEIVED: "payment.received",
  REFUND_ISSUED: "refund.issued",
  USER_SUSPENDED: "user.suspended",
  USER_REACTIVATED: "user.reactivated",
  USER_DELETED: "user.deleted",
  BONUS_GRANTED: "bonus.granted",
  BONUS_REVOKED: "bonus.revoked",
});

export const AUDIT_ENTITY_TYPES = Object.freeze([
  "competition",
  "winner",
  "ticket",
  "ticket_adjustment",
  "order",
  "payment",
  "refund",
  "user",
  "referral",
  "bonus_credit",
]);

const AUDIT_ACTION_VALUES = new Set(Object.values(AUDIT_ACTIONS));
const AUDIT_ENTITY_TYPE_VALUES = new Set(AUDIT_ENTITY_TYPES);
const AUDIT_ACTOR_TYPE_VALUES = new Set(Object.values(AUDIT_ACTOR_TYPES));

const SAFE_SNAPSHOT_FIELDS = new Set([
  "status",
  "is_active",
  "is_deleted",
  "role",
  "title",
  "category",
  "tag",
  "prize_name",
  "ticket_price",
  "total_tickets",
  "stock_quantity",
  "sold_tickets",
  "last_ticket_sequence",
  "draw_date",
  "total_ticket",
  "paid_ticket",
  "free_ticket",
  "free_used",
  "pack_type",
  "discount_percent",
  "subtotal",
  "discount_amount",
  "total_amount",
  "currency",
  "payment_status",
  "fulfillment_status",
  "requested_ticket_quantity",
  "unit_price",
  "issued_ticket_count",
  "expires_at_millis",
  "order_type",
  "is_winner",
  "ticket_number",
  "ticket_sequence",
  "allocation_type",
  "reward_type",
  "reward_value",
  "reward_issued",
  "reward_revoked",
  "referral_code",
  "free_tickets",
  "total_free_tickets",
  "referral_count",
  "total_tickets_bought",
  "total_spent",
  "competition_answered",
  "operation",
  "source",
  "direction",
  "quantity",
  "requested_origin",
  "previous_quantity",
  "new_quantity",
  "payment_effect",
  "refund_amount_minor",
  "refund_status",
  "refunded_amount",
  "refunded_amount_minor",
  "remaining_refundable_minor",
  "original_amount_minor",
  "invalidation_reason",
  "status_before_invalidation",
  "restricted",
  "outcome",
]);

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|api[_-]?key|authorization|cookie|session|card|cvc|cvv|iban|account[_-]?number|sort[_-]?code|billing|email|phone|address|postcode|postal|stripe|payment[_-]?intent|client[_-]?secret|display[_-]?name|user[_-]?name|customer|date[_-]?of[_-]?birth)/i;

const RELATED_ID_FIELDS = [
  "user_id",
  "competition_id",
  "order_id",
  "adjustment_id",
  "referral_id",
  "payment_request_id",
  "refund_id",
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripControlCharacters(value) {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0);
    result += code < 32 || code === 127 ? " " : character;
  }
  return result.trim();
}

function normalizeReferenceId(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parts = trimmed.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }
  if (typeof value === "object" && typeof value.id === "string" && value.id.trim()) {
    return value.id.trim();
  }
  return null;
}

function requireId(value, field, HttpsError) {
  const normalized = normalizeReferenceId(value);
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  if (normalized.length > ADMIN_AUDIT_MAX_ID_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be at most ${ADMIN_AUDIT_MAX_ID_LENGTH} characters.`
    );
  }
  return normalized;
}

function optionalId(value, field, HttpsError) {
  if (value === undefined || value === null || value === "") return null;
  return requireId(value, field, HttpsError);
}

function requireText(value, field, maxLength, HttpsError) {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  const normalized = stripControlCharacters(value);
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be at most ${maxLength} characters.`
    );
  }
  return normalized;
}

function optionalText(value, field, maxLength, HttpsError) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = stripControlCharacters(value);
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be at most ${maxLength} characters.`
    );
  }
  return normalized;
}

function isSafeSnapshotValue(value) {
  if (value === null) return true;
  const type = typeof value;
  if (type === "string") return value.length <= 500;
  if (type === "number") return Number.isFinite(value);
  if (type === "boolean") return true;
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every(isSafeSnapshotValue);
  }
  return false;
}

export function sanitizeAuditSnapshot(snapshot) {
  if (snapshot === undefined || snapshot === null) return null;
  if (!isPlainObject(snapshot)) {
    throw new TypeError("Audit before/after snapshots must be plain objects.");
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (!SAFE_SNAPSHOT_FIELDS.has(key)) continue;
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (!isSafeSnapshotValue(value)) continue;
    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function buildRelatedEntities(related, HttpsError) {
  if (related === undefined || related === null) return null;
  if (!isPlainObject(related)) {
    throw new HttpsError("invalid-argument", "related must be an object.");
  }

  const normalized = {};
  for (const field of RELATED_ID_FIELDS) {
    const value = optionalId(related[field], `related.${field}`, HttpsError);
    if (value) normalized[field] = value;
  }

  if (related.ticket_ids !== undefined) {
    if (!Array.isArray(related.ticket_ids)) {
      throw new HttpsError("invalid-argument", "related.ticket_ids must be an array.");
    }
    if (related.ticket_ids.length > ADMIN_AUDIT_MAX_TICKET_IDS) {
      throw new HttpsError(
        "invalid-argument",
        `related.ticket_ids must contain at most ${ADMIN_AUDIT_MAX_TICKET_IDS} entries.`
      );
    }
    const ticketIds = related.ticket_ids.map((value) =>
      requireId(value, "related.ticket_ids[]", HttpsError)
    );
    if (new Set(ticketIds).size !== ticketIds.length) {
      throw new HttpsError("invalid-argument", "related.ticket_ids must not contain duplicates.");
    }
    if (ticketIds.length > 0) normalized.ticket_ids = ticketIds;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function sanitizeInputSnapshot(value, field, HttpsError) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new HttpsError("invalid-argument", `${field} must be an object.`);
  }
  return sanitizeAuditSnapshot(value);
}

function buildActor(actor, HttpsError) {
  if (!isPlainObject(actor)) {
    throw new HttpsError("invalid-argument", "A trusted audit actor is required.");
  }

  const type = typeof actor.type === "string" ? actor.type.trim() : "";
  if (!AUDIT_ACTOR_TYPE_VALUES.has(type)) {
    throw new HttpsError("invalid-argument", "Unsupported audit actor type.");
  }

  if (type === AUDIT_ACTOR_TYPES.ADMIN) {
    const uid = requireId(actor.uid, "actor.uid", HttpsError);
    const role = requireText(actor.role, "actor.role", 50, HttpsError);
    return { type, uid, role };
  }

  return {
    type,
    uid: optionalId(actor.uid, "actor.uid", HttpsError),
    role: optionalText(actor.role, "actor.role", 50, HttpsError) || "system",
  };
}

export function createAdminAuditActor(uid, role = "admin") {
  return { type: AUDIT_ACTOR_TYPES.ADMIN, uid, role };
}

export function createSystemAuditActor(uid = null) {
  return { type: AUDIT_ACTOR_TYPES.SYSTEM, uid, role: "system" };
}

/**
 * Validates and normalizes an audit event. Actor identity must come from
 * trusted backend context, never from the callable payload.
 */
export function buildAdminAuditEvent(
  input,
  { actor, serverTimestamp, HttpsError } = {}
) {
  if (!isPlainObject(input)) {
    throw new HttpsError("invalid-argument", "Audit event data is required.");
  }
  if (typeof serverTimestamp !== "function") {
    throw new Error("A server timestamp provider is required for audit events.");
  }

  const action = typeof input.action === "string" ? input.action.trim() : "";
  if (!AUDIT_ACTION_VALUES.has(action)) {
    throw new HttpsError("invalid-argument", "Unsupported audit action.");
  }

  const entityType = typeof input.entity_type === "string" ? input.entity_type.trim() : "";
  if (!AUDIT_ENTITY_TYPE_VALUES.has(entityType)) {
    throw new HttpsError("invalid-argument", "Unsupported audit entity type.");
  }

  const trustedActor = buildActor(actor, HttpsError);

  return {
    action,
    entity_type: entityType,
    entity_id: requireId(input.entity_id, "entity_id", HttpsError),
    actor_type: trustedActor.type,
    actor_uid: trustedActor.uid,
    actor_role: trustedActor.role,
    summary: requireText(
      input.summary,
      "summary",
      ADMIN_AUDIT_MAX_SUMMARY_LENGTH,
      HttpsError
    ),
    reason: optionalText(
      input.reason,
      "reason",
      ADMIN_AUDIT_MAX_REASON_LENGTH,
      HttpsError
    ),
    before: sanitizeInputSnapshot(input.before, "before", HttpsError),
    after: sanitizeInputSnapshot(input.after, "after", HttpsError),
    related: buildRelatedEntities(input.related, HttpsError),
    source: requireText(
      input.source,
      "source",
      ADMIN_AUDIT_MAX_SOURCE_LENGTH,
      HttpsError
    ),
    correlation_id: optionalId(input.correlation_id, "correlation_id", HttpsError),
    created_at: serverTimestamp(),
  };
}

/**
 * Builds an audit event that references an existing ticket_adjustments record
 * instead of duplicating ticket-level history into the central audit log.
 */
export function buildTicketAdjustmentAuditEvent({
  adjustmentId,
  requestId = null,
  operation,
  userId = null,
  competitionId = null,
  orderId = null,
  quantity = null,
  direction = null,
  requestedOrigin = null,
  reason = null,
  summary = null,
  source = "ticket_adjustments",
}) {
  const actionByOperation = {
    ticket_increase: AUDIT_ACTIONS.TICKET_QUANTITY_INCREASED,
    ticket_decrease: AUDIT_ACTIONS.TICKET_QUANTITY_DECREASED,
    ticket_invalidation: AUDIT_ACTIONS.TICKET_INVALIDATED,
  };

  const originSnapshot = requestedOrigin ? { requested_origin: requestedOrigin } : {};

  return {
    action: actionByOperation[operation] || AUDIT_ACTIONS.TICKET_ADJUSTED,
    entity_type: "ticket_adjustment",
    entity_id: adjustmentId,
    summary:
      summary ||
      `Ticket adjustment ${operation || "unknown"}${
        quantity === null || quantity === undefined ? "" : ` (${quantity} ticket(s))`
      }.`,
    reason,
    before: direction ? { direction, ...originSnapshot } : null,
    after:
      quantity === null || quantity === undefined
        ? Object.keys(originSnapshot).length > 0
          ? originSnapshot
          : null
        : { quantity, ...originSnapshot },
    related: {
      adjustment_id: adjustmentId,
      user_id: userId,
      competition_id: competitionId,
      order_id: orderId,
    },
    source,
    correlation_id: requestId,
  };
}

function toPublicTimestamp(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toPublicRelated(value) {
  if (!isPlainObject(value)) return null;

  const related = {};
  for (const field of RELATED_ID_FIELDS) {
    const id = normalizeReferenceId(value[field]);
    if (id) related[field] = id;
  }

  if (Array.isArray(value.ticket_ids)) {
    const ticketIds = value.ticket_ids
      .map(normalizeReferenceId)
      .filter(Boolean)
      .slice(0, ADMIN_AUDIT_MAX_TICKET_IDS);
    if (ticketIds.length > 0) related.ticket_ids = ticketIds;
  }

  return Object.keys(related).length > 0 ? related : null;
}

function toPublicSnapshot(value) {
  if (!isPlainObject(value)) return null;
  return sanitizeAuditSnapshot(value);
}

function toPublicAuditEvent(docSnap) {
  const data = docSnap.data() || {};
  return {
    event_id: data.event_id || docSnap.id,
    action: data.action ?? null,
    entity_type: data.entity_type ?? null,
    entity_id: data.entity_id ?? null,
    actor_type: data.actor_type ?? null,
    actor_uid: data.actor_uid ?? null,
    actor_role: data.actor_role ?? null,
    summary: data.summary ?? null,
    reason: data.reason ?? null,
    before: toPublicSnapshot(data.before),
    after: toPublicSnapshot(data.after),
    related: toPublicRelated(data.related),
    source: data.source ?? null,
    correlation_id: data.correlation_id ?? null,
    created_at: toPublicTimestamp(data.created_at),
  };
}

export function createAdminAuditService({ db, admin, logger, HttpsError }) {
  const auditLogger = logger || console;

  function prepareEvent(input, trustedContext) {
    const event = buildAdminAuditEvent(input, {
      actor: trustedContext?.actor,
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      HttpsError,
    });
    const ref = db.collection(ADMIN_AUDIT_COLLECTION).doc();
    return {
      ref,
      event: { ...event, event_id: ref.id },
    };
  }

  async function recordEvent(input, trustedContext) {
    const { ref, event } = prepareEvent(input, trustedContext);

    try {
      await ref.set(event);
    } catch (error) {
      auditLogger.error("[adminAudit] Failed to persist audit event", {
        action: event.action,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        actor_type: event.actor_type,
        actor_uid: event.actor_uid,
        source: event.source,
        correlation_id: event.correlation_id,
        error: error?.message || String(error),
      });
      throw error;
    }

    return event.event_id;
  }

  function recordEventInTransaction(transaction, input, trustedContext) {
    if (!transaction || typeof transaction.set !== "function") {
      throw new TypeError("A Firestore transaction is required to record an audit event.");
    }

    const { ref, event } = prepareEvent(input, trustedContext);
    transaction.set(ref, event);
    return event.event_id;
  }

  return { recordEvent, recordEventInTransaction };
}

export function createListAdminAuditEventsHandler({ db, assertAdmin, HttpsError }) {
  return async function handleListAdminAuditEvents(request) {
    await assertAdmin(request);

    const { limit, cursor } = request.data || {};

    let pageSize = ADMIN_AUDIT_DEFAULT_PAGE_SIZE;
    if (limit !== undefined) {
      const parsedLimit =
        typeof limit === "number" || typeof limit === "string" ? Number(limit) : NaN;
      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > ADMIN_AUDIT_MAX_PAGE_SIZE
      ) {
        throw new HttpsError(
          "invalid-argument",
          `limit must be an integer between 1 and ${ADMIN_AUDIT_MAX_PAGE_SIZE}.`
        );
      }
      pageSize = parsedLimit;
    }

    const cursorId = optionalId(cursor, "cursor", HttpsError);

    let query = db.collection(ADMIN_AUDIT_COLLECTION).orderBy("created_at", "desc");

    if (cursorId) {
      const cursorSnap = await db.collection(ADMIN_AUDIT_COLLECTION).doc(cursorId).get();
      if (!cursorSnap.exists) {
        throw new HttpsError("invalid-argument", "The audit cursor is no longer valid.");
      }
      query = query.startAfter(cursorSnap);
    }

    const snapshot = await query.limit(pageSize + 1).get();
    const pageDocs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;
    const nextCursor =
      hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

    return {
      events: pageDocs.map(toPublicAuditEvent),
      nextCursor,
      hasMore,
    };
  };
}
