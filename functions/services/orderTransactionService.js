import { getOrderPricing } from "./orderPricingService.js";
import { assertReferralRedeemable } from "./referralEligibility.js";
import {
  getDrawDateState,
  getReferenceId,
  hasDrawStarted,
} from "./ticketAdjustmentPolicy.js";
import {
  getReferralTicketOrigin,
  PAYMENT_SETTLEMENT,
  TICKET_ORIGIN,
} from "./ticketOrigin.js";
import { isVerifiedStripeSettlementContext } from "./stripeSettlementService.js";

/**
 * Derives a short uppercase prefix from a competition title.
 * @param {string} title
 * @returns {string}
 */
export function generateTicketPrefix(title) {
  if (!title || typeof title !== "string") return "TKT";

  const prefix = title
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase())
    .join("");

  return prefix || "TKT";
}

/**
 * Builds the formatted ticket sequence string.
 * @param {string} prefix
 * @param {number} sequence
 * @returns {string}
 */
export function formatTicketSequence(prefix, sequence) {
  return `${prefix}${String(sequence).padStart(3, "0")}`;
}

export const DIRECT_PAYMENT_REQUIRED_MESSAGE =
  "Paid orders must be completed through Stripe Checkout.";

export const MAX_CHECKOUT_TICKET_QUANTITY = 100;
export const MAX_CHECKOUT_REFERRAL_TICKETS = 100;

// Stripe Checkout sessions must expire between 30 minutes and 24 hours after
// creation. Keep a small buffer so the API call itself cannot push a session
// below Stripe's minimum lifetime.
export const STRIPE_CHECKOUT_MIN_EXPIRY_SECONDS = 30 * 60;
export const STRIPE_CHECKOUT_MAX_EXPIRY_SECONDS = 24 * 60 * 60;
export const STRIPE_CHECKOUT_EXPIRY_BUFFER_SECONDS = 60;

export class DirectPaymentRequiredError extends Error {
  constructor(message = DIRECT_PAYMENT_REQUIRED_MESSAGE) {
    super(message);
    this.name = "DirectPaymentRequiredError";
    this.code = "direct_payment_required";
  }
}

export class CheckoutValidationError extends Error {
  constructor(message, code = "invalid-argument") {
    super(message);
    this.name = "CheckoutValidationError";
    this.code = code;
  }
}

export class AccountNotEligibleError extends Error {
  constructor(message = "This account is being deleted or is no longer eligible for purchases.") {
    super(message);
    this.name = "AccountNotEligibleError";
    this.code = "account_not_eligible";
  }
}

export class AdditionalPaymentAlreadyFulfilledError extends Error {
  constructor(message = "This additional payment request has already been fulfilled.") {
    super(message);
    this.name = "AdditionalPaymentAlreadyFulfilledError";
    this.code = "additional_payment_already_fulfilled";
  }
}

export function assertAccountEligibleForCheckout(userData) {
  const status = String(userData?.status || "").trim().toLowerCase();
  if (userData?.is_deleted === true || status === "deleting" || status === "deleted") {
    throw new AccountNotEligibleError();
  }
}

export function getCheckoutCompetitionBlock(
  competitionData,
  { nowMillis = Date.now(), requireDrawDate = false } = {},
) {
  if (!competitionData) {
    return "Competition not found.";
  }

  const status = String(competitionData.status || "").trim().toLowerCase();
  if (status !== "active") {
    return "This competition is no longer accepting entries.";
  }

  if (competitionData.winner_ref || competitionData.winner_ticket_ref) {
    return "This competition has already declared a winner.";
  }

  if (hasDrawStarted(competitionData)) {
    return "This competition has already started drawing.";
  }

  const drawDate = getDrawDateState(competitionData.draw_date);
  if (!drawDate.present) {
    return requireDrawDate
      ? "The competition draw date is missing, so checkout cannot be started safely."
      : null;
  }
  if (!drawDate.valid) {
    return "The competition draw date is invalid, so checkout cannot be started safely.";
  }

  if (drawDate.millis <= nowMillis) {
    return "This competition has already closed for entries.";
  }

  return null;
}

export function calculateStripeCheckoutExpiry({ drawDateMillis, nowMillis = Date.now() }) {
  if (!Number.isFinite(drawDateMillis)) {
    return { error: "The competition draw date is missing or invalid, so checkout cannot be started safely." };
  }

  const nowSeconds = Math.floor(nowMillis / 1000);
  const drawDeadlineSeconds = Math.floor(drawDateMillis / 1000) - 1;
  const earliestAllowedExpiry = nowSeconds
    + STRIPE_CHECKOUT_MIN_EXPIRY_SECONDS
    + STRIPE_CHECKOUT_EXPIRY_BUFFER_SECONDS;
  const latestAllowedExpiry = nowSeconds + STRIPE_CHECKOUT_MAX_EXPIRY_SECONDS;

  if (drawDeadlineSeconds < earliestAllowedExpiry) {
    return {
      error: "There is not enough time before the competition draw to start a secure checkout session.",
    };
  }

  return {
    expiresAt: Math.min(drawDeadlineSeconds, latestAllowedExpiry),
  };
}

export function getCheckoutExpiryForCompetition(
  competitionData,
  { nowMillis = Date.now(), requireDrawDate = true } = {},
) {
  const block = getCheckoutCompetitionBlock(competitionData, {
    nowMillis,
    requireDrawDate,
  });
  if (block) {
    return { error: block };
  }

  const drawDate = getDrawDateState(competitionData.draw_date);
  const expiry = calculateStripeCheckoutExpiry({
    drawDateMillis: drawDate.millis,
    nowMillis,
  });

  return {
    ...expiry,
    drawDateMillis: drawDate.millis,
  };
}

export async function validateCheckoutPreflight(
  db,
  {
    uid,
    competitionId,
    ticketQuantity,
    freeTicketsToUse = 0,
    referralsToBurn = [],
    nowMillis = Date.now(),
  } = {},
) {
  if (!competitionId || !uid) {
    throw new CheckoutValidationError("competitionId and uid are required.", "invalid-argument");
  }

  const checkoutInput = validateCheckoutInputs({
    ticketQuantity,
    freeTicketsToUse,
    referralsToBurn,
  });

  const competitionRef = db.collection("competition").doc(competitionId);
  const userRef = db.collection("user").doc(uid);
  const [competitionSnap, userSnap] = await Promise.all([
    competitionRef.get(),
    userRef.get(),
  ]);

  if (!competitionSnap.exists) {
    throw new CheckoutValidationError("Competition not found.", "not-found");
  }

  const competitionData = competitionSnap.data();
  const expiry = getCheckoutExpiryForCompetition(competitionData, {
    nowMillis,
    requireDrawDate: true,
  });
  if (expiry.error) {
    throw new CheckoutValidationError(expiry.error, "failed-precondition");
  }

  if (!userSnap.exists) {
    throw new CheckoutValidationError("User not found.", "failed-precondition");
  }

  assertAccountEligibleForCheckout(userSnap.data());

  const freeTickets = checkoutInput.freeTicketsToUse;
  if (freeTickets > 0) {
    const storedFreeTickets = userSnap.data()?.free_tickets;
    if (
      !Number.isFinite(storedFreeTickets) ||
      !Number.isInteger(storedFreeTickets) ||
      storedFreeTickets < 0
    ) {
      throw new CheckoutValidationError(
        "The stored free-ticket balance is invalid, so referral credits cannot be used safely.",
        "failed-precondition",
      );
    }
    if (storedFreeTickets < freeTickets) {
      throw new CheckoutValidationError(
        `Insufficient free-ticket balance: requested ${freeTickets}, available ${storedFreeTickets}.`,
        "failed-precondition",
      );
    }
  }

  const referralRefs = checkoutInput.referralIds.map((id) =>
    db.collection("referrals").doc(id)
  );
  const referralSnaps = await Promise.all(referralRefs.map((ref) => ref.get()));
  referralSnaps.forEach((snap, index) => {
    const refId = referralRefs[index].id;
    if (!snap.exists) {
      throw new CheckoutValidationError(`Referral ${refId} not found.`, "failed-precondition");
    }
    try {
      assertReferralRedeemable(snap.data(), refId, userRef.path);
    } catch (error) {
      throw new CheckoutValidationError(error.message, "failed-precondition");
    }
  });

  const attemptSnap = await db
    .collection("skill_attempts")
    .doc(`${uid}_${competitionId}`)
    .get();
  if (!attemptSnap.exists || attemptSnap.data()?.passed !== true) {
    throw new CheckoutValidationError(
      "You must pass the skill-gate quiz before entering this competition.",
      "failed-precondition",
    );
  }

  const { discount, freeTickets: packBonusTickets, packType } = getOrderPricing(
    checkoutInput.ticketQuantity,
  );
  const referralBonusTickets = Math.floor(freeTickets / 10);
  const totalTicketsToGenerate = checkoutInput.ticketQuantity
    + packBonusTickets
    + freeTickets
    + referralBonusTickets;

  const currentStock = Number(competitionData.stock_quantity || 0);
  if (!Number.isFinite(currentStock) || currentStock < 0) {
    throw new CheckoutValidationError(
      "Competition stock is invalid, so checkout cannot be started safely.",
      "failed-precondition",
    );
  }
  if (currentStock < totalTicketsToGenerate) {
    throw new CheckoutValidationError(
      `Only ${currentStock} ticket${currentStock === 1 ? "" : "s"} remaining in stock.`,
      "failed-precondition",
    );
  }

  const ticketPrice = Number(competitionData.ticket_price || 0);
  const subtotal = checkoutInput.ticketQuantity * ticketPrice;
  const discountAmount = subtotal * discount;
  const totalAmount = subtotal - discountAmount;

  return {
    checkoutInput,
    competitionData,
    userData: userSnap.data(),
    subtotal,
    discountAmount,
    discount,
    totalAmount,
    packType,
    packBonusTickets,
    referralBonusTickets,
    totalTicketsToGenerate,
    drawDateMillis: expiry.drawDateMillis,
    expiresAt: expiry.expiresAt,
  };
}

export async function recordPaidUnfulfilledOrder(
  db,
  admin,
  {
    orderId,
    checkoutSessionId,
    paymentIntentId,
    settlement,
    failureReason,
  },
) {
  if (!orderId || typeof orderId !== "string") {
    throw new Error("orderId is required to record an unfulfilled payment.");
  }

  const orderRef = db.collection("order").doc(orderId);
  return db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      return { outcome: "order_missing" };
    }

    const orderData = orderSnap.data();
    if (orderData.status === "paid") {
      return { outcome: "already_fulfilled" };
    }

    if (
      orderData.stripe_checkout_session_id &&
      checkoutSessionId &&
      orderData.stripe_checkout_session_id !== checkoutSessionId
    ) {
      return { outcome: "session_mismatch" };
    }

    const isStripePaid = settlement === PAYMENT_SETTLEMENT.STRIPE_PAID;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const failureText = String(failureReason || "Ticket fulfillment failed.")
      .trim()
      .slice(0, 1000);

    const updateData = {
      payment_status: isStripePaid ? "paid" : "not_required",
      fulfillment_status: "failed",
      fulfillment_error: failureText,
      fulfillment_failed_at: now,
      fulfillment_attempts: admin.firestore.FieldValue.increment(1),
      updated_at: now,
    };

    if (isStripePaid) {
      updateData.stripe_status = "paid";
      if (paymentIntentId) {
        updateData.stripe_payment_intent_id = paymentIntentId;
      }
      if (!orderData.paid_at) {
        updateData.paid_at = now;
      }
    } else if (orderData.stripe_status !== "paid") {
      updateData.stripe_status = "free";
    }

    transaction.update(orderRef, updateData);

    return { outcome: "marked_failed" };
  });
}

function normalizeReferralId(value) {
  if (typeof value !== "string") return null;

  const id = value.trim();
  if (!id || id === "." || id === ".." || id.includes("/")) {
    return null;
  }

  return id;
}

export function validateCheckoutInputs({
  ticketQuantity,
  freeTicketsToUse = 0,
  referralsToBurn = [],
} = {}) {
  const quantity = Number(ticketQuantity);
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) {
    throw new CheckoutValidationError("ticketQuantity must be a non-negative integer.");
  }
  if (quantity > MAX_CHECKOUT_TICKET_QUANTITY) {
    throw new CheckoutValidationError(
      `Maximum ${MAX_CHECKOUT_TICKET_QUANTITY} tickets per order.`
    );
  }

  if (
    typeof freeTicketsToUse !== "number" ||
    !Number.isFinite(freeTicketsToUse) ||
    !Number.isInteger(freeTicketsToUse) ||
    freeTicketsToUse < 0
  ) {
    throw new CheckoutValidationError(
      "freeTicketsToUse must be a finite non-negative integer."
    );
  }
  if (freeTicketsToUse > MAX_CHECKOUT_REFERRAL_TICKETS) {
    throw new CheckoutValidationError(
      `Maximum ${MAX_CHECKOUT_REFERRAL_TICKETS} referral tickets can be used per order.`
    );
  }

  const referralInput = referralsToBurn === undefined ? [] : referralsToBurn;
  if (!Array.isArray(referralInput)) {
    throw new CheckoutValidationError(
      "referralsToBurn must be an array when provided."
    );
  }
  if (referralInput.length > MAX_CHECKOUT_REFERRAL_TICKETS) {
    throw new CheckoutValidationError(
      `Maximum ${MAX_CHECKOUT_REFERRAL_TICKETS} referral credits can be supplied per order.`
    );
  }
  if (referralInput.length !== freeTicketsToUse) {
    throw new CheckoutValidationError(
      "freeTicketsToUse must match the number of referral credits supplied."
    );
  }

  const referralIds = [];
  const seenIds = new Set();
  for (const referral of referralInput) {
    if (!referral || typeof referral !== "object" || Array.isArray(referral)) {
      throw new CheckoutValidationError(
        "Each referral credit must contain a valid non-empty id."
      );
    }

    const id = normalizeReferralId(referral.id);
    if (!id) {
      throw new CheckoutValidationError(
        "Each referral credit must contain a valid non-empty id."
      );
    }
    if (seenIds.has(id)) {
      throw new CheckoutValidationError(
        "referralsToBurn must not contain duplicate referral ids."
      );
    }

    seenIds.add(id);
    referralIds.push(id);
  }

  if (quantity === 0 && freeTicketsToUse === 0) {
    throw new CheckoutValidationError(
      "At least one ticket must be requested (paid or free)."
    );
  }

  return {
    ticketQuantity: quantity,
    freeTicketsToUse,
    referralIds,
  };
}

export function validatePersistedCheckoutInputs(orderData) {
  if (!orderData || typeof orderData !== "object" || Array.isArray(orderData)) {
    throw new CheckoutValidationError("Persisted order data is invalid.");
  }

  if (typeof orderData.ticket_quantity !== "number") {
    throw new CheckoutValidationError(
      "Persisted ticket_quantity must be a number for fulfillment."
    );
  }
  if (
    !Object.prototype.hasOwnProperty.call(orderData, "free_tickets_to_use") ||
    orderData.free_tickets_to_use === undefined
  ) {
    throw new CheckoutValidationError(
      "Persisted free_tickets_to_use is required for fulfillment."
    );
  }
  if (
    !Object.prototype.hasOwnProperty.call(orderData, "referrals_to_burn") ||
    orderData.referrals_to_burn === undefined
  ) {
    throw new CheckoutValidationError(
      "Persisted referrals_to_burn is required for fulfillment."
    );
  }

  return validateCheckoutInputs({
    ticketQuantity: orderData.ticket_quantity,
    freeTicketsToUse: orderData.free_tickets_to_use,
    referralsToBurn: orderData.referrals_to_burn,
  });
}

export function getDirectPaymentBlock({ totalAmount, existingOrderData = null }) {
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return "Order amount is invalid, so direct fulfillment cannot be verified safely.";
  }

  if (totalAmount > 0) {
    return DIRECT_PAYMENT_REQUIRED_MESSAGE;
  }

  if (existingOrderData) {
    if (existingOrderData.stripe_checkout_session_id) {
      return "This order is associated with Stripe Checkout and cannot be fulfilled directly.";
    }

    const storedAmount = existingOrderData.total_amount;
    if (!Number.isFinite(storedAmount) || storedAmount !== 0) {
      return "This order requires payment and cannot be fulfilled directly.";
    }
  }

  return null;
}

/**
 * Executes the complete ticket purchase as an atomic Firestore transaction.
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-admin').firestore.Firestore} admin
 * @param {Object} params
 * @returns {Promise<{ orderId, tickets, totalAmount, packType, freeTickets }>}
 */
export async function runOrderTransaction(
  db,
  admin,
  {
    uid,
    competitionId,
    ticketQuantity,
    questionAnswer,
    freeTicketsToUse = 0,
    referralsToBurn = [],
    orderId = null,
    paymentSettlement = PAYMENT_SETTLEMENT.DIRECT,
    additionalPayment = null,
  }
) {
  const isAdditionalPayment = Boolean(additionalPayment);
  if (isAdditionalPayment) {
    if (
      !additionalPayment.requestRef ||
      typeof additionalPayment.requestId !== "string" ||
      !additionalPayment.requestId
    ) {
      throw new Error("An additional payment request reference is required.");
    }
    if (
      !Number.isFinite(additionalPayment.unitPrice) ||
      additionalPayment.unitPrice <= 0 ||
      !Number.isFinite(additionalPayment.totalAmount) ||
      additionalPayment.totalAmount <= 0 ||
      String(additionalPayment.currency || "").toUpperCase() !== "GBP"
    ) {
      throw new Error("Additional payment pricing is invalid.");
    }
  }

  const settlementType =
    paymentSettlement === PAYMENT_SETTLEMENT.DIRECT
      ? PAYMENT_SETTLEMENT.DIRECT
      : isVerifiedStripeSettlementContext(paymentSettlement)
        ? paymentSettlement.type
        : null;
  if (!settlementType) {
    throw new Error("Invalid payment settlement context.");
  }
  if (!competitionId || !uid) {
    throw new Error("competitionId and uid are required.");
  }

  const validatedInputs = validateCheckoutInputs({
    ticketQuantity,
    freeTicketsToUse,
    referralsToBurn,
  });
  const qty = validatedInputs.ticketQuantity;
  const clampedReferralTickets = isAdditionalPayment ? 0 : validatedInputs.freeTicketsToUse;

  if (
    isAdditionalPayment &&
    (validatedInputs.freeTicketsToUse !== 0 || validatedInputs.referralIds.length !== 0)
  ) {
    throw new CheckoutValidationError(
      "Additional payments cannot include free or referral tickets."
    );
  }

  const userRef = db.collection("user").doc(uid);
  const competitionRef = db.collection("competition").doc(competitionId);
  const orderRef = orderId ? db.collection("order").doc(orderId) : db.collection("order").doc();

  const pricing = isAdditionalPayment
    ? { discount: 0, freeTickets: 0, packType: "Additional Payment" }
    : getOrderPricing(qty);
  const { discount, freeTickets: packBonusTickets, packType } = pricing;
  const referralBonusTickets = isAdditionalPayment
    ? 0
    : Math.floor(clampedReferralTickets / 10);
  const totalTicketsToGenerate = isAdditionalPayment
    ? qty
    : qty + packBonusTickets + clampedReferralTickets + referralBonusTickets;

  const ticketRefs = Array.from({ length: totalTicketsToGenerate }, () =>
    db.collection("ticket").doc()
  );

  const referralRefs = validatedInputs.referralIds.map((id) =>
    db.collection("referrals").doc(id)
  );

  const result = await db.runTransaction(async (transaction) => {
    let additionalRequestData = null;
    if (isAdditionalPayment) {
      const requestSnap = await transaction.get(additionalPayment.requestRef);
      if (!requestSnap.exists) {
        throw new Error("Additional payment request not found.");
      }

      additionalRequestData = requestSnap.data();
      if (additionalRequestData.fulfillment_status === "fulfilled") {
        throw new AdditionalPaymentAlreadyFulfilledError();
      }
      if (additionalRequestData.payment_status !== "paid") {
        throw new Error("Additional payment has not been verified as paid.");
      }
      if (
        additionalRequestData.fulfillment_status !== undefined &&
        additionalRequestData.fulfillment_status !== "pending" &&
        additionalRequestData.fulfillment_status !== "failed"
      ) {
        throw new Error("Additional payment request is not awaiting fulfillment.");
      }
      if (getReferenceId(additionalRequestData.user_ref) !== uid) {
        throw new Error("Additional payment request does not belong to this user.");
      }
      if (getReferenceId(additionalRequestData.competition_id) !== competitionId) {
        throw new Error("Additional payment request does not belong to this competition.");
      }
      if (Number(additionalRequestData.requested_ticket_quantity) !== qty) {
        throw new Error("Additional payment quantity does not match the request.");
      }
      if (
        Math.round(Number(additionalRequestData.total_amount) * 100) !==
        Math.round(Number(additionalPayment.totalAmount) * 100)
      ) {
        throw new Error("Additional payment amount does not match the request.");
      }
      if (
        String(additionalRequestData.currency || "").toUpperCase() !==
        String(additionalPayment.currency || "").toUpperCase()
      ) {
        throw new Error("Additional payment currency does not match the request.");
      }
    }

    let existingOrderData = null;
    if (orderId) {
      const orderSnap = await transaction.get(orderRef);
      if (orderSnap.exists) {
        existingOrderData = orderSnap.data();
        if (existingOrderData.status !== "pending") {
          throw new Error("This order has already been processed or is not in a pending state.");
        }
        if (existingOrderData.user_ref?.path !== userRef.path) {
          throw new Error("This order does not belong to you.");
        }
      }
    }

    const compSnap = await transaction.get(competitionRef);
    if (!compSnap.exists) throw new Error("Competition not found.");

    const compData = compSnap.data();
    const competitionBlock = getCheckoutCompetitionBlock(compData, {
      nowMillis: Date.now(),
      requireDrawDate: false,
    });
    if (competitionBlock) {
      throw new Error(competitionBlock);
    }

    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error("User not found.");

    assertAccountEligibleForCheckout(userSnap.data());

    if (clampedReferralTickets > 0) {
      const storedFreeTickets = userSnap.data()?.free_tickets;
      if (
        !Number.isFinite(storedFreeTickets) ||
        !Number.isInteger(storedFreeTickets) ||
        storedFreeTickets < 0
      ) {
        throw new CheckoutValidationError(
          "The stored free-ticket balance is invalid, so referral credits cannot be used safely.",
          "failed-precondition"
        );
      }
      if (storedFreeTickets < clampedReferralTickets) {
        throw new CheckoutValidationError(
          `Insufficient free-ticket balance: requested ${clampedReferralTickets}, available ${storedFreeTickets}.`,
          "failed-precondition"
        );
      }
    }

    let validReferralCount = 0;
    let referralSnaps = [];
    if (!isAdditionalPayment) {
      referralSnaps = await Promise.all(
        referralRefs.map((ref) => transaction.get(ref))
      );

      for (let i = 0; i < referralSnaps.length; i++) {
        const snap = referralSnaps[i];
        const refId = referralRefs[i].id;

        if (!snap.exists) throw new Error(`Referral ${refId} not found.`);
        assertReferralRedeemable(snap.data(), refId, userRef.path);
        validReferralCount++;
      }

      if (clampedReferralTickets > 0 && validReferralCount < clampedReferralTickets) {
        throw new Error("Not enough valid referral tickets found.");
      }
    }

    // Enforce that the user has passed the quiz for this competition.
    const attemptRef = db.collection("skill_attempts").doc(`${uid}_${competitionId}`);
    const attemptSnap = await transaction.get(attemptRef);

    if (!attemptSnap.exists || attemptSnap.data()?.passed !== true) {
      throw new Error("You must pass the skill-gate quiz before entering this competition.");
    }

    let unusedLogs = [];
    if (clampedReferralTickets > 0) {
      const unusedLogsQuerySnap = await db.collection("free_ticket_log")
        .where("user_id", "==", userRef)
        .where("competition_id", "==", null)
        .limit(clampedReferralTickets)
        .get();

      // Read each document inside the transaction to lock it and get fresh data
      const unusedLogsSnaps = await Promise.all(
        unusedLogsQuerySnap.docs.map((doc) => transaction.get(doc.ref))
      );

      // Sort in memory to avoid missing index errors in transaction
      unusedLogs = unusedLogsSnaps
        .filter((d) => d.exists)
        .map((d) => ({ id: d.id, ...d.data(), ref: d.ref }))
        .sort((a, b) => {
          const tA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
          const tB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
          return tA - tB;
        });
    }

    const currentStock = Number(compData.stock_quantity || 0);
    if (!Number.isFinite(currentStock) || currentStock < 0) {
      throw new Error("Competition stock is invalid, so tickets cannot be allocated safely.");
    }
    if (currentStock < totalTicketsToGenerate) {
      throw new Error(
        `Only ${currentStock} ticket${currentStock === 1 ? "" : "s"} remaining in stock.`
      );
    }

    const lastSeq = Number(compData.last_ticket_sequence) || 0;
    const startSeq = lastSeq + 1;
    const endSeq = lastSeq + totalTicketsToGenerate;

    const prefix = generateTicketPrefix(compData.title || "");

    const ticketPrice = isAdditionalPayment
      ? Number(additionalPayment.unitPrice)
      : Number(compData.ticket_price || 0);
    const subtotal = qty * ticketPrice;
    const discountAmount = isAdditionalPayment ? 0 : subtotal * discount;
    const totalAmount = isAdditionalPayment
      ? Number(additionalPayment.totalAmount)
      : subtotal - discountAmount;

    if (
      isAdditionalPayment &&
      (!Number.isFinite(totalAmount) ||
        Math.round(totalAmount * 100) !== Math.round(subtotal * 100))
    ) {
      throw new Error("Additional payment pricing does not match the requested quantity.");
    }

    if (settlementType === PAYMENT_SETTLEMENT.DIRECT) {
      const directPaymentBlock = getDirectPaymentBlock({
        totalAmount,
        existingOrderData,
      });
      if (directPaymentBlock) {
        throw new DirectPaymentRequiredError(directPaymentBlock);
      }
    }

    const newStock = currentStock - totalTicketsToGenerate;
    const newStatus = newStock === 0 ? "sold_out" : "active";

    if (settlementType !== PAYMENT_SETTLEMENT.DIRECT) {
      if (
        paymentSettlement.orderId !== orderRef.id ||
        paymentSettlement.amountMinor !== Math.round(totalAmount * 100) ||
        String(paymentSettlement.currency || "").toLowerCase() !== "gbp"
      ) {
        throw new Error("Settlement context does not match the order being fulfilled.");
      }
    }

    if (
      isAdditionalPayment &&
      settlementType !== PAYMENT_SETTLEMENT.STRIPE_PAID
    ) {
      throw new Error("Additional payments must use verified Stripe settlement.");
    }

    const paidTicketOrigin =
      settlementType === PAYMENT_SETTLEMENT.STRIPE_PAID
        ? TICKET_ORIGIN.PAID
        : TICKET_ORIGIN.ZERO_PAYMENT;

    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    const ticketOrigins = [
      ...Array(qty).fill(paidTicketOrigin),
      ...Array(packBonusTickets).fill(TICKET_ORIGIN.PACK_BONUS),
      ...referralSnaps.map((snap) =>
        getReferralTicketOrigin(snap.data()?.reward_type)
      ),
      ...Array(referralBonusTickets).fill(TICKET_ORIGIN.REFERRAL_USE_BONUS),
    ];
    if (ticketOrigins.length !== totalTicketsToGenerate) {
      throw new Error("Ticket origin allocation mismatch.");
    }

    transaction.update(competitionRef, {
      stock_quantity: admin.firestore.FieldValue.increment(-totalTicketsToGenerate),
      sold_tickets: admin.firestore.FieldValue.increment(totalTicketsToGenerate),
      last_ticket_sequence: endSeq,
      status: newStatus,
      participants: admin.firestore.FieldValue.arrayUnion(userRef),
      updated_at: serverNow,
    });

    transaction.set(orderRef, {
      competition_id: competitionRef,
      user_ref: userRef,
      total_ticket: totalTicketsToGenerate,
      paid_ticket: qty,
      free_ticket: packBonusTickets + referralBonusTickets,
      free_used: clampedReferralTickets,
      pack_type: packType,
      discount_percent: Math.round(discount * 100),
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      currency: "GBP",
      status: "paid",
      is_winner: false,
      ...(isAdditionalPayment
        ? {
            order_type: "additional_payment",
            additional_payment_request_id: additionalPayment.requestId,
            stripe_checkout_session_id:
              additionalRequestData?.stripe_checkout_session_id || "",
          }
        : {}),
      stripe_payment_intent_id:
        typeof paymentSettlement === "object" && paymentSettlement?.paymentIntentId
          ? paymentSettlement.paymentIntentId
          : "",
      ...(existingOrderData?.stripe_checkout_session_id
        ? { stripe_checkout_session_id: existingOrderData.stripe_checkout_session_id }
        : {}),
      stripe_status:
        settlementType === PAYMENT_SETTLEMENT.STRIPE_PAID
          ? "paid"
          : totalAmount === 0
            ? "free"
            : "mock",
      payment_status:
        settlementType === PAYMENT_SETTLEMENT.STRIPE_PAID ? "paid" : "not_required",
      fulfillment_status: "fulfilled",
      question_answer: (() => {
        // Build the Map from the client payload
        const qa = questionAnswer || {};
        return {
          question_id: typeof qa.question_id === 'string' ? qa.question_id : '',
          question:    typeof qa.question    === 'string' ? qa.question    : '',
          image: Array.isArray(qa.image)
            ? qa.image.filter((v) => typeof v === 'string')
            : [],
          option: Array.isArray(qa.option)
            ? qa.option
                .filter((o) => o && typeof o === 'object')
                .map((o) => ({
                  option_id: typeof o.option_id === 'string' ? o.option_id : '',
                  option:    typeof o.option    === 'string' ? o.option    : '',
                }))
            : [],
          answer: (() => {
            const a = qa.answer;
            if (!a || typeof a !== 'object') return { option_id: '', option: '' };
            return {
              option_id: typeof a.option_id === 'string' ? a.option_id : '',
              option:    typeof a.option    === 'string' ? a.option    : '',
            };
          })(),
        };
      })(),
      created_at: serverNow,
      paid_at: serverNow,
    });

    const ticketResults = [];
    for (let i = 0; i < totalTicketsToGenerate; i++) {
      const ticketNumber = startSeq + i;
      const ticketSequence = formatTicketSequence(prefix, ticketNumber);
      const ticketRef = ticketRefs[i];

      transaction.set(ticketRef, {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
        ticket_number: ticketNumber,
        ticket_sequence: ticketSequence,
        status: "active",
        is_winner: false,
        allocation_type: ticketOrigins[i],
        created_at: serverNow,
      });

      ticketResults.push({
        ticketId: ticketRef.id,
        ticketNumber,
        ticketSequence,
      });
    }

    if (packBonusTickets > 0) {
      const packLogRef = db.collection("free_ticket_log").doc();
      transaction.set(packLogRef, {
        user_id: userRef,
        order_id: orderRef,
        competition_id: competitionRef,
        quantity: packBonusTickets,
        reason: "ticket_bonus",
        reward_type: "pack_bonus",
        pack_type: packType,
        created_at: serverNow,
      });
    }

    if (referralBonusTickets > 0) {
      const refBonusLogRef = db.collection("free_ticket_log").doc();
      transaction.set(refBonusLogRef, {
        user_id: userRef,
        order_id: orderRef,
        competition_id: competitionRef,
        quantity: referralBonusTickets,
        reason: "ticket_bonus",
        reward_type: "referral_use_bonus",
        created_at: serverNow,
      });
    }

    if (clampedReferralTickets > 0) {
      const referralsByType = {
        admin_bonus: 0,
        referral: 0,
        other: 0
      };

      referralSnaps.forEach((snap, idx) => {
        const refData = snap.data();
        const rewardType = refData.reward_type || 'referral';
        
        transaction.update(referralRefs[idx], {
          reward_issued: true,
          reward_issued_at: serverNow,
        });

        if (rewardType === 'admin_bonus') {
          referralsByType.admin_bonus++;
        } else if (rewardType === 'referral' || rewardType === 'free_ticket') {
          referralsByType.referral++;
        } else {
          referralsByType.other++;
        }
      });

      const processAuditLog = (type, quantity, defaultReason) => {
        if (quantity <= 0) return;
        
        let remaining = quantity;
        const matchingLogs = unusedLogs.filter(l => l.reward_type === type);

        for (const oldLog of matchingLogs) {
          if (remaining <= 0) break;

          if (oldLog.quantity <= remaining) {
            transaction.update(oldLog.ref, {
              competition_id: competitionRef,
              order_id: orderRef,
              updated_at: serverNow
            });
            remaining -= oldLog.quantity;
          } else {
            // Partial log usage - Split it
            transaction.update(oldLog.ref, {
              quantity: oldLog.quantity - remaining,
              updated_at: serverNow
            });
            
            const usedLogRef = db.collection("free_ticket_log").doc();
            transaction.set(usedLogRef, {
              user_id: userRef,
              order_id: orderRef,
              competition_id: competitionRef,
              quantity: remaining,
              reason: oldLog.reason || defaultReason,
              reward_type: type,
              created_at: serverNow
            });
            remaining = 0;
          }
        }

        if (remaining > 0) {
          const newLogRef = db.collection("free_ticket_log").doc();
          transaction.set(newLogRef, {
            user_id: userRef,
            order_id: orderRef,
            competition_id: competitionRef,
            quantity: remaining,
            reason: defaultReason,
            reward_type: type,
            created_at: serverNow,
          });
        }
      };

      processAuditLog('admin_bonus', referralsByType.admin_bonus, 'admin_bonus');
      processAuditLog('referral', referralsByType.referral, 'referral');
      processAuditLog('other', referralsByType.other, 'free_ticket');
    }

    transaction.update(userRef, {
      total_tickets_bought: admin.firestore.FieldValue.increment(qty),
      total_spent: admin.firestore.FieldValue.increment(totalAmount),
      ...(clampedReferralTickets > 0 && {
        free_tickets: admin.firestore.FieldValue.increment(-clampedReferralTickets),
      }),
      ...((packBonusTickets > 0 || referralBonusTickets > 0) && {
        total_free_tickets: admin.firestore.FieldValue.increment(packBonusTickets + referralBonusTickets),
      }),
      updated_at: serverNow,
    });

    if (isAdditionalPayment && typeof additionalPayment.onFulfilled === "function") {
      additionalPayment.onFulfilled(transaction, {
        orderRef,
        orderId: orderRef.id,
        ticketResults,
        quantity: qty,
        totalAmount,
        currency: "GBP",
      });
    }

    return {
      orderId: orderRef.id,
      tickets: ticketResults,
      totalAmount,
      packType,
      freeTickets: packBonusTickets + clampedReferralTickets + referralBonusTickets,
      packBonusTickets: packBonusTickets + referralBonusTickets,
      referralTicketsUsed: clampedReferralTickets,
    };
  });

  return result;
}
