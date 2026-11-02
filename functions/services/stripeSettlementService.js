import { PAYMENT_SETTLEMENT } from "./ticketOrigin.js";

const CHECKOUT_COMPLETED_EVENT = "checkout.session.completed";
const VERIFIED_SETTLEMENT_CONTEXT = Symbol("verifiedStripeSettlementContext");

export class SettlementValidationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "SettlementValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function createVerifiedSettlementContext(type, { orderId, amountMinor, currency, paymentIntentId = "" }) {
  return Object.freeze({
    type,
    orderId,
    amountMinor,
    currency,
    paymentIntentId,
    [VERIFIED_SETTLEMENT_CONTEXT]: true,
  });
}

export function isVerifiedStripeSettlementContext(value) {
  return Boolean(
    value &&
      value[VERIFIED_SETTLEMENT_CONTEXT] === true &&
      (value.type === PAYMENT_SETTLEMENT.STRIPE_PAID ||
        value.type === PAYMENT_SETTLEMENT.STRIPE_ZERO_PAYMENT)
  );
}

function expectedAmountInMinorUnits(orderData) {
  const rawAmount = orderData?.total_amount;
  if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount) || rawAmount < 0) {
    throw new SettlementValidationError(
      "invalid_order_amount",
      "Order total_amount must be a finite non-negative number."
    );
  }

  const minorUnits = Math.round(rawAmount * 100);
  if (!Number.isSafeInteger(minorUnits)) {
    throw new SettlementValidationError(
      "invalid_order_amount",
      "Order total_amount cannot be represented safely in minor units."
    );
  }
  return minorUnits;
}

function preserveStripeClassification(orderData) {
  if (orderData?.stripe_status === "paid" || orderData?.stripe_status === "free") {
    return {
      expectedStripeStatus: orderData.stripe_status,
      paymentIntentId:
        typeof orderData.stripe_payment_intent_id === "string"
          ? orderData.stripe_payment_intent_id
          : "",
    };
  }
  return null;
}

function alreadyProcessed(orderId, orderData, session) {
  const preserved = preserveStripeClassification(orderData);
  if (preserved) {
    return { action: "already_processed", orderId, ...preserved };
  }

  if (session.payment_status === "paid") {
    return {
      action: "already_processed",
      orderId,
      expectedStripeStatus: "paid",
      paymentIntentId: session.payment_intent,
    };
  }
  if (session.payment_status === "no_payment_required") {
    return {
      action: "already_processed",
      orderId,
      expectedStripeStatus: "free",
      paymentIntentId: "",
    };
  }

  return { action: "already_processed", orderId, expectedStripeStatus: null, paymentIntentId: "" };
}

export function evaluateCheckoutSettlement({ eventType, session, orderData }) {
  if (eventType !== CHECKOUT_COMPLETED_EVENT) {
    return { action: "ignore" };
  }

  const orderId = session?.metadata?.orderId;
  if (!orderId || typeof orderId !== "string") {
    throw new SettlementValidationError(
      "missing_order_id",
      "Missing orderId in session metadata."
    );
  }

  if (!orderData) {
    throw new SettlementValidationError("order_not_found", "Order not found.", 404);
  }

  if (!session?.id || orderData.stripe_checkout_session_id !== session.id) {
    throw new SettlementValidationError(
      "session_mismatch",
      "Checkout session does not match the pending order."
    );
  }

  const expectedAmount = expectedAmountInMinorUnits(orderData);
  if (
    !Number.isInteger(session.amount_total) ||
    expectedAmount !== session.amount_total
  ) {
    throw new SettlementValidationError(
      "amount_mismatch",
      "Checkout session amount does not match the order amount."
    );
  }

  const expectedCurrency = String(orderData.currency || "GBP").toLowerCase();
  const sessionCurrency = String(session.currency || "").toLowerCase();
  if (!sessionCurrency || sessionCurrency !== expectedCurrency) {
    throw new SettlementValidationError(
      "currency_mismatch",
      "Checkout session currency does not match the order currency."
    );
  }

  if (session.mode !== "payment") {
    throw new SettlementValidationError(
      "invalid_mode",
      "Checkout session must use payment mode."
    );
  }

  if (session.payment_status === "unpaid") {
    if (orderData.status === "paid") {
      return alreadyProcessed(orderId, orderData, session);
    }
    if (orderData.status !== "pending") {
      throw new SettlementValidationError(
        "invalid_order_status",
        `Order has invalid status: ${orderData.status}`
      );
    }
    return { action: "pending", orderId, reason: "unpaid" };
  }

  if (session.payment_status === "paid") {
    if (typeof session.payment_intent !== "string" || !session.payment_intent) {
      throw new SettlementValidationError(
        "missing_payment_intent",
        "Paid Checkout session is missing a payment intent."
      );
    }
    if (orderData.status === "paid") {
      return alreadyProcessed(orderId, orderData, session);
    }
    if (orderData.status !== "pending") {
      throw new SettlementValidationError(
        "invalid_order_status",
        `Order has invalid status: ${orderData.status}`
      );
    }
    return {
      action: "fulfill",
      orderId,
      settlement: PAYMENT_SETTLEMENT.STRIPE_PAID,
      settlementContext: createVerifiedSettlementContext(PAYMENT_SETTLEMENT.STRIPE_PAID, {
        orderId,
        amountMinor: expectedAmount,
        currency: sessionCurrency,
        paymentIntentId: session.payment_intent,
      }),
      paymentIntentId: session.payment_intent,
    };
  }

  if (session.payment_status === "no_payment_required") {
    if (session.amount_total !== 0) {
      throw new SettlementValidationError(
        "amount_mismatch",
        "No-payment Checkout session must have a zero amount."
      );
    }
    if (orderData.status === "paid") {
      return alreadyProcessed(orderId, orderData, session);
    }
    if (orderData.status !== "pending") {
      throw new SettlementValidationError(
        "invalid_order_status",
        `Order has invalid status: ${orderData.status}`
      );
    }
    return {
      action: "fulfill",
      orderId,
      settlement: PAYMENT_SETTLEMENT.STRIPE_ZERO_PAYMENT,
      settlementContext: createVerifiedSettlementContext(
        PAYMENT_SETTLEMENT.STRIPE_ZERO_PAYMENT,
        {
          orderId,
          amountMinor: expectedAmount,
          currency: sessionCurrency,
        }
      ),
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : "",
    };
  }

  throw new SettlementValidationError(
    "unsupported_payment_status",
    `Unsupported Checkout payment status: ${String(session.payment_status)}`
  );
}
