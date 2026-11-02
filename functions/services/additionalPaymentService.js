import Stripe from "stripe";
import { HttpsError } from "firebase-functions/v2/https";
import {
  AccountNotEligibleError,
  AdditionalPaymentAlreadyFulfilledError,
  assertAccountEligibleForCheckout,
  getCheckoutExpiryForCompetition,
  runOrderTransaction,
} from "./orderTransactionService.js";
import {
  getReferenceId,
  normalizeAdjustmentReason,
  normalizeRequestId,
} from "./ticketAdjustmentPolicy.js";
import {
  createAdminAuditActor,
  createAdminAuditService,
  createSystemAuditActor,
  AUDIT_ACTIONS,
} from "./adminAuditService.js";
import {
  createVerifiedStripeSettlementContext,
  SettlementValidationError,
} from "./stripeSettlementService.js";
import { PAYMENT_SETTLEMENT } from "./ticketOrigin.js";

export const ADDITIONAL_PAYMENT_REQUESTS_COLLECTION = "additional_payment_requests";
export const ADDITIONAL_PAYMENT_LOCKS_COLLECTION = "additional_payment_request_locks";
export const ADDITIONAL_PAYMENT_MAX_TICKETS = 100;
export const ADDITIONAL_PAYMENT_CURRENCY = "GBP";
export const ADDITIONAL_PAYMENT_DEFAULT_LIST_LIMIT = 50;
export const ADDITIONAL_PAYMENT_MAX_LIST_LIMIT = 100;

export const ADDITIONAL_PAYMENT_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  PAID: "paid",
  EXPIRED: "expired",
  FAILED: "failed",
});

export const ADDITIONAL_PAYMENT_FULFILLMENT = Object.freeze({
  PENDING: "pending",
  FULFILLED: "fulfilled",
  FAILED: "failed",
});

const ACTIVE_PAYMENT_STATUSES = new Set([
  ADDITIONAL_PAYMENT_STATUS.PENDING,
  ADDITIONAL_PAYMENT_STATUS.PROCESSING,
]);

function buildLockId(userId, competitionId) {
  return `${userId}_${competitionId}`;
}

function getRequestMillis(value) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIsoTimestamp(value) {
  const millis = getRequestMillis(value);
  return millis > 0 ? new Date(millis).toISOString() : null;
}

function isExpiredPending(request, nowMillis) {
  return (
    ACTIVE_PAYMENT_STATUSES.has(request?.payment_status) &&
    Number(request?.expires_at_millis) > 0 &&
    Number(request.expires_at_millis) <= nowMillis
  );
}

function effectivePaymentStatus(request) {
  return request?.payment_status || ADDITIONAL_PAYMENT_STATUS.PENDING;
}

function getExpectedTotalMinor(requestData) {
  const storedMinor = Number(requestData?.total_amount_minor);
  if (Number.isSafeInteger(storedMinor) && storedMinor > 0) {
    return storedMinor;
  }

  const amount = Number(requestData?.total_amount);
  const minor = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(minor) ||
    minor <= 0 ||
    Math.abs(amount * 100 - minor) > 1e-6
  ) {
    throw new SettlementValidationError(
      "invalid_request_amount",
      "Additional payment request amount is invalid."
    );
  }
  return minor;
}

function classifyStripeCheckoutSession(session) {
  if (!session || typeof session.status !== "string") {
    return "unknown";
  }
  if (session.status === "open") {
    return "open";
  }
  if (session.status === "expired") {
    return "expired";
  }
  if (session.status === "complete") {
    if (session.payment_status === "paid") {
      return "paid";
    }
    if (
      session.payment_status === "unpaid" ||
      session.payment_status === "no_payment_required"
    ) {
      return "complete_unpaid";
    }
  }
  return "unknown";
}

/**
 * Inspects the current lock outside Firestore transactions and resolves any
 * Stripe Session that could make a locally expired request still payable.
 * External Stripe calls must never run inside a transaction.
 */
async function inspectLockForReplacement({
  db,
  stripe,
  lockRef,
  currentRequestId,
  nowMillis,
}) {
  const lockSnap = await lockRef.get();
  if (!lockSnap.exists) {
    return { action: "none" };
  }

  const lockData = lockSnap.data();
  if (!lockData?.request_id || lockData.request_id === currentRequestId) {
    // Let the creation transaction handle request-ID replay.
    return { action: "replay" };
  }

  const lockedRequestRef = db
    .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
    .doc(lockData.request_id);
  const lockedRequestSnap = await lockedRequestRef.get();
  if (!lockedRequestSnap.exists) {
    return { action: "stale", requestId: lockData.request_id };
  }

  const requestData = lockedRequestSnap.data();
  const requestId = lockData.request_id;

  if (requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED) {
    return { action: "terminal", requestId, requestData };
  }

  if (requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID) {
    return { action: "paid_active", requestId, requestData };
  }

  if (requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.FAILED) {
    return { action: "failed_active", requestId, requestData };
  }

  const locallyExpired = isExpiredPending(requestData, nowMillis);
  const alreadyExpired =
    requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED;

  if (!locallyExpired && !alreadyExpired) {
    return { action: "active", requestId, requestData };
  }

  const sessionId =
    typeof requestData.stripe_checkout_session_id === "string"
      ? requestData.stripe_checkout_session_id
      : "";

  if (!sessionId) {
    if (alreadyExpired) {
      return { action: "replaceable", requestId, sessionId: "", requestData };
    }
    // A Stripe Session may have been created even if its ID was never
    // persisted. Do not release the lock without positive Stripe evidence.
    return { action: "unresolved_no_session", requestId, requestData };
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    return {
      action: "retrieval_failed",
      requestId,
      sessionId,
      error,
    };
  }

  if (!session || session.id !== sessionId) {
    return {
      action: "retrieval_failed",
      requestId,
      sessionId,
      error: new Error("Stripe session identity mismatch."),
    };
  }

  const state = classifyStripeCheckoutSession(session);

  if (state === "paid") {
    if (alreadyExpired) {
      return {
        action: "expired_paid_conflict",
        requestId,
        sessionId,
        session,
        requestData,
      };
    }
    return {
      action: "paid_session",
      requestId,
      sessionId,
      session,
      requestData,
    };
  }

  if (state === "expired") {
    return {
      action: "replaceable",
      requestId,
      sessionId,
      session,
      requestData,
    };
  }

  if (state === "open") {
    return { action: "open", requestId, sessionId, session, requestData };
  }

  if (state === "complete_unpaid") {
    return {
      action: "complete_unpaid",
      requestId,
      sessionId,
      session,
      requestData,
    };
  }

  return { action: "unknown", requestId, sessionId, session, requestData };
}

export function calculateAdditionalPaymentPricing({
  competitionData,
  ticketQuantity,
  HttpsError: ErrorClass = HttpsError,
}) {
  const quantity = Number(ticketQuantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ErrorClass("invalid-argument", "ticketQuantity must be a positive integer.");
  }
  if (quantity > ADDITIONAL_PAYMENT_MAX_TICKETS) {
    throw new ErrorClass(
      "invalid-argument",
      `Maximum ${ADDITIONAL_PAYMENT_MAX_TICKETS} additional tickets per request.`
    );
  }

  const unitPrice = Number(competitionData?.ticket_price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new ErrorClass(
      "failed-precondition",
      "Competition ticket pricing is invalid, so a payment request cannot be created."
    );
  }

  const unitPriceMinorValue = unitPrice * 100;
  const unitAmountMinor = Math.round(unitPriceMinorValue);
  if (
    !Number.isSafeInteger(unitAmountMinor) ||
    unitAmountMinor <= 0 ||
    Math.abs(unitPriceMinorValue - unitAmountMinor) > 1e-6
  ) {
    throw new ErrorClass(
      "failed-precondition",
      "Competition ticket price cannot be represented exactly in GBP minor units."
    );
  }

  const totalAmountMinor = unitAmountMinor * quantity;
  if (!Number.isSafeInteger(totalAmountMinor) || totalAmountMinor <= 0) {
    throw new ErrorClass(
      "failed-precondition",
      "Additional payment total cannot be represented safely in GBP minor units."
    );
  }

  return {
    quantity,
    unitPrice: unitAmountMinor / 100,
    unitAmountMinor,
    totalAmount: totalAmountMinor / 100,
    totalAmountMinor,
    amountMinor: totalAmountMinor,
    currency: ADDITIONAL_PAYMENT_CURRENCY,
  };
}

function assertParticipantAssociation(competitionData, userId, HttpsErrorClass) {
  const participants = Array.isArray(competitionData?.participants)
    ? competitionData.participants
    : [];
  const associated = participants.some(
    (participant) => getReferenceId(participant) === userId
  );
  if (!associated) {
    throw new HttpsErrorClass(
      "failed-precondition",
      "This user is not a participant in the selected competition."
    );
  }
}

function parseHttpOrigin(value, HttpsErrorClass, errorCode, message) {
  if (!value || typeof value !== "string") {
    throw new HttpsErrorClass(errorCode, message);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpsErrorClass(errorCode, message);
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.host ||
    parsed.username ||
    parsed.password
  ) {
    throw new HttpsErrorClass(errorCode, message);
  }

  return parsed;
}

function resolveAllowedOrigins(getAppOrigins, HttpsErrorClass) {
  const configuredValue = getAppOrigins();
  if (typeof configuredValue !== "string" || !configuredValue.trim()) {
    throw new HttpsErrorClass(
      "failed-precondition",
      "APP_ORIGIN is not configured, so checkout cannot be started safely."
    );
  }

  const configuredOrigins = configuredValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configuredOrigins.length === 0) {
    throw new HttpsErrorClass(
      "failed-precondition",
      "APP_ORIGIN is not configured, so checkout cannot be started safely."
    );
  }

  const allowedOrigins = new Set();
  for (const configuredOrigin of configuredOrigins) {
    const parsed = parseHttpOrigin(
      configuredOrigin,
      HttpsErrorClass,
      "failed-precondition",
      "APP_ORIGIN contains an invalid origin."
    );
    allowedOrigins.add(parsed.origin);
  }
  return allowedOrigins;
}

function normalizeCheckoutOrigin(
  origin,
  HttpsErrorClass,
  getAppOrigins = () => process.env.APP_ORIGIN
) {
  const parsed = parseHttpOrigin(
    origin,
    HttpsErrorClass,
    "invalid-argument",
    "origin must be a valid HTTP(S) URL without credentials."
  );
  const allowedOrigins = resolveAllowedOrigins(getAppOrigins, HttpsErrorClass);
  if (!allowedOrigins.has(parsed.origin)) {
    throw new HttpsErrorClass(
      "invalid-argument",
      "origin is not an approved application origin."
    );
  }
  return parsed.origin;
}

function buildCheckoutUrls(
  origin,
  requestId,
  HttpsErrorClass,
  getAppOrigins = () => process.env.APP_ORIGIN
) {
  const base = normalizeCheckoutOrigin(origin, HttpsErrorClass, getAppOrigins);
  const encodedRequestId = encodeURIComponent(requestId);
  return {
    success_url: `${base}/profile/orders?additional_payment=success&request_id=${encodedRequestId}`,
    cancel_url: `${base}/profile/orders?additional_payment=cancelled&request_id=${encodedRequestId}`,
  };
}

function canPayAdditionalPaymentRequest(data, paymentStatus) {
  return (
    paymentStatus !== ADDITIONAL_PAYMENT_STATUS.PAID &&
    paymentStatus !== ADDITIONAL_PAYMENT_STATUS.EXPIRED &&
    paymentStatus !== ADDITIONAL_PAYMENT_STATUS.FAILED &&
    data?.fulfillment_status !== ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED &&
    Boolean(data?.stripe_checkout_session_id)
  );
}

function serializePaymentRequest(requestId, data) {
  const expiresAtMillis = Number(data?.expires_at_millis) || 0;
  const paymentStatus = effectivePaymentStatus(data);
  const canPay = canPayAdditionalPaymentRequest(data, paymentStatus);

  return {
    request_id: data?.request_id || requestId,
    user_id: getReferenceId(data?.user_ref),
    competition_id: getReferenceId(data?.competition_id),
    competition_title: data?.competition_title || null,
    initiated_by: getReferenceId(data?.initiated_by),
    requested_ticket_quantity: Number(data?.requested_ticket_quantity) || 0,
    unit_price: Number(data?.unit_price) || 0,
    unit_amount_minor: Number(data?.unit_amount_minor) || 0,
    total_amount: Number(data?.total_amount) || 0,
    total_amount_minor: Number(data?.total_amount_minor) || 0,
    currency: data?.currency || ADDITIONAL_PAYMENT_CURRENCY,
    payment_status: paymentStatus,
    fulfillment_status:
      data?.fulfillment_status || ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    has_checkout_session:
      typeof data?.stripe_checkout_session_id === "string" &&
      Boolean(data.stripe_checkout_session_id),
    order_id: getReferenceId(data?.order_id),
    issued_ticket_count: Number(data?.issued_ticket_count) || 0,
    reason: data?.reason || null,
    expires_at_millis: expiresAtMillis || null,
    created_at: toIsoTimestamp(data?.created_at),
    updated_at: toIsoTimestamp(data?.updated_at),
    paid_at: toIsoTimestamp(data?.paid_at),
    fulfilled_at: toIsoTimestamp(data?.fulfilled_at),
    failed_at: toIsoTimestamp(data?.failed_at),
    expired_at: toIsoTimestamp(data?.expired_at),
    failure_reason: data?.failure_reason || null,
    fulfillment_error: data?.fulfillment_error || null,
    fulfillment_attempts: Number(data?.fulfillment_attempts) || 0,
    can_pay: canPay,
  };
}

function serializeParticipantPaymentRequest(requestId, data) {
  const expiresAtMillis = Number(data?.expires_at_millis) || 0;
  const paymentStatus = effectivePaymentStatus(data);
  return {
    request_id: data?.request_id || requestId,
    competition_title: data?.competition_title || null,
    requested_ticket_quantity: Number(data?.requested_ticket_quantity) || 0,
    total_amount: Number(data?.total_amount) || 0,
    currency: data?.currency || ADDITIONAL_PAYMENT_CURRENCY,
    payment_status: paymentStatus,
    fulfillment_status:
      data?.fulfillment_status || ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    expires_at_millis: expiresAtMillis || null,
    can_pay: canPayAdditionalPaymentRequest(data, paymentStatus),
  };
}

function matchesRequestReplay(existing, expected) {
  return (
    getReferenceId(existing?.user_ref) === expected.userId &&
    getReferenceId(existing?.competition_id) === expected.competitionId &&
    Number(existing?.requested_ticket_quantity) === expected.quantity &&
    normalizeRequestId(existing?.request_id || "") === expected.requestId &&
    normalizeAdjustmentReason(existing?.reason) ===
      normalizeAdjustmentReason(expected.reason)
  );
}

async function createSessionOrResume({
  stripe,
  requestRef,
  request,
  requestId,
  admin,
  logger,
  HttpsError: HttpsErrorClass,
}) {
  const unitAmountMinor = Number(request.unit_amount_minor);
  const quantity = Number(request.requested_ticket_quantity);
  const expectedTotalMinor = Number(request.total_amount_minor);
  if (
    !Number.isSafeInteger(unitAmountMinor) ||
    unitAmountMinor <= 0 ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(expectedTotalMinor) ||
    expectedTotalMinor <= 0 ||
    unitAmountMinor * quantity !== expectedTotalMinor
  ) {
    throw new HttpsErrorClass(
      "failed-precondition",
      "Additional payment request pricing is inconsistent and cannot be sent to Stripe."
    );
  }

  if (request.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(
      request.stripe_checkout_session_id
    );
    if (!session || session.id !== request.stripe_checkout_session_id) {
      throw new HttpsErrorClass(
        "failed-precondition",
        "The stored Stripe Checkout session could not be verified."
      );
    }
    if (
      Number.isInteger(session.amount_total) &&
      session.amount_total !== expectedTotalMinor
    ) {
      throw new HttpsErrorClass(
        "failed-precondition",
        "The stored Stripe Checkout session amount does not match the payment request."
      );
    }
    if (session.status === "expired") {
      return { expired: true, session };
    }
    if (session.payment_status === "paid") {
      return { paid: true, session };
    }
    if (session.status === "complete") {
      return { paid: false, url: null, session };
    }
    return { url: session.url || null, session };
  }

  const params = {
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: `${request.competition_title || "Competition"} - Additional Tickets - Nesswin`,
          },
          unit_amount: unitAmountMinor,
        },
        quantity,
      },
    ],
    mode: "payment",
    expires_at: Number(request.stripe_expires_at),
    success_url: request.success_url,
    cancel_url: request.cancel_url,
    metadata: {
      additionalPaymentRequestId: requestId,
      userId: getReferenceId(request.user_ref),
      competitionId: getReferenceId(request.competition_id),
      requestType: "additional_payment",
    },
  };

  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: `additional_payment_session_${requestId}`,
  });

  if (!session?.id) {
    throw new Error("Stripe did not return a checkout session identifier.");
  }
  if (
    Number.isInteger(session.amount_total) &&
    session.amount_total !== expectedTotalMinor
  ) {
    throw new Error("Stripe returned an unexpected checkout amount.");
  }

  await requestRef.update({
    stripe_checkout_session_id: session.id,
    session_status: "created",
    session_created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(
    `[additionalPayment] Created Stripe session ${session.id} for request=${requestId}`
  );

  return { url: session.url || null, session };
}

export function createAdditionalPaymentRequestHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError: HttpsErrorClass,
  stripeFactory = (key) => new Stripe(key),
  getStripeSecretKey = () => process.env.STRIPE_SECRET_KEY,
  getAppOrigins = () => process.env.APP_ORIGIN,
  now = () => Date.now(),
}) {
  const auditService = createAdminAuditService({
    db,
    admin,
    logger,
    HttpsError: HttpsErrorClass,
  });

  return async function handleCreateAdditionalPaymentRequest(request) {
    const adminUid = await assertAdmin(request);
    const {
      userId,
      competitionId,
      ticketQuantity,
      reason,
      requestId,
      origin,
    } = request.data || {};

    if (!userId || typeof userId !== "string") {
      throw new HttpsErrorClass("invalid-argument", "userId is required.");
    }
    if (!competitionId || typeof competitionId !== "string") {
      throw new HttpsErrorClass("invalid-argument", "competitionId is required.");
    }

    const normalizedRequestId = normalizeRequestId(requestId);
    if (!normalizedRequestId) {
      throw new HttpsErrorClass("invalid-argument", "A valid requestId is required.");
    }

    const reasonText = normalizeAdjustmentReason(reason);
    if (!reasonText) {
      throw new HttpsErrorClass(
        "invalid-argument",
        "A reason is required to request an additional payment."
      );
    }

    const stripeSecretKey = getStripeSecretKey();
    if (!stripeSecretKey) {
      throw new HttpsErrorClass(
        "failed-precondition",
        "Stripe is not configured on the server."
      );
    }

    const urls = buildCheckoutUrls(
      origin,
      normalizedRequestId,
      HttpsErrorClass,
      getAppOrigins
    );
    const userRef = db.collection("user").doc(userId);
    const competitionRef = db.collection("competition").doc(competitionId);
    const adminRef = db.collection("user").doc(adminUid);
    const requestRef = db
      .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
      .doc(normalizedRequestId);
    const lockRef = db
      .collection(ADDITIONAL_PAYMENT_LOCKS_COLLECTION)
      .doc(buildLockId(userId, competitionId));
    const nowMillis = now();
    const stripe = stripeFactory(stripeSecretKey);

    const lockDecision = await inspectLockForReplacement({
      db,
      stripe,
      lockRef,
      currentRequestId: normalizedRequestId,
      nowMillis,
      HttpsError: HttpsErrorClass,
    });

    let replacement = null;
    switch (lockDecision.action) {
      case "retrieval_failed":
        logger.error(
          `[additionalPayment] Could not verify existing Stripe session for request=${lockDecision.requestId}:`,
          lockDecision.error?.message || lockDecision.error
        );
        throw new HttpsErrorClass(
          "failed-precondition",
          "The existing Stripe Checkout session could not be verified. No replacement was created. Retry shortly."
        );
      case "open":
        throw new HttpsErrorClass(
          "failed-precondition",
          "An existing Stripe Checkout session is still open. Complete or expire it before creating a new payment request."
        );
      case "complete_unpaid":
        throw new HttpsErrorClass(
          "failed-precondition",
          "An existing Stripe Checkout session is complete but payment is still processing. Do not create a replacement request."
        );
      case "unknown":
        throw new HttpsErrorClass(
          "failed-precondition",
          "The existing Stripe Checkout session state could not be resolved. No replacement was created."
        );
      case "active":
        throw new HttpsErrorClass(
          "failed-precondition",
          "An additional payment request is already active for this participant and competition."
        );
      case "paid_active":
        throw new HttpsErrorClass(
          "failed-precondition",
          "An existing additional payment request is already paid. Replacement is not allowed."
        );
      case "failed_active":
        throw new HttpsErrorClass(
          "failed-precondition",
          "An existing additional payment request is in a failed state and cannot be replaced automatically."
        );
      case "unresolved_no_session":
        throw new HttpsErrorClass(
          "failed-precondition",
          "An existing payment request has no verified Stripe session. Retry the same request ID or resolve it manually; no replacement was created."
        );
      case "expired_paid_conflict":
        throw new HttpsErrorClass(
          "failed-precondition",
          "The existing request is expired but its Stripe session reports a payment. Resolve the existing request before creating another."
        );
      case "paid_session": {
        const outcome = await processAdditionalPaymentWebhookEvent({
          db,
          admin,
          logger,
          event: {
            type: "checkout.session.completed",
            data: { object: lockDecision.session },
          },
          HttpsError: HttpsErrorClass,
        });
        if (outcome?.statusCode === 200) {
          logger.info(
            `[additionalPayment] Existing paid session resolved for request=${lockDecision.requestId}; replacement blocked.`
          );
          throw new HttpsErrorClass(
            "failed-precondition",
            "The existing additional payment has already been paid. Replacement is not allowed."
          );
        }
        logger.error(
          `[additionalPayment] Existing paid session could not be fulfilled for request=${lockDecision.requestId}: ${outcome?.body || "unknown error"}`
        );
        throw new HttpsErrorClass(
          "failed-precondition",
          "The existing additional payment has been paid but could not be fulfilled. Resolve the existing request before creating another."
        );
      }
      case "replaceable":
        replacement = lockDecision;
        break;
      case "none":
      case "replay":
      case "stale":
      case "terminal":
        replacement = null;
        break;
      default:
        throw new HttpsErrorClass(
          "failed-precondition",
          "The existing payment lock could not be resolved safely."
        );
    }

    const transactionResult = await db.runTransaction(async (transaction) => {
      const existingRequestSnap = await transaction.get(requestRef);
      if (existingRequestSnap.exists) {
        const existing = existingRequestSnap.data();
        if (
          !matchesRequestReplay(existing, {
            userId,
            competitionId,
            quantity: Number(ticketQuantity),
            requestId: normalizedRequestId,
            reason: reasonText,
          })
        ) {
          throw new HttpsErrorClass(
            "failed-precondition",
            "This request ID was already used for a different payment request."
          );
        }
        return { request: existing, created: false };
      }

      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists) {
        const lockData = lockSnap.data();
        const lockedRequestRef = db
          .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
          .doc(lockData.request_id);
        const lockedRequestSnap = await transaction.get(lockedRequestRef);
        if (lockedRequestSnap.exists) {
          const lockedRequest = lockedRequestSnap.data();
          const matchesVerifiedReplacement =
            replacement &&
            lockData.request_id === replacement.requestId &&
            (lockedRequest.stripe_checkout_session_id || "") ===
              (replacement.sessionId || "");

          if (matchesVerifiedReplacement) {
            if (
              lockedRequest.fulfillment_status ===
                ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED ||
              lockedRequest.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID
            ) {
              throw new HttpsErrorClass(
                "failed-precondition",
                "The existing payment request became paid before replacement. No replacement was created."
              );
            }

            if (
              lockedRequest.payment_status !== ADDITIONAL_PAYMENT_STATUS.PENDING &&
              lockedRequest.payment_status !== ADDITIONAL_PAYMENT_STATUS.PROCESSING &&
              lockedRequest.payment_status !== ADDITIONAL_PAYMENT_STATUS.EXPIRED
            ) {
              throw new HttpsErrorClass(
                "failed-precondition",
                "The existing payment request is not in a replaceable state."
              );
            }

            if (lockedRequest.payment_status !== ADDITIONAL_PAYMENT_STATUS.EXPIRED) {
              transaction.update(lockedRequestRef, {
                payment_status: ADDITIONAL_PAYMENT_STATUS.EXPIRED,
                expired_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
              });
              auditService.recordEventInTransaction(
                transaction,
                {
                  action: AUDIT_ACTIONS.PAYMENT_REQUEST_EXPIRED,
                  entity_type: "payment",
                  entity_id: lockData.request_id,
                  summary: `Additional payment request ${lockData.request_id} expired before settlement.`,
                  before: {
                    payment_status: lockedRequest.payment_status,
                    fulfillment_status: lockedRequest.fulfillment_status,
                    requested_ticket_quantity: lockedRequest.requested_ticket_quantity,
                    total_amount: lockedRequest.total_amount,
                    currency: lockedRequest.currency,
                  },
                  after: {
                    payment_status: ADDITIONAL_PAYMENT_STATUS.EXPIRED,
                    fulfillment_status:
                      lockedRequest.fulfillment_status ||
                      ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
                    requested_ticket_quantity: lockedRequest.requested_ticket_quantity,
                    total_amount: lockedRequest.total_amount,
                    currency: lockedRequest.currency,
                  },
                  related: {
                    payment_request_id: lockData.request_id,
                    user_id: getReferenceId(lockedRequest.user_ref),
                    competition_id: getReferenceId(lockedRequest.competition_id),
                  },
                  source: "additionalPaymentService.create",
                  correlation_id: lockData.request_id,
                },
                { actor: createSystemAuditActor() }
              );
            }
          } else {
            const terminalWithoutStoredSession =
              lockedRequest.fulfillment_status ===
                ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED ||
              (lockedRequest.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED &&
                !lockedRequest.stripe_checkout_session_id);

            if (!terminalWithoutStoredSession) {
              throw new HttpsErrorClass(
                "failed-precondition",
                "An additional payment request is already active or the lock changed during replacement. No replacement was created."
              );
            }
          }
        }
      }

      const [userSnap, competitionSnap, skillAttemptSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(competitionRef),
        transaction.get(
          db.collection("skill_attempts").doc(`${userId}_${competitionId}`)
        ),
      ]);

      if (!userSnap.exists) {
        throw new HttpsErrorClass("not-found", "User not found.");
      }
      if (!competitionSnap.exists) {
        throw new HttpsErrorClass("not-found", "Competition not found.");
      }

      try {
        assertAccountEligibleForCheckout(userSnap.data());
      } catch (error) {
        if (error instanceof AccountNotEligibleError) {
          throw new HttpsErrorClass("failed-precondition", error.message);
        }
        throw error;
      }

      const competitionData = competitionSnap.data();
      assertParticipantAssociation(competitionData, userId, HttpsErrorClass);

      const expiry = getCheckoutExpiryForCompetition(competitionData, {
        nowMillis,
        requireDrawDate: true,
      });
      if (expiry.error) {
        throw new HttpsErrorClass("failed-precondition", expiry.error);
      }

      if (!skillAttemptSnap.exists || skillAttemptSnap.data()?.passed !== true) {
        throw new HttpsErrorClass(
          "failed-precondition",
          "The participant must have passed the skill-gate quiz before additional tickets can be requested."
        );
      }

      const pricing = calculateAdditionalPaymentPricing({
        competitionData,
        ticketQuantity,
        HttpsError: HttpsErrorClass,
      });

      const currentStock = Number(competitionData.stock_quantity || 0);
      if (!Number.isFinite(currentStock) || currentStock < pricing.quantity) {
        throw new HttpsErrorClass(
          "failed-precondition",
          currentStock < pricing.quantity
            ? `Only ${currentStock} ticket${currentStock === 1 ? "" : "s"} remaining in stock.`
            : "Competition stock is invalid."
        );
      }

      const serverNow = admin.firestore.FieldValue.serverTimestamp();
      const requestData = {
        request_id: normalizedRequestId,
        user_ref: userRef,
        competition_id: competitionRef,
        competition_title: competitionData.title || "Competition",
        initiated_by: adminRef,
        requested_ticket_quantity: pricing.quantity,
        unit_price: pricing.unitPrice,
        unit_amount_minor: pricing.unitAmountMinor,
        total_amount: pricing.totalAmount,
        total_amount_minor: pricing.totalAmountMinor,
        currency: pricing.currency,
        payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
        fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
        stripe_checkout_session_id: "",
        stripe_payment_intent_id: "",
        order_id: null,
        issued_ticket_count: 0,
        reason: reasonText,
        success_url: urls.success_url,
        cancel_url: urls.cancel_url,
        expires_at_millis: expiry.expiresAt * 1000,
        stripe_expires_at: expiry.expiresAt,
        fulfillment_attempts: 0,
        created_at: serverNow,
        updated_at: serverNow,
      };

      transaction.set(requestRef, requestData);
      transaction.set(lockRef, {
        request_id: normalizedRequestId,
        user_id: userId,
        competition_id: competitionId,
        expires_at_millis: requestData.expires_at_millis,
        payment_status: requestData.payment_status,
        created_at: serverNow,
        updated_at: serverNow,
      });

      auditService.recordEventInTransaction(
        transaction,
        {
          action: AUDIT_ACTIONS.PAYMENT_REQUEST_CREATED,
          entity_type: "payment",
          entity_id: normalizedRequestId,
          summary: `Admin requested an additional payment for ${pricing.quantity} ticket(s).`,
          reason: reasonText,
          before: null,
          after: {
            payment_status: requestData.payment_status,
            fulfillment_status: requestData.fulfillment_status,
            requested_ticket_quantity: requestData.requested_ticket_quantity,
            unit_price: requestData.unit_price,
            total_amount: requestData.total_amount,
            currency: requestData.currency,
          },
          related: {
            payment_request_id: normalizedRequestId,
            user_id: userId,
            competition_id: competitionId,
          },
          source: "additionalPaymentService.create",
          correlation_id: normalizedRequestId,
        },
        { actor: createAdminAuditActor(adminUid) }
      );

      return { request: requestData, created: true };
    });

    const requestData = transactionResult.request;

    if (
      isExpiredPending(requestData, now()) &&
      !requestData.stripe_checkout_session_id
    ) {
      throw new HttpsErrorClass(
        "failed-precondition",
        "The existing payment request has no verified Stripe session and cannot be replaced automatically. Retry the same request ID or resolve it manually."
      );
    }

    if (
      requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED ||
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID
    ) {
      return {
        request: serializePaymentRequest(normalizedRequestId, requestData, now()),
        sessionUrl: null,
        idempotentReplay: !transactionResult.created,
      };
    }

    if (requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED) {
      throw new HttpsErrorClass(
        "failed-precondition",
        "The checkout session has expired. Create a new payment request with a new request ID."
      );
    }

    try {
      const sessionResult = await createSessionOrResume({
        stripe,
        requestRef,
        request: requestData,
        requestId: normalizedRequestId,
        admin,
        logger,
        HttpsError: HttpsErrorClass,
      });

      if (sessionResult.expired) {
        await markAdditionalPaymentExpired({
          db,
          admin,
          logger,
          requestId: normalizedRequestId,
          sessionId: sessionResult.session?.id,
          HttpsError: HttpsErrorClass,
        });
        throw new HttpsErrorClass(
          "failed-precondition",
          "The checkout session has expired. Create a new payment request with a new request ID."
        );
      }

      const freshSnap = await requestRef.get();
      const fresh = freshSnap.exists ? freshSnap.data() : requestData;

      return {
        request: serializePaymentRequest(normalizedRequestId, fresh, now()),
        sessionUrl: sessionResult.url || null,
        idempotentReplay: !transactionResult.created,
      };
    } catch (error) {
      if (error instanceof HttpsErrorClass) throw error;
      logger.error(
        `[additionalPayment] Failed to create/resume Stripe session for request=${normalizedRequestId}:`,
        error?.message || error
      );
      throw new HttpsErrorClass(
        "internal",
        "The payment request was saved, but the checkout link could not be created. Retry with the same request ID."
      );
    }
  };
}

export function createListAdditionalPaymentRequestsHandler({
  db,
  assertAdmin,
  HttpsError: HttpsErrorClass,
  now = () => Date.now(),
}) {
  return async function handleListAdditionalPaymentRequests(request) {
    await assertAdmin(request);
    const { competitionId, userId, limit } = request.data || {};

    let pageSize = ADDITIONAL_PAYMENT_DEFAULT_LIST_LIMIT;
    if (limit !== undefined) {
      const parsedLimit = Number(limit);
      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > ADDITIONAL_PAYMENT_MAX_LIST_LIMIT
      ) {
        throw new HttpsErrorClass(
          "invalid-argument",
          `limit must be an integer between 1 and ${ADDITIONAL_PAYMENT_MAX_LIST_LIMIT}.`
        );
      }
      pageSize = parsedLimit;
    }

    let query = db.collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION);
    if (competitionId) {
      query = query.where(
        "competition_id",
        "==",
        db.collection("competition").doc(competitionId)
      );
    } else if (userId) {
      query = query.where("user_ref", "==", db.collection("user").doc(userId));
    }

    const snapshot = await query.limit(ADDITIONAL_PAYMENT_MAX_LIST_LIMIT).get();
    const nowMillis = now();
    const requests = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        data: docSnap.data(),
      }))
      .filter(({ data }) => !userId || getReferenceId(data.user_ref) === userId)
      .sort(
        (left, right) =>
          getRequestMillis(right.data.created_at) - getRequestMillis(left.data.created_at)
      )
      .slice(0, pageSize)
      .map(({ id, data }) => serializePaymentRequest(id, data, nowMillis));

    return { requests };
  };
}

export function createGetMyAdditionalPaymentRequestsHandler({
  db,
  assertAuthenticated,
}) {
  return async function handleGetMyAdditionalPaymentRequests(request) {
    const uid = assertAuthenticated(request);
    const userRef = db.collection("user").doc(uid);
    const snapshot = await db
      .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
      .where("user_ref", "==", userRef)
      .limit(ADDITIONAL_PAYMENT_MAX_LIST_LIMIT)
      .get();

    const requests = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
      .sort(
        (left, right) =>
          getRequestMillis(right.data.created_at) - getRequestMillis(left.data.created_at)
      )
      .slice(0, ADDITIONAL_PAYMENT_DEFAULT_LIST_LIMIT)
      .map(({ id, data }) => serializeParticipantPaymentRequest(id, data));

    return { requests };
  };
}

export function createGetAdditionalPaymentCheckoutUrlHandler({
  db,
  admin,
  logger,
  assertAuthenticated,
  HttpsError: HttpsErrorClass,
  stripeFactory = (key) => new Stripe(key),
  getStripeSecretKey = () => process.env.STRIPE_SECRET_KEY,
  now = () => Date.now(),
}) {
  return async function handleGetAdditionalPaymentCheckoutUrl(request) {
    const uid = assertAuthenticated(request);
    const { requestId } = request.data || {};
    const normalizedRequestId = normalizeRequestId(requestId);
    if (!normalizedRequestId) {
      throw new HttpsErrorClass("invalid-argument", "A valid requestId is required.");
    }

    const requestRef = db
      .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
      .doc(normalizedRequestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      throw new HttpsErrorClass("not-found", "Payment request not found.");
    }

    const requestData = requestSnap.data();
    const ownerId = getReferenceId(requestData.user_ref);
    let isAdminViewer = false;
    if (ownerId !== uid) {
      const callerSnap = await db.collection("user").doc(uid).get();
      if (!callerSnap.exists || callerSnap.data()?.role !== "admin") {
        throw new HttpsErrorClass(
          "permission-denied",
          "You cannot access another participant's payment request."
        );
      }
      isAdminViewer = true;
    }

    const serializeForViewer = isAdminViewer
      ? serializePaymentRequest
      : serializeParticipantPaymentRequest;

    if (
      requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED ||
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID
    ) {
      return {
        can_pay: false,
        reason: "already_paid",
        request: serializeForViewer(normalizedRequestId, requestData, now()),
      };
    }

    if (requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.FAILED) {
      return {
        can_pay: false,
        reason: "failed",
        request: serializeForViewer(normalizedRequestId, requestData, now()),
      };
    }

    const sessionId =
      typeof requestData.stripe_checkout_session_id === "string"
        ? requestData.stripe_checkout_session_id
        : "";

    if (!sessionId) {
      if (
        requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED ||
        isExpiredPending(requestData, now())
      ) {
        return {
          can_pay: false,
          reason: "expired",
          request: serializeForViewer(normalizedRequestId, requestData, now()),
        };
      }
      throw new HttpsErrorClass(
        "failed-precondition",
        "The payment link is not ready yet. Ask an administrator to retry it."
      );
    }

    const stripeSecretKey = getStripeSecretKey();
    if (!stripeSecretKey) {
      throw new HttpsErrorClass(
        "failed-precondition",
        "Stripe is not configured on the server."
      );
    }

    const stripe = stripeFactory(stripeSecretKey);
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      logger.error(
        `[additionalPayment] Could not verify Stripe session for request=${normalizedRequestId}:`,
        error?.message || error
      );
      throw new HttpsErrorClass(
        "failed-precondition",
        "The payment session could not be verified. Try again shortly."
      );
    }

    if (!session || session.id !== sessionId) {
      throw new HttpsErrorClass(
        "failed-precondition",
        "The payment session could not be verified."
      );
    }

    const state = classifyStripeCheckoutSession(session);

    if (state === "paid") {
      return {
        can_pay: false,
        reason: "already_paid",
        request: serializeForViewer(normalizedRequestId, requestData, now()),
      };
    }

    if (state === "complete_unpaid") {
      return {
        can_pay: false,
        reason: "processing",
        request: serializeForViewer(normalizedRequestId, requestData, now()),
      };
    }

    if (state === "expired") {
      await markAdditionalPaymentExpired({
        db,
        admin,
        logger,
        requestId: normalizedRequestId,
        sessionId,
        HttpsError: HttpsErrorClass,
      });
      return {
        can_pay: false,
        reason: "expired",
        request: serializeForViewer(
          normalizedRequestId,
          { ...requestData, payment_status: ADDITIONAL_PAYMENT_STATUS.EXPIRED },
          now()
        ),
      };
    }

    if (state === "open") {
      if (requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED) {
        return {
          can_pay: false,
          reason: "expired",
          request: serializeForViewer(normalizedRequestId, requestData, now()),
        };
      }
      if (!session.url) {
        throw new HttpsErrorClass(
          "failed-precondition",
          "The payment link is not available yet. Ask an administrator to retry it."
        );
      }
      return {
        can_pay: true,
        url: session.url,
        expires_at_millis: Number(requestData.expires_at_millis) || null,
        request: serializeForViewer(normalizedRequestId, requestData, now()),
      };
    }

    throw new HttpsErrorClass(
      "failed-precondition",
      "The payment session state could not be resolved. Try again shortly."
    );
  };
}

export function evaluateAdditionalPaymentSettlement({
  eventType,
  session,
  requestData,
}) {
  if (eventType !== "checkout.session.completed") {
    return { action: "ignore" };
  }

  const requestId = session?.metadata?.additionalPaymentRequestId;
  if (!requestId || typeof requestId !== "string") {
    return { action: "ignore" };
  }

  if (!requestData) {
    throw new SettlementValidationError(
      "payment_request_not_found",
      "Additional payment request not found.",
      404
    );
  }

  if (
    !session?.id ||
    requestData.stripe_checkout_session_id !== session.id
  ) {
    throw new SettlementValidationError(
      "session_mismatch",
      "Checkout session does not match the additional payment request."
    );
  }

  const expectedAmount = getExpectedTotalMinor(requestData);

  if (!Number.isInteger(session.amount_total) || session.amount_total !== expectedAmount) {
    throw new SettlementValidationError(
      "amount_mismatch",
      "Checkout session amount does not match the additional payment request."
    );
  }

  const expectedCurrency = String(
    requestData.currency || ADDITIONAL_PAYMENT_CURRENCY
  ).toLowerCase();
  const sessionCurrency = String(session.currency || "").toLowerCase();
  if (!sessionCurrency || sessionCurrency !== expectedCurrency) {
    throw new SettlementValidationError(
      "currency_mismatch",
      "Checkout session currency does not match the additional payment request."
    );
  }

  if (session.mode !== "payment") {
    throw new SettlementValidationError(
      "invalid_mode",
      "Checkout session must use payment mode."
    );
  }

  if (requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED) {
    return {
      action: "already_processed",
      requestId,
      paymentIntentId:
        typeof requestData.stripe_payment_intent_id === "string"
          ? requestData.stripe_payment_intent_id
          : "",
    };
  }

  if (session.payment_status === "unpaid") {
    if (
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID ||
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED
    ) {
      return { action: "already_processed", requestId };
    }
    return { action: "pending", requestId, reason: "unpaid" };
  }

  if (session.payment_status === "paid") {
    if (
      typeof session.payment_intent !== "string" ||
      !session.payment_intent
    ) {
      throw new SettlementValidationError(
        "missing_payment_intent",
        "Paid Checkout session is missing a payment intent."
      );
    }
    if (
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED ||
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.FAILED
    ) {
      throw new SettlementValidationError(
        "invalid_request_status",
        `Additional payment request has invalid status: ${requestData.payment_status}`,
        409
      );
    }
    return {
      action: "fulfill",
      requestId,
      amountMinor: expectedAmount,
      currency: sessionCurrency,
      paymentIntentId: session.payment_intent,
      settlementAlreadyRecorded:
        requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID,
    };
  }

  if (session.payment_status === "no_payment_required") {
    throw new SettlementValidationError(
      "amount_mismatch",
      "Additional payment sessions must have a positive paid amount."
    );
  }

  throw new SettlementValidationError(
    "unsupported_payment_status",
    `Unsupported Checkout payment status: ${String(session.payment_status)}`
  );
}

async function markAdditionalPaymentSettled({
  db,
  admin,
  logger,
  requestId,
  session,
  HttpsError: HttpsErrorClass = HttpsError,
}) {
  const requestRef = db
    .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
    .doc(requestId);
  const auditService = createAdminAuditService({
    db,
    admin,
    logger,
    HttpsError: HttpsErrorClass,
  });

  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) {
      throw new SettlementValidationError(
        "payment_request_not_found",
        "Additional payment request not found.",
        404
      );
    }

    const requestData = requestSnap.data();
    if (requestData.stripe_checkout_session_id !== session.id) {
      throw new SettlementValidationError(
        "session_mismatch",
        "Checkout session does not match the additional payment request."
      );
    }
    const expectedMinor = getExpectedTotalMinor(requestData);
    if (!Number.isInteger(session.amount_total) || session.amount_total !== expectedMinor) {
      throw new SettlementValidationError(
        "amount_mismatch",
        "Checkout session amount does not match the additional payment request."
      );
    }
    if (
      String(session.currency || "").toLowerCase() !==
      String(requestData.currency || ADDITIONAL_PAYMENT_CURRENCY).toLowerCase()
    ) {
      throw new SettlementValidationError(
        "currency_mismatch",
        "Checkout session currency does not match the additional payment request."
      );
    }
    if (
      requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED
    ) {
      return { outcome: "already_fulfilled", requestId };
    }
    if (requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID) {
      return { outcome: "already_paid", requestId };
    }
    if (
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED ||
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.FAILED
    ) {
      throw new SettlementValidationError(
        "invalid_request_status",
        `Additional payment request has invalid status: ${requestData.payment_status}`,
        409
      );
    }

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : "";
    if (!paymentIntentId) {
      throw new SettlementValidationError(
        "missing_payment_intent",
        "Paid Checkout session is missing a payment intent."
      );
    }

    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(requestRef, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
      fulfillment_status:
        requestData.fulfillment_status || ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
      stripe_payment_intent_id: paymentIntentId,
      paid_at: requestData.paid_at || serverNow,
      updated_at: serverNow,
    });

    auditService.recordEventInTransaction(
      transaction,
      {
        action: AUDIT_ACTIONS.PAYMENT_RECEIVED,
        entity_type: "payment",
        entity_id: requestId,
        summary: `Additional payment settled for ${requestData.requested_ticket_quantity} ticket(s).`,
        before: {
          payment_status: requestData.payment_status,
          fulfillment_status: requestData.fulfillment_status,
          requested_ticket_quantity: requestData.requested_ticket_quantity,
          total_amount: requestData.total_amount,
          currency: requestData.currency,
        },
        after: {
          payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
          fulfillment_status:
            requestData.fulfillment_status || ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
          requested_ticket_quantity: requestData.requested_ticket_quantity,
          total_amount: requestData.total_amount,
          currency: requestData.currency,
        },
        related: {
          payment_request_id: requestId,
          user_id: getReferenceId(requestData.user_ref),
          competition_id: getReferenceId(requestData.competition_id),
        },
        source: "stripeWebhook.additionalPayment",
        correlation_id: requestId,
      },
      { actor: createSystemAuditActor() }
    );

    return { outcome: "marked_paid", requestId };
  });
}

async function markAdditionalPaymentProcessing({
  db,
  admin,
  requestId,
}) {
  const requestRef = db
    .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
    .doc(requestId);
  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) return { outcome: "missing" };
    const requestData = requestSnap.data();
    if (requestData.payment_status !== ADDITIONAL_PAYMENT_STATUS.PENDING) {
      return { outcome: "ignored" };
    }
    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(requestRef, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PROCESSING,
      updated_at: serverNow,
    });
    return { outcome: "marked_processing" };
  });
}

export async function fulfillAdditionalPaymentRequest({
  db,
  admin,
  logger,
  requestId,
  HttpsError: HttpsErrorClass = HttpsError,
}) {
  const requestRef = db
    .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
    .doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    throw new SettlementValidationError(
      "payment_request_not_found",
      "Additional payment request not found.",
      404
    );
  }

  const requestData = requestSnap.data();
  if (requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED) {
    return { outcome: "already_fulfilled", requestId };
  }
  if (requestData.payment_status !== ADDITIONAL_PAYMENT_STATUS.PAID) {
    throw new Error("Additional payment has not been verified as paid.");
  }

  const userId = getReferenceId(requestData.user_ref);
  const competitionId = getReferenceId(requestData.competition_id);
  const quantity = Number(requestData.requested_ticket_quantity);
  const unitPrice = Number(requestData.unit_price);
  const totalAmount = Number(requestData.total_amount);
  const currency = String(requestData.currency || ADDITIONAL_PAYMENT_CURRENCY);
  const paymentIntentId =
    typeof requestData.stripe_payment_intent_id === "string"
      ? requestData.stripe_payment_intent_id
      : "";

  if (!userId || !competitionId || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Additional payment request references are invalid.");
  }

  const orderRef = db.collection("order").doc();
  const auditService = createAdminAuditService({
    db,
    admin,
    logger,
    HttpsError: HttpsErrorClass,
  });
  const settlementContext = createVerifiedStripeSettlementContext(
    PAYMENT_SETTLEMENT.STRIPE_PAID,
    {
      orderId: orderRef.id,
      amountMinor: Math.round(totalAmount * 100),
      currency: currency.toLowerCase(),
      paymentIntentId,
    }
  );

  try {
    const result = await runOrderTransaction(db, admin, {
      uid: userId,
      competitionId,
      ticketQuantity: quantity,
      questionAnswer: {},
      freeTicketsToUse: 0,
      referralsToBurn: [],
      orderId: orderRef.id,
      paymentSettlement: settlementContext,
      additionalPayment: {
        requestRef,
        requestId,
        unitPrice,
        totalAmount,
        currency,
        onFulfilled: (transaction, fulfillment) => {
          const serverNow = admin.firestore.FieldValue.serverTimestamp();
          transaction.update(requestRef, {
            fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED,
            order_id: fulfillment.orderRef,
            issued_ticket_count: fulfillment.ticketResults.length,
            fulfilled_at: serverNow,
            fulfillment_error: admin.firestore.FieldValue.delete(),
            updated_at: serverNow,
          });

          auditService.recordEventInTransaction(
            transaction,
            {
              action: AUDIT_ACTIONS.PAYMENT_REQUEST_FULFILLED,
              entity_type: "payment",
              entity_id: requestId,
              summary: `Additional payment fulfilled with ${fulfillment.ticketResults.length} ticket(s).`,
              before: {
                payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
                fulfillment_status:
                  requestData.fulfillment_status ||
                  ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
                requested_ticket_quantity: quantity,
                total_amount: totalAmount,
                currency,
              },
              after: {
                payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
                fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED,
                requested_ticket_quantity: quantity,
                issued_ticket_count: fulfillment.ticketResults.length,
                total_amount: totalAmount,
                currency,
              },
              related: {
                payment_request_id: requestId,
                user_id: userId,
                competition_id: competitionId,
                order_id: fulfillment.orderRef.id,
              },
              source: "stripeWebhook.additionalPayment",
              correlation_id: requestId,
            },
            { actor: createSystemAuditActor() }
          );
        },
      },
    });

    return {
      outcome: "fulfilled",
      requestId,
      orderId: result.orderId,
      ticketCount: result.tickets.length,
    };
  } catch (error) {
    if (error instanceof AdditionalPaymentAlreadyFulfilledError) {
      return { outcome: "already_fulfilled", requestId };
    }
    throw error;
  }
}

export async function recordAdditionalPaymentUnfulfilled({
  db,
  admin,
  logger,
  requestId,
  sessionId,
  paymentIntentId,
  failureReason,
  HttpsError: HttpsErrorClass = HttpsError,
}) {
  const requestRef = db
    .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
    .doc(requestId);
  const auditService = createAdminAuditService({
    db,
    admin,
    logger,
    HttpsError: HttpsErrorClass,
  });

  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) return { outcome: "request_missing" };

    const requestData = requestSnap.data();
    if (requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED) {
      return { outcome: "already_fulfilled" };
    }
    if (
      requestData.stripe_checkout_session_id &&
      sessionId &&
      requestData.stripe_checkout_session_id !== sessionId
    ) {
      return { outcome: "session_mismatch" };
    }

    const failureText = String(failureReason || "Ticket fulfillment failed.")
      .trim()
      .slice(0, 1000);
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    transaction.update(requestRef, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FAILED,
      ...(paymentIntentId
        ? { stripe_payment_intent_id: paymentIntentId }
        : {}),
      paid_at: requestData.paid_at || serverNow,
      failed_at: serverNow,
      failure_reason: failureText,
      fulfillment_error: failureText,
      fulfillment_attempts: admin.firestore.FieldValue.increment(1),
      updated_at: serverNow,
    });

    auditService.recordEventInTransaction(
      transaction,
      {
        action: AUDIT_ACTIONS.PAYMENT_REQUEST_FAILED,
        entity_type: "payment",
        entity_id: requestId,
        summary: `Additional payment was received but ticket fulfillment failed.`,
        reason: failureText,
        before: {
          payment_status: requestData.payment_status,
          fulfillment_status: requestData.fulfillment_status,
          requested_ticket_quantity: requestData.requested_ticket_quantity,
          total_amount: requestData.total_amount,
          currency: requestData.currency,
        },
        after: {
          payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
          fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FAILED,
          requested_ticket_quantity: requestData.requested_ticket_quantity,
          total_amount: requestData.total_amount,
          currency: requestData.currency,
        },
        related: {
          payment_request_id: requestId,
          user_id: getReferenceId(requestData.user_ref),
          competition_id: getReferenceId(requestData.competition_id),
        },
        source: "stripeWebhook.additionalPayment",
        correlation_id: requestId,
      },
      { actor: createSystemAuditActor() }
    );

    return { outcome: "marked_failed" };
  });
}

export async function markAdditionalPaymentExpired({
  db,
  admin,
  logger,
  requestId,
  sessionId,
  HttpsError: HttpsErrorClass = HttpsError,
}) {
  const requestRef = db
    .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
    .doc(requestId);
  const auditService = createAdminAuditService({
    db,
    admin,
    logger,
    HttpsError: HttpsErrorClass,
  });

  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) return { outcome: "request_missing" };

    const requestData = requestSnap.data();
    if (
      requestData.fulfillment_status === ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED ||
      requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.PAID
    ) {
      return { outcome: "already_paid" };
    }
    if (
      requestData.stripe_checkout_session_id &&
      sessionId &&
      requestData.stripe_checkout_session_id !== sessionId
    ) {
      return { outcome: "session_mismatch" };
    }
    if (requestData.payment_status === ADDITIONAL_PAYMENT_STATUS.EXPIRED) {
      return { outcome: "already_expired" };
    }

    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(requestRef, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.EXPIRED,
      expired_at: serverNow,
      updated_at: serverNow,
    });

    auditService.recordEventInTransaction(
      transaction,
      {
        action: AUDIT_ACTIONS.PAYMENT_REQUEST_EXPIRED,
        entity_type: "payment",
        entity_id: requestId,
        summary: `Additional payment request ${requestId} expired before settlement.`,
        before: {
          payment_status: requestData.payment_status,
          fulfillment_status: requestData.fulfillment_status,
          requested_ticket_quantity: requestData.requested_ticket_quantity,
          total_amount: requestData.total_amount,
          currency: requestData.currency,
        },
        after: {
          payment_status: ADDITIONAL_PAYMENT_STATUS.EXPIRED,
          fulfillment_status:
            requestData.fulfillment_status || ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
          requested_ticket_quantity: requestData.requested_ticket_quantity,
          total_amount: requestData.total_amount,
          currency: requestData.currency,
        },
        related: {
          payment_request_id: requestId,
          user_id: getReferenceId(requestData.user_ref),
          competition_id: getReferenceId(requestData.competition_id),
        },
        source: "stripeWebhook.additionalPayment",
        correlation_id: requestId,
      },
      { actor: createSystemAuditActor() }
    );

    return { outcome: "marked_expired" };
  });
}

export async function processAdditionalPaymentWebhookEvent({
  db,
  admin,
  logger,
  event,
  HttpsError: HttpsErrorClass = HttpsError,
}) {
  const session = event?.data?.object;
  const requestId = session?.metadata?.additionalPaymentRequestId;
  if (!requestId || typeof requestId !== "string") {
    return null;
  }

  const requestRef = db
    .collection(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION)
    .doc(requestId);

  if (event.type === "checkout.session.expired") {
    try {
      const outcome = await markAdditionalPaymentExpired({
        db,
        admin,
        logger,
        requestId,
        sessionId: session?.id,
        HttpsError: HttpsErrorClass,
      });
      logger.info(
        `[stripeWebhook] Additional payment request ${requestId} expiry handled: ${outcome.outcome}`
      );
      return { statusCode: 200, body: "Additional payment request expiry handled." };
    } catch (error) {
      logger.error(
        `[stripeWebhook] Failed to handle expiry for additional payment request ${requestId}:`,
        error?.message || error
      );
      return { statusCode: 500, body: "Failed to record additional payment expiry." };
    }
  }

  if (event.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "Webhook event ignored." };
  }

  let decision;
  try {
    const requestSnap = await requestRef.get();
    decision = evaluateAdditionalPaymentSettlement({
      eventType: event.type,
      session,
      requestData: requestSnap.exists ? requestSnap.data() : null,
    });
  } catch (error) {
    if (error instanceof SettlementValidationError) {
      logger.error(
        `[stripeWebhook] Additional payment validation failed for request ${requestId}: ${error.code} — ${error.message}`
      );
      return { statusCode: error.statusCode, body: error.message };
    }
    throw error;
  }

  if (decision.action === "ignore") {
    return { statusCode: 200, body: "Webhook event ignored." };
  }
  if (decision.action === "pending") {
    try {
      await markAdditionalPaymentProcessing({ db, admin, requestId });
    } catch (error) {
      logger.warn(
        `[stripeWebhook] Could not mark additional payment ${requestId} as processing:`,
        error?.message || error
      );
    }
    return { statusCode: 200, body: "Payment pending." };
  }
  if (decision.action === "already_processed") {
    return { statusCode: 200, body: "Additional payment already processed." };
  }

  try {
    await markAdditionalPaymentSettled({
      db,
      admin,
      logger,
      requestId,
      session,
      HttpsError: HttpsErrorClass,
    });
  } catch (error) {
    if (error instanceof SettlementValidationError) {
      logger.error(
        `[stripeWebhook] Additional payment settlement failed for request ${requestId}: ${error.code} — ${error.message}`
      );
      return { statusCode: error.statusCode, body: error.message };
    }
    logger.error(
      `[stripeWebhook] Additional payment settlement transaction failed for request ${requestId}:`,
      error?.message || error
    );
    return { statusCode: 500, body: "Failed to record additional payment settlement." };
  }

  try {
    const outcome = await fulfillAdditionalPaymentRequest({
      db,
      admin,
      logger,
      requestId,
      HttpsError: HttpsErrorClass,
    });
    logger.info(
      `[stripeWebhook] Additional payment request ${requestId} ${outcome.outcome}.`
    );
    return { statusCode: 200, body: "Additional payment processed." };
  } catch (error) {
    try {
      const recorded = await recordAdditionalPaymentUnfulfilled({
        db,
        admin,
        logger,
        requestId,
        sessionId: session?.id,
        paymentIntentId: decision.paymentIntentId,
        failureReason: error?.message || "Ticket fulfillment failed.",
        HttpsError: HttpsErrorClass,
      });
      logger.warn(
        `[stripeWebhook] Recorded additional payment ${requestId} as paid-unfulfilled: ${recorded.outcome}`
      );
    } catch (recordError) {
      logger.error(
        `[stripeWebhook] Failed to record paid-unfulfilled additional payment ${requestId}:`,
        recordError?.message || recordError
      );
    }
    logger.error(
      `[stripeWebhook] Additional payment fulfillment failed for request ${requestId}:`,
      error?.message || error
    );
    return {
      statusCode: 500,
      body: `Additional payment fulfillment error: ${error?.message || "unknown error"}`,
    };
  }
}
