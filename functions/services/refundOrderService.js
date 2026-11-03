import Stripe from "stripe";
import {
  AUDIT_ACTIONS,
  createAdminAuditActor,
  createAdminAuditService,
} from "./adminAuditService.js";

export const REFUND_UNAVAILABLE_MESSAGE =
  "Refund is unavailable because no verified, settled Stripe payment is associated with this order. No order, ticket, payment, or notification data was changed.";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const REFUND_MAX_REASON_LENGTH = 500;
const REFUND_COMMITTED_STATUSES = new Set(["succeeded", "pending", "requires_action"]);
const REFUND_RESERVATION_HOLDING_STATUSES = new Set(["pending", "requires_action"]);
const REFUND_VALID_STATUSES = new Set([
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
]);
const REFUND_SUBMISSION_LEASE_MS = 2 * 60 * 1000;
const REFUND_STATUS_RANK = Object.freeze({
  pending: 1,
  requires_action: 1,
  failed: 2,
  canceled: 2,
  succeeded: 3,
});

function makeSubmissionToken() {
  return globalThis.crypto?.randomUUID?.() ||
    `refund-submit-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeRefundStatus(value) {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  return REFUND_VALID_STATUSES.has(status) ? status : null;
}

function isReservationHoldingStatus(value) {
  return REFUND_RESERVATION_HOLDING_STATUSES.has(normalizeRefundStatus(value));
}

function resolveRefundStatus(previousStatus, incomingStatus) {
  const previous = normalizeRefundStatus(previousStatus) || "pending";
  const incoming = normalizeRefundStatus(incomingStatus);
  if (!incoming) {
    throw new Error(`Unsupported Stripe refund status: ${String(incomingStatus)}`);
  }
  // Stripe `succeeded` is authoritative financial completion and may supersede
  // a previously stored failed/canceled status. Those statuses are not
  // reservation-holding, so the transition adds completed refund value without
  // releasing the reservation a second time. Succeeded never regresses.
  return REFUND_STATUS_RANK[incoming] >= REFUND_STATUS_RANK[previous]
    ? incoming
    : previous;
}

function releaseReservedAmount(currentReservedMinor, amountMinor) {
  const current = Number(currentReservedMinor) || 0;
  const amount = Number(amountMinor) || 0;
  if (amount > current) {
    return {
      reservedMinor: current,
      underflow: {
        currentReservedMinor: current,
        amountMinor: amount,
        shortfallMinor: amount - current,
      },
    };
  }
  return { reservedMinor: current - amount, underflow: null };
}

function classifyStripeRefundError(error) {
  const type = typeof error?.type === "string" ? error.type : "";
  const code = typeof error?.code === "string" ? error.code : "";
  const statusCode = Number(error?.statusCode ?? error?.status);
  const message = error?.message || "Stripe refund request failed.";

  if (
    type === "StripeIdempotencyError" ||
    code === "idempotency_key_in_use" ||
    code === "idempotency_error"
  ) {
    return { outcome: "uncertain", reason: "idempotency_conflict", message };
  }

  if (
    type === "StripeConnectionError" ||
    type === "StripeAPIError" ||
    /timeout|timedout|econn|etimedout|eai_again|network/i.test(code) ||
    /timeout|timed out|network|connection/i.test(message)
  ) {
    return { outcome: "uncertain", reason: "provider_uncertain", message };
  }

  if (
    type === "StripeRateLimitError" ||
    statusCode === 408 ||
    statusCode === 429 ||
    (Number.isFinite(statusCode) && statusCode >= 500)
  ) {
    return { outcome: "uncertain", reason: "provider_uncertain", message };
  }

  if (
    type === "StripeInvalidRequestError" ||
    type === "StripeCardError" ||
    type === "StripeAuthenticationError" ||
    type === "StripePermissionError" ||
    (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500)
  ) {
    return { outcome: "definitive_failure", reason: "provider_rejected", message };
  }

  return { outcome: "uncertain", reason: "unclassified_provider_error", message };
}

function normalizeRequestId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return REQUEST_ID_PATTERN.test(text) ? text : null;
}

function normalizeReason(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return text.slice(0, REFUND_MAX_REASON_LENGTH);
}

function normalizeAmountMinor(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function getRefundRecords(orderData) {
  return Array.isArray(orderData?.refunds) ? orderData.refunds : [];
}

function findRefundRecord(orderData, requestId) {
  return getRefundRecords(orderData).find(
    (record) => record && record.request_id === requestId
  );
}

function getStripeValue(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || null;
}

async function listRefundsForPaymentIntent(stripe, paymentIntentId) {
  const refunds = [];
  let startingAfter = null;

  do {
    const page = await stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const pageData = Array.isArray(page?.data) ? page.data : [];
    refunds.push(...pageData);
    startingAfter = page?.has_more && pageData.length > 0
      ? pageData[pageData.length - 1].id
      : null;
  } while (startingAfter);

  return refunds;
}

function summarizeStripeRefunds(refunds) {
  let previousRefundedMinor = 0;
  let succeededRefundedMinor = 0;
  let pendingRefundedMinor = 0;
  const committed = [];
  refunds.forEach((refund) => {
    const status = String(refund?.status || "");
    if (!refund || !REFUND_COMMITTED_STATUSES.has(status)) {
      return;
    }
    const amount = Number(refund.amount);
    if (Number.isSafeInteger(amount) && amount > 0) {
      previousRefundedMinor += amount;
      if (status === "succeeded") {
        succeededRefundedMinor += amount;
      } else {
        pendingRefundedMinor += amount;
      }
      committed.push(refund);
    }
  });
  return {
    previousRefundedMinor,
    succeededRefundedMinor,
    pendingRefundedMinor,
    committed,
  };
}

function localUnsubmittedReservedMinor(orderData) {
  return getRefundRecords(orderData)
    .filter(
      (record) =>
        isReservationHoldingStatus(record?.status) && !record?.refund_id
    )
    .reduce((sum, record) => {
      const amount = Number(record.amount_minor);
      return Number.isSafeInteger(amount) && amount > 0 ? sum + amount : sum;
    }, 0);
}

function toPublicRefundRecord(record) {
  if (!record || typeof record !== "object") return null;
  return {
    refund_id: record.refund_id || null,
    request_id: record.request_id || null,
    amount_minor: Number(record.amount_minor) || 0,
    currency: record.currency || "GBP",
    status: record.status || "pending",
    reason: record.reason || "",
    failure_reason: record.failure_reason || "",
    created_at: record.created_at || null,
    updated_at: record.updated_at || null,
  };
}

function buildStripeRefundMetadata(orderId, requestId, reason, adminUid) {
  return {
    orderId,
    refundRequestId: requestId,
    adminUid,
    adminReason: reason,
  };
}

async function loadStripeContext({
  HttpsError,
  orderData,
  stripeFactory,
  getStripeSecretKey,
}) {
  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe is not configured on the server, so a refund cannot be verified."
    );
  }

  const stripe = stripeFactory(stripeSecretKey);
  let paymentIntentId = getStripeValue(orderData?.stripe_payment_intent_id);

  if (!paymentIntentId && orderData?.stripe_checkout_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        orderData.stripe_checkout_session_id
      );
      paymentIntentId = getStripeValue(session?.payment_intent);
    } catch (error) {
      throw new HttpsError(
        "failed-precondition",
        `The original Stripe Checkout Session could not be verified: ${error?.message || "unknown error"}`
      );
    }
  }

  if (!paymentIntentId) {
    throw new HttpsError("failed-precondition", REFUND_UNAVAILABLE_MESSAGE);
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    throw new HttpsError(
      "failed-precondition",
      `The original Stripe payment could not be verified: ${error?.message || "unknown error"}`
    );
  }

  if (String(paymentIntent?.status || "") !== "succeeded") {
    throw new HttpsError(
      "failed-precondition",
      "Only a settled Stripe payment can be refunded."
    );
  }

  const originalAmountMinor = Number(paymentIntent.amount_received);
  if (!Number.isSafeInteger(originalAmountMinor) || originalAmountMinor <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "The settled Stripe payment amount is invalid."
    );
  }

  const orderAmountMinor = Math.round(Number(orderData?.total_amount) * 100);
  if (!Number.isSafeInteger(orderAmountMinor) || orderAmountMinor !== originalAmountMinor) {
    throw new HttpsError(
      "failed-precondition",
      "The original settled payment amount does not match the order. Refund review is required."
    );
  }

  const paymentCurrency = String(paymentIntent.currency || "").toUpperCase();
  const orderCurrency = String(orderData?.currency || "GBP").toUpperCase();
  if (!paymentCurrency || paymentCurrency !== orderCurrency) {
    throw new HttpsError(
      "failed-precondition",
      "The original payment currency does not match the order currency."
    );
  }

  const stripeRefunds = await listRefundsForPaymentIntent(stripe, paymentIntentId);
  const {
    previousRefundedMinor,
    succeededRefundedMinor,
    pendingRefundedMinor,
    committed,
  } = summarizeStripeRefunds(stripeRefunds);
  const remainingRefundableMinor = Math.max(
    0,
    originalAmountMinor - previousRefundedMinor
  );

  return {
    stripe,
    paymentIntentId,
    paymentIntent,
    originalAmountMinor,
    currency: orderCurrency,
    previousRefundedMinor,
    succeededRefundedMinor,
    pendingRefundedMinor,
    remainingRefundableMinor,
    committedRefunds: committed,
  };
}

function buildEligibilityResponse({
  orderId,
  orderData,
  context,
}) {
  const unsubmittedReserved = localUnsubmittedReservedMinor(orderData);
  return {
    orderId,
    status: orderData.status || null,
    paymentStatus: orderData.payment_status || null,
    refundStatus: orderData.refund_status || null,
    currency: context.currency,
    originalAmountMinor: context.originalAmountMinor,
    previouslyRefundedMinor: context.succeededRefundedMinor,
    pendingRefundedMinor: context.pendingRefundedMinor,
    committedRefundedMinor: context.previousRefundedMinor,
    locallyReservedMinor: unsubmittedReserved,
    remainingRefundableMinor: Math.max(
      0,
      context.remainingRefundableMinor - unsubmittedReserved
    ),
    refunds: getRefundRecords(orderData).map(toPublicRefundRecord).filter(Boolean),
    calculationBasis:
      "Derived from the original settled Stripe PaymentIntent and its Stripe refunds; not from the current competition ticket price.",
  };
}

export function createGetOrderRefundEligibilityHandler({
  db,
  assertAdmin,
  HttpsError,
  stripeFactory = (key) => new Stripe(key),
  getStripeSecretKey = () => globalThis.process?.env?.STRIPE_SECRET_KEY,
}) {
  return async function handleGetOrderRefundEligibility(request) {
    await assertAdmin(request);

    const { orderId } = request.data || {};
    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "orderId is required.");
    }

    const orderSnap = await db.collection("order").doc(orderId).get();
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const orderData = orderSnap.data();
    const orderStatus = String(orderData.status || "").toLowerCase();
    if (!["paid", "refunded"].includes(orderStatus)) {
      throw new HttpsError(
        "failed-precondition",
        "Refund eligibility is only available for paid orders."
      );
    }

    const context = await loadStripeContext({
      HttpsError,
      orderData,
      stripeFactory,
      getStripeSecretKey,
    });

    return buildEligibilityResponse({ orderId, orderData, context });
  };
}

function planPersistedRefundUpdate({
  orderData,
  originalAmountMinor,
  paymentIntentId,
  requestId,
  refundResult,
  updatedAtMillis,
  priorStripeRefundedMinor = 0,
  resultIncludedInPrior = false,
}) {
  const records = getRefundRecords(orderData);
  const recordIndex = records.findIndex(
    (record) => record && record.request_id === requestId
  );
  if (recordIndex === -1) {
    throw new Error("Refund reservation record is missing.");
  }

  const previousRecord = records[recordIndex];
  const incomingStatus = normalizeRefundStatus(refundResult?.status);
  if (!incomingStatus) {
    throw new Error(`Unsupported Stripe refund status: ${String(refundResult?.status)}`);
  }
  const nextStatus = resolveRefundStatus(previousRecord.status, incomingStatus);
  const refundId = getStripeValue(refundResult?.id) || previousRecord.refund_id || null;
  const amountMinor = Number(refundResult?.amount ?? previousRecord.amount_minor);
  const currency = String(
    refundResult?.currency || previousRecord.currency || orderData.currency || "GBP"
  ).toUpperCase();

  if (!Number.isSafeInteger(amountMinor) || amountMinor !== Number(previousRecord.amount_minor)) {
    throw new Error("Stripe refund amount does not match the stored reservation.");
  }
  if (currency !== String(previousRecord.currency || orderData.currency || "GBP").toUpperCase()) {
    throw new Error("Stripe refund currency does not match the stored reservation.");
  }
  if (
    previousRecord.refund_id &&
    refundId &&
    previousRecord.refund_id !== refundId
  ) {
    throw new Error("Stripe refund ID does not match the stored reservation.");
  }

  const wasSucceeded = previousRecord.status === "succeeded";
  const wasReserved = isReservationHoldingStatus(previousRecord.status);
  const nowSucceeded = nextStatus === "succeeded";
  const nowTerminalFailure = nextStatus === "failed" || nextStatus === "canceled";

  let reservedMinor = Number(orderData.refund_reserved_amount_minor) || 0;
  let refundedMinor = Number(orderData.refunded_amount_minor) || 0;
  let reservationUnderflow = null;

  if (!wasSucceeded && nowSucceeded) {
    if (wasReserved) {
      const release = releaseReservedAmount(reservedMinor, amountMinor);
      reservedMinor = release.reservedMinor;
      reservationUnderflow = release.underflow;
    }
    const totalCommittedAfter = priorStripeRefundedMinor + (
      resultIncludedInPrior ? 0 : amountMinor
    );
    refundedMinor = Math.max(refundedMinor, totalCommittedAfter);
  } else if (wasReserved && nowTerminalFailure) {
    const release = releaseReservedAmount(reservedMinor, amountMinor);
    reservedMinor = release.reservedMinor;
    reservationUnderflow = release.underflow;
  }

  const nextRecord = {
    ...previousRecord,
    refund_id: refundId,
    amount_minor: amountMinor,
    currency,
    status: nextStatus,
    failure_reason:
      wasSucceeded && nextStatus === "succeeded"
        ? previousRecord.failure_reason || ""
        : refundResult?.failure_reason || "",
    submission_token: nowSucceeded || nowTerminalFailure ? null : previousRecord.submission_token,
    submission_started_at: nowSucceeded || nowTerminalFailure ? null : previousRecord.submission_started_at,
    updated_at: updatedAtMillis,
  };
  const nextRecords = [...records];
  nextRecords[recordIndex] = nextRecord;

  const update = {
    refunds: nextRecords,
    refund_reserved_amount_minor: reservedMinor,
    refunded_amount_minor: refundedMinor,
    refunded_amount: refundedMinor / 100,
    last_refund_id: refundId || previousRecord.refund_id || null,
    last_refund_status: nextStatus,
    last_refund_at: updatedAtMillis,
    updated_at: updatedAtMillis,
  };

  if (nowSucceeded) {
    update.status =
      refundedMinor >= originalAmountMinor ? "Refunded" : orderData.status;
    update.payment_status =
      refundedMinor >= originalAmountMinor ? "refunded" : orderData.payment_status;
    update.refund_status =
      refundedMinor >= originalAmountMinor ? "refunded" : "partial";
    if (refundedMinor >= originalAmountMinor) {
      update.refunded_at = updatedAtMillis;
    }
  } else if (nowTerminalFailure) {
    update.refund_status =
      refundedMinor >= originalAmountMinor
        ? "refunded"
        : refundedMinor > 0
          ? "partial"
          : null;
  } else {
    update.refund_status = refundedMinor > 0 ? "partial" : "pending";
  }

  if (!orderData.stripe_payment_intent_id) {
    update.stripe_payment_intent_id = paymentIntentId;
  }

  const statusChanged =
    previousRecord.status !== nextStatus ||
    (previousRecord.refund_id || null) !== (nextRecord.refund_id || null) ||
    (previousRecord.failure_reason || "") !== (nextRecord.failure_reason || "");

  return {
    update,
    nextRecord,
    refundedMinor,
    reservedMinor,
    nextStatus,
    shouldAudit: statusChanged,
    reservationUnderflow,
  };
}

async function persistRefundResult({
  db,
  auditService,
  logger,
  orderRef,
  originalAmountMinor,
  paymentIntentId,
  requestId,
  refundResult,
  actorUid,
  reason,
  priorStripeRefundedMinor = 0,
  resultIncludedInPrior = false,
}) {
  const updatedAtMillis = Date.now();

  const result = await db.runTransaction(async (transaction) => {
    const freshOrderSnap = await transaction.get(orderRef);
    if (!freshOrderSnap.exists) {
      throw new Error("Order not found while recording the refund.");
    }

    const freshOrder = freshOrderSnap.data();
    const {
      update,
      nextRecord,
      refundedMinor,
      reservedMinor,
      nextStatus,
      shouldAudit,
      reservationUnderflow,
    } = planPersistedRefundUpdate({
        orderData: freshOrder,
        originalAmountMinor,
        paymentIntentId,
        requestId,
        refundResult,
        updatedAtMillis,
        priorStripeRefundedMinor,
        resultIncludedInPrior,
      });

    let auditRecord = null;
    if (auditService && shouldAudit) {
      auditRecord = {
        action: AUDIT_ACTIONS.REFUND_ISSUED,
        entity_type: "refund",
        entity_id: nextRecord.refund_id || requestId,
        summary: `Stripe refund ${nextStatus} for order ${orderRef.id}.`,
        reason,
        before: {
          total_amount: Number(freshOrder.total_amount) || 0,
          currency: freshOrder.currency || "GBP",
          payment_status: freshOrder.payment_status || null,
          refund_status: freshOrder.refund_status || null,
        },
        after: {
          refund_amount_minor: nextRecord.amount_minor,
          refund_status: nextStatus,
          refunded_amount_minor: refundedMinor,
          remaining_refundable_minor: Math.max(
            0,
            originalAmountMinor - refundedMinor - reservedMinor
          ),
          currency: nextRecord.currency,
        },
        related: {
          order_id: orderRef.id,
          user_id: freshOrder.user_ref?.id || null,
          refund_id: nextRecord.refund_id || null,
        },
        source: "admin_order_refund",
        correlation_id: requestId,
      };
    }

    if (auditRecord) {
      auditService.recordEventInTransaction(transaction, auditRecord, {
        actor: createAdminAuditActor(actorUid),
      });
    }
    transaction.update(orderRef, update);

    return {
      refundRecord: nextRecord,
      refundedAmountMinor: refundedMinor,
      reservedMinor,
      status: nextStatus,
      reservationUnderflow,
    };
  });

  if (result.reservationUnderflow && logger?.error) {
    logger.error("[refundOrder] Reservation aggregate underflow detected", {
      requestId,
      storedReservedMinor: result.reservationUnderflow.currentReservedMinor,
      recordAmountMinor: result.reservationUnderflow.amountMinor,
      shortfallMinor: result.reservationUnderflow.shortfallMinor,
    });
  }

  return result;
}

async function releaseFailedReservation({
  db,
  logger,
  orderRef,
  requestId,
  submissionToken,
  failureReason,
}) {
  const updatedAtMillis = Date.now();
  try {
    const result = await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(orderRef);
      if (!freshSnap.exists) return null;
      const freshOrder = freshSnap.data();
      const records = getRefundRecords(freshOrder);
      const index = records.findIndex((record) => record?.request_id === requestId);
      if (index === -1) return;
      const record = records[index];
      if (!isReservationHoldingStatus(record.status)) return;
      if (submissionToken && record.submission_token !== submissionToken) return;

      const amount = Number(record.amount_minor) || 0;
      const nextRecords = [...records];
      nextRecords[index] = {
        ...record,
        status: "failed",
        failure_reason: failureReason || "Stripe refund request failed.",
        updated_at: updatedAtMillis,
      };
      const refundedMinor = Number(freshOrder.refunded_amount_minor) || 0;
      const release = releaseReservedAmount(
        Number(freshOrder.refund_reserved_amount_minor) || 0,
        amount
      );
      transaction.update(orderRef, {
        refunds: nextRecords,
        refund_reserved_amount_minor: release.reservedMinor,
        refund_status: refundedMinor > 0 ? "partial" : null,
        last_refund_status: "failed",
        last_refund_at: updatedAtMillis,
        updated_at: updatedAtMillis,
      });
      return { reservationUnderflow: release.underflow };
    });
    if (result?.reservationUnderflow && logger?.error) {
      logger.error("[refundOrder] Reservation aggregate underflow detected", {
        requestId,
        storedReservedMinor: result.reservationUnderflow.currentReservedMinor,
        recordAmountMinor: result.reservationUnderflow.amountMinor,
        shortfallMinor: result.reservationUnderflow.shortfallMinor,
      });
    }
  } catch (error) {
    console.error("[refundOrder] Failed to release refund reservation:", error);
  }
}

function assertExistingReservationMatches({
  record,
  amountMinor,
  currency,
  reason,
  paymentIntentId,
  HttpsError,
}) {
  if (Number(record?.amount_minor) !== amountMinor) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different refund amount."
    );
  }
  if (
    String(record?.currency || "GBP").toUpperCase() !==
    String(currency || "GBP").toUpperCase()
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different refund currency."
    );
  }
  if (normalizeReason(record?.reason) !== normalizeReason(reason)) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different refund reason."
    );
  }
  if (getStripeValue(record?.payment_intent_id) !== paymentIntentId) {
    throw new HttpsError(
      "failed-precondition",
      "This request ID was already used for a different refund payment intent."
    );
  }
}

async function reserveOrClaimRefund({
  db,
  orderRef,
  requestId,
  amountMinor,
  currency,
  paymentIntentId,
  reason,
  actorUid,
  originalAmountMinor,
  previouslyRefundedMinor,
  HttpsError,
}) {
  const nowMillis = Date.now();

  return db.runTransaction(async (transaction) => {
    const freshSnap = await transaction.get(orderRef);
    if (!freshSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const freshOrder = freshSnap.data();
    const freshPaymentIntentId = getStripeValue(
      freshOrder.stripe_payment_intent_id
    );
    if (!freshPaymentIntentId || freshPaymentIntentId !== paymentIntentId) {
      throw new HttpsError(
        "failed-precondition",
        "The order payment intent changed during refund processing."
      );
    }
    const records = getRefundRecords(freshOrder);
    const existingIndex = records.findIndex(
      (record) => record && record.request_id === requestId
    );

    if (existingIndex !== -1) {
      const existing = records[existingIndex];
      assertExistingReservationMatches({
        record: existing,
        amountMinor,
        currency,
        reason,
        paymentIntentId: freshPaymentIntentId,
        HttpsError,
      });

      const existingStatus = normalizeRefundStatus(existing.status) || "pending";
      if (
        existingStatus === "succeeded" ||
        existingStatus === "failed" ||
        existingStatus === "canceled"
      ) {
        return { state: "existing_terminal", record: existing };
      }
      if (String(freshOrder.status || "").toLowerCase() !== "paid") {
        throw new HttpsError(
          "failed-precondition",
          "The order is no longer in a refundable state."
        );
      }
      if (existing.refund_id) {
        return { state: "existing_linked", record: existing };
      }

      const startedAt = Number(existing.submission_started_at) || 0;
      if (startedAt > 0 && nowMillis - startedAt < REFUND_SUBMISSION_LEASE_MS) {
        return { state: "existing_in_flight", record: existing };
      }

      const submissionToken = makeSubmissionToken();
      const nextRecord = {
        ...existing,
        submission_token: submissionToken,
        submission_started_at: nowMillis,
        submission_attempts: (Number(existing.submission_attempts) || 0) + 1,
        updated_at: nowMillis,
      };
      const nextRecords = [...records];
      nextRecords[existingIndex] = nextRecord;
      transaction.update(orderRef, {
        refunds: nextRecords,
        updated_at: nowMillis,
      });
      return {
        state: "claimed",
        record: nextRecord,
        submissionToken,
      };
    }

    if (String(freshOrder.status || "").toLowerCase() !== "paid") {
      throw new HttpsError(
        "failed-precondition",
        "Only a paid order can be refunded."
      );
    }

    const refundedMinor = Number(freshOrder.refunded_amount_minor) || 0;
    const reservedMinor = Number(freshOrder.refund_reserved_amount_minor) || 0;
    const committedForCapacity = Math.max(
      refundedMinor,
      Number(previouslyRefundedMinor) || 0
    );
    if (
      committedForCapacity + reservedMinor + amountMinor >
      originalAmountMinor
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Another refund is already reserved against this payment. Review the refundable amount before retrying."
      );
    }

    const submissionToken = makeSubmissionToken();
    const refundRecord = {
      request_id: requestId,
      refund_id: null,
      amount_minor: amountMinor,
      currency,
      status: "pending",
      reason,
      actor_uid: actorUid,
      payment_intent_id: freshPaymentIntentId,
      submission_token: submissionToken,
      submission_started_at: nowMillis,
      submission_attempts: 1,
      created_at: nowMillis,
      updated_at: nowMillis,
    };

    transaction.update(orderRef, {
      refunds: [...records, refundRecord],
      refund_reserved_amount_minor: reservedMinor + amountMinor,
      refund_status: refundedMinor > 0 ? "partial" : "pending",
      updated_at: nowMillis,
    });

    return {
      state: "created",
      record: refundRecord,
      submissionToken,
    };
  });
}

function matchesReservationRefund({
  refund,
  orderId,
  requestId,
  amountMinor,
  currency,
  paymentIntentId,
}) {
  if (!refund || normalizeRefundStatus(refund.status) === null) return false;
  if (getStripeValue(refund.payment_intent) !== paymentIntentId) return false;
  if (Number(refund.amount) !== amountMinor) return false;
  if (String(refund.currency || "").toUpperCase() !== String(currency || "GBP").toUpperCase()) {
    return false;
  }
  if (refund.metadata?.orderId !== orderId) return false;
  if (refund.metadata?.refundRequestId !== requestId) return false;
  return true;
}

async function findMatchingStripeRefund({
  stripe,
  orderId,
  requestId,
  amountMinor,
  currency,
  paymentIntentId,
  refundId = null,
}) {
  if (refundId) {
    try {
      const refund = await stripe.refunds.retrieve(refundId);
      return matchesReservationRefund({
        refund,
        orderId,
        requestId,
        amountMinor,
        currency,
        paymentIntentId,
      })
        ? refund
        : null;
    } catch {
      return null;
    }
  }

  try {
    const refunds = await listRefundsForPaymentIntent(stripe, paymentIntentId);
    return refunds.find((refund) =>
      matchesReservationRefund({
        refund,
        orderId,
        requestId,
        amountMinor,
        currency,
        paymentIntentId,
      })
    ) || null;
  } catch {
    return null;
  }
}

function buildRefundResponse({
  orderId,
  requestId,
  record,
  status,
  originalAmountMinor,
  previouslyRefundedMinor,
  remainingRefundableMinor,
  idempotentReplay,
  message,
  success = status === "succeeded",
}) {
  return {
    success,
    pending:
      status === "pending" ||
      status === "requires_action" ||
      status === "uncertain",
    idempotentReplay,
    orderId,
    requestId,
    refundId: record?.refund_id || null,
    status,
    amountMinor: Number(record?.amount_minor) || 0,
    currency: record?.currency || "GBP",
    reason: record?.reason || "",
    originalAmountMinor,
    previouslyRefundedMinor,
    remainingRefundableMinor: Math.max(0, Number(remainingRefundableMinor) || 0),
    message,
  };
}

function parseStripeRefundError(error) {
  return error?.message || "Stripe rejected the refund request.";
}

export function createRefundOrderHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
  stripeFactory = (key) => new Stripe(key),
  getStripeSecretKey = () => globalThis.process?.env?.STRIPE_SECRET_KEY,
}) {
  const auditService = createAdminAuditService({ db, admin, logger, HttpsError });

  return async function handleRefundOrder(request) {
    const adminUid = await assertAdmin(request);
    const { orderId, amountMinor, reason, requestId } = request.data || {};

    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "orderId is required.");
    }

    const normalizedAmountMinor = normalizeAmountMinor(amountMinor);
    if (!normalizedAmountMinor) {
      throw new HttpsError(
        "invalid-argument",
        "amountMinor must be a positive integer in the payment currency's minor units."
      );
    }

    const reasonText = normalizeReason(reason);
    if (!reasonText) {
      throw new HttpsError("invalid-argument", "A reason is required to issue a refund.");
    }

    const normalizedRequestId = normalizeRequestId(requestId);
    if (!normalizedRequestId) {
      throw new HttpsError("invalid-argument", "A valid requestId is required.");
    }

    const orderRef = db.collection("order").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const orderData = orderSnap.data();
    const orderStatus = String(orderData.status || "").toLowerCase();
    const existingRecord = findRefundRecord(orderData, normalizedRequestId);

    if (!existingRecord && orderStatus === "refunded") {
      throw new HttpsError("failed-precondition", "This order is already fully refunded.");
    }
    if (
      orderStatus !== "paid" &&
      !(orderStatus === "refunded" && existingRecord)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Only a paid order can be refunded."
      );
    }

    const context = await loadStripeContext({
      HttpsError,
      orderData,
      stripeFactory,
      getStripeSecretKey,
    });

    if (existingRecord) {
      assertExistingReservationMatches({
        record: existingRecord,
        amountMinor: normalizedAmountMinor,
        currency: context.currency,
        reason: reasonText,
        paymentIntentId: context.paymentIntentId,
        HttpsError,
      });

      const existingStatus = normalizeRefundStatus(existingRecord.status) || "pending";
      if (
        existingStatus === "succeeded" ||
        existingStatus === "failed" ||
        existingStatus === "canceled"
      ) {
        return buildRefundResponse({
          orderId,
          requestId: normalizedRequestId,
          record: existingRecord,
          status: existingStatus,
          originalAmountMinor: context.originalAmountMinor,
          previouslyRefundedMinor: context.previousRefundedMinor,
          remainingRefundableMinor: context.remainingRefundableMinor,
          idempotentReplay: true,
          success: existingStatus === "succeeded",
          message:
            existingStatus === "succeeded"
              ? "This refund request was already completed."
              : existingRecord.failure_reason || "This refund request previously failed.",
        });
      }
    }

    if (!existingRecord && normalizedAmountMinor > context.remainingRefundableMinor) {
      throw new HttpsError(
        "failed-precondition",
        `The requested refund exceeds the remaining refundable amount of ${context.remainingRefundableMinor} minor units.`
      );
    }

    let reservation;
    try {
      reservation = await reserveOrClaimRefund({
        db,
        orderRef,
        requestId: normalizedRequestId,
        amountMinor: normalizedAmountMinor,
        currency: context.currency,
        paymentIntentId: context.paymentIntentId,
        reason: reasonText,
        actorUid: adminUid,
        originalAmountMinor: context.originalAmountMinor,
        previouslyRefundedMinor: context.previousRefundedMinor,
        HttpsError,
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "aborted",
        `The refund could not be reserved safely: ${error?.message || "unknown error"}`
      );
    }

    const reservationRecord = reservation.record;

    if (reservation.state === "existing_terminal") {
      const terminalStatus = normalizeRefundStatus(reservationRecord.status) || "pending";
      return buildRefundResponse({
        orderId,
        requestId: normalizedRequestId,
        record: reservationRecord,
        status: terminalStatus,
        originalAmountMinor: context.originalAmountMinor,
        previouslyRefundedMinor: context.previousRefundedMinor,
        remainingRefundableMinor: context.remainingRefundableMinor,
        idempotentReplay: true,
        success: terminalStatus === "succeeded",
        message:
          terminalStatus === "succeeded"
            ? "This refund request was already completed."
            : reservationRecord.failure_reason || "This refund request previously failed.",
      });
    }

    if (
      reservation.state === "existing_in_flight" ||
      reservation.state === "existing_linked"
    ) {
      const matchedRefund = await findMatchingStripeRefund({
        stripe: context.stripe,
        orderId,
        requestId: normalizedRequestId,
        amountMinor: normalizedAmountMinor,
        currency: context.currency,
        paymentIntentId: context.paymentIntentId,
        refundId: reservationRecord.refund_id || null,
      });

      if (matchedRefund) {
        const persisted = await persistRefundResult({
          db,
          auditService,
          logger,
          orderRef,
          originalAmountMinor: context.originalAmountMinor,
          paymentIntentId: context.paymentIntentId,
          requestId: normalizedRequestId,
          refundResult: matchedRefund,
          actorUid: reservationRecord.actor_uid || adminUid,
          reason: reservationRecord.reason || reasonText,
          priorStripeRefundedMinor: context.previousRefundedMinor,
          resultIncludedInPrior: context.committedRefunds.some(
            (refund) => refund.id === matchedRefund.id
          ),
        });
        const reconciledStatus = persisted.status;
        return buildRefundResponse({
          orderId,
          requestId: normalizedRequestId,
          record: persisted.refundRecord,
          status: reconciledStatus,
          originalAmountMinor: context.originalAmountMinor,
          previouslyRefundedMinor: context.previousRefundedMinor,
          remainingRefundableMinor: context.remainingRefundableMinor,
          idempotentReplay: true,
          message:
            reconciledStatus === "succeeded"
              ? "The previously submitted Stripe refund was reconciled."
              : "The previous refund request is still processing.",
        });
      }

      const pendingStatus = reservationRecord.refund_id ? "uncertain" : "pending";
      return buildRefundResponse({
        orderId,
        requestId: normalizedRequestId,
        record: reservationRecord,
        status: pendingStatus,
        originalAmountMinor: context.originalAmountMinor,
        previouslyRefundedMinor: context.previousRefundedMinor,
        remainingRefundableMinor: Math.max(
          0,
          context.remainingRefundableMinor - (Number(reservationRecord.amount_minor) || 0)
        ),
        idempotentReplay: true,
        success: false,
        message:
          "An existing refund request is still being reconciled. Retry the same request ID; do not start a new refund.",
      });
    }

    const submissionToken = reservation.submissionToken;

    let stripeRefund;
    try {
      stripeRefund = await context.stripe.refunds.create(
        {
          payment_intent: context.paymentIntentId,
          amount: normalizedAmountMinor,
          metadata: buildStripeRefundMetadata(
            orderId,
            normalizedRequestId,
            reservationRecord.reason || reasonText,
            reservationRecord.actor_uid || adminUid
          ),
        },
        { idempotencyKey: `refund_${orderId}_${normalizedRequestId}` }
      );
    } catch (error) {
      const classification = classifyStripeRefundError(error);
      const failureReason = parseStripeRefundError(error);

      if (classification.outcome === "definitive_failure") {
        await releaseFailedReservation({
          db,
          logger,
          orderRef,
          requestId: normalizedRequestId,
          submissionToken,
          failureReason,
        });
        logger.error(
          `[refundOrder] Stripe definitively rejected refund for order=${orderId} request=${normalizedRequestId}:`,
          failureReason
        );
        throw new HttpsError(
          "failed-precondition",
          `Stripe rejected the refund. No order was marked as refunded. ${failureReason}`
        );
      }

      logger.warn(
        `[refundOrder] Stripe refund outcome is uncertain for order=${orderId} request=${normalizedRequestId} reason=${classification.reason}:`,
        failureReason
      );

      const matchedRefund = await findMatchingStripeRefund({
        stripe: context.stripe,
        orderId,
        requestId: normalizedRequestId,
        amountMinor: normalizedAmountMinor,
        currency: context.currency,
        paymentIntentId: context.paymentIntentId,
      });

      if (matchedRefund) {
        const persisted = await persistRefundResult({
          db,
          auditService,
          logger,
          orderRef,
          originalAmountMinor: context.originalAmountMinor,
          paymentIntentId: context.paymentIntentId,
          requestId: normalizedRequestId,
          refundResult: matchedRefund,
          actorUid: reservationRecord.actor_uid || adminUid,
          reason: reservationRecord.reason || reasonText,
          priorStripeRefundedMinor: context.previousRefundedMinor,
          resultIncludedInPrior: false,
        });
        return buildRefundResponse({
          orderId,
          requestId: normalizedRequestId,
          record: persisted.refundRecord,
          status: persisted.status,
          originalAmountMinor: context.originalAmountMinor,
          previouslyRefundedMinor: context.previousRefundedMinor,
          remainingRefundableMinor: context.remainingRefundableMinor,
          idempotentReplay: true,
          message:
            persisted.status === "succeeded"
              ? "Stripe confirmed the previously submitted refund."
              : "The previous refund request is still processing.",
        });
      }

      return buildRefundResponse({
        orderId,
        requestId: normalizedRequestId,
        record: reservationRecord,
        status: "uncertain",
        originalAmountMinor: context.originalAmountMinor,
        previouslyRefundedMinor: context.previousRefundedMinor,
        remainingRefundableMinor: Math.max(
          0,
          context.remainingRefundableMinor - (Number(reservationRecord.amount_minor) || 0)
        ),
        idempotentReplay: false,
        success: false,
        message:
          "Stripe did not confirm whether the refund was created. The reservation is preserved. Retry the same request ID to reconcile; do not start a new refund.",
      });
    }

    let persisted;
    try {
      persisted = await persistRefundResult({
        db,
        auditService,
        logger,
        orderRef,
        originalAmountMinor: context.originalAmountMinor,
        paymentIntentId: context.paymentIntentId,
        requestId: normalizedRequestId,
        refundResult: stripeRefund,
        actorUid: reservationRecord.actor_uid || adminUid,
        reason: reservationRecord.reason || reasonText,
        priorStripeRefundedMinor: context.previousRefundedMinor,
        resultIncludedInPrior: false,
      });
    } catch (error) {
      logger.error(
        `[refundOrder] Stripe refund ${stripeRefund?.id || "(unknown)"} succeeded for order=${orderId} request=${normalizedRequestId} but persistence failed.`,
        error
      );
      throw new HttpsError(
        "aborted",
        `Stripe created refund ${stripeRefund?.id || "(unknown)"}, but recording it failed. Retry the same request ID to reconcile. Do not issue a new refund.`
      );
    }

    logger.info(
      `[refundOrder] admin=${adminUid} order=${orderId} request=${normalizedRequestId} stripeRefund=${persisted.refundRecord.refund_id || "pending"} status=${persisted.status} amountMinor=${normalizedAmountMinor}`
    );

    return buildRefundResponse({
      orderId,
      requestId: normalizedRequestId,
      record: persisted.refundRecord,
      status: persisted.status,
      originalAmountMinor: context.originalAmountMinor,
      previouslyRefundedMinor: context.previousRefundedMinor,
      remainingRefundableMinor: Math.max(
        0,
        context.originalAmountMinor -
          context.previousRefundedMinor -
          (persisted.status === "succeeded" ? normalizedAmountMinor : 0) -
          (Number(persisted.reservedMinor) || 0)
      ),
      idempotentReplay: false,
      message:
        persisted.status === "succeeded"
          ? "Stripe confirmed the refund."
          : persisted.status === "pending" || persisted.status === "requires_action"
            ? "Stripe is still processing the refund. The order will be updated when Stripe confirms the final status."
            : `Stripe returned refund status ${persisted.status}.`,
    });
  };
}

export async function processRefundWebhookEvent({
  db,
  admin,
  logger,
  event,
  stripe,
  auditServiceFactory = createAdminAuditService,
}) {
  const refund = event?.data?.object;
  const orderId = refund?.metadata?.orderId;
  const requestId = refund?.metadata?.refundRequestId;

  if (!String(event?.type || "").startsWith("refund.")) {
    return null;
  }
  if (!refund || !orderId || !requestId) {
    return null;
  }

  const orderRef = db.collection("order").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    logger.error(`[stripeWebhook] Refund references missing order ${orderId}.`);
    return { statusCode: 404, body: "Refund order not found." };
  }

  const orderData = orderSnap.data();
  const existingRecord = findRefundRecord(orderData, requestId);
  if (!existingRecord) {
    logger.warn(
      `[stripeWebhook] Refund ${refund.id} has no matching refund reservation for order ${orderId}.`
    );
    return { statusCode: 200, body: "Refund event ignored." };
  }

  const reservationPaymentIntentId = getStripeValue(existingRecord.payment_intent_id);
  const storedPaymentIntentId = getStripeValue(orderData.stripe_payment_intent_id);
  const refundPaymentIntentId = getStripeValue(refund.payment_intent);

  if (!refundPaymentIntentId) {
    logger.error(`[stripeWebhook] Refund ${refund.id} has no payment intent.`);
    return { statusCode: 400, body: "Refund payment intent is missing." };
  }
  if (
    (!reservationPaymentIntentId && !storedPaymentIntentId) ||
    (reservationPaymentIntentId && refundPaymentIntentId !== reservationPaymentIntentId) ||
    (storedPaymentIntentId && refundPaymentIntentId !== storedPaymentIntentId)
  ) {
    logger.error(
      `[stripeWebhook] Refund ${refund.id} payment intent does not match order ${orderId}.`
    );
    return { statusCode: 400, body: "Refund payment does not match the order." };
  }

  if (
    existingRecord.refund_id &&
    String(refund.id || "") !== String(existingRecord.refund_id)
  ) {
    logger.error(
      `[stripeWebhook] Refund ${refund.id} does not match reserved refund ${existingRecord.refund_id} for order ${orderId}.`
    );
    return { statusCode: 400, body: "Refund ID does not match the reservation." };
  }

  if (Number(refund.amount) !== Number(existingRecord.amount_minor)) {
    logger.error(
      `[stripeWebhook] Refund ${refund.id} amount does not match the reservation for order ${orderId}.`
    );
    return { statusCode: 400, body: "Refund amount does not match the reservation." };
  }

  const reservationCurrency = String(
    existingRecord.currency || orderData.currency || "GBP"
  ).toUpperCase();
  if (String(refund.currency || "").toUpperCase() !== reservationCurrency) {
    logger.error(
      `[stripeWebhook] Refund ${refund.id} currency does not match the reservation for order ${orderId}.`
    );
    return { statusCode: 400, body: "Refund currency does not match the reservation." };
  }

  const incomingStatus = normalizeRefundStatus(refund.status);
  if (!incomingStatus) {
    logger.error(
      `[stripeWebhook] Refund ${refund.id} has unsupported status ${String(refund.status)}.`
    );
    return { statusCode: 400, body: "Unsupported refund status." };
  }

  const trustedActorUid =
    typeof existingRecord.actor_uid === "string"
      ? existingRecord.actor_uid.trim()
      : "";
  if (!trustedActorUid) {
    logger.error(
      `[stripeWebhook] Refund reservation for order ${orderId} request ${requestId} has no trusted actor.`
    );
    return { statusCode: 500, body: "Refund reservation is missing a trusted actor." };
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(refundPaymentIntentId);
  } catch (error) {
    logger.error("[stripeWebhook] Failed to retrieve payment intent for refund:", error);
    return { statusCode: 500, body: "Unable to verify refund payment." };
  }

  const originalAmountMinor = Number(paymentIntent?.amount_received);
  if (!Number.isSafeInteger(originalAmountMinor) || originalAmountMinor <= 0) {
    logger.error("[stripeWebhook] Refund payment intent has an invalid settled amount.");
    return { statusCode: 500, body: "Invalid settled payment amount." };
  }

  let stripeRefunds;
  try {
    stripeRefunds = await listRefundsForPaymentIntent(stripe, refundPaymentIntentId);
  } catch (error) {
    logger.error("[stripeWebhook] Failed to list refunds for payment intent:", error);
    return { statusCode: 500, body: "Unable to verify refund state." };
  }
  const { previousRefundedMinor } = summarizeStripeRefunds(stripeRefunds);

  const auditService = auditServiceFactory({
    db,
    admin,
    logger,
    HttpsError: Error,
  });

  try {
    const persisted = await persistRefundResult({
      db,
      auditService,
      logger,
      orderRef,
      originalAmountMinor,
      paymentIntentId: refundPaymentIntentId,
      requestId,
      refundResult: refund,
      actorUid: trustedActorUid,
      reason: existingRecord.reason || "",
      priorStripeRefundedMinor: previousRefundedMinor,
      resultIncludedInPrior: stripeRefunds.some((item) => item.id === refund.id),
    });

    logger.info(
      `[stripeWebhook] Refund ${refund.id} for order ${orderId} recorded as ${persisted.status}.`
    );
    return { statusCode: 200, body: "Refund event handled." };
  } catch (error) {
    logger.error(
      `[stripeWebhook] Failed to record refund ${refund.id} for order ${orderId}:`,
      error
    );
    return { statusCode: 500, body: "Refund persistence failed." };
  }
}
