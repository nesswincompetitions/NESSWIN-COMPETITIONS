export const PAID_ORDER_STATUS_VALUES = Object.freeze(["paid", "Paid"]);
export const REFUNDED_ORDER_STATUS_VALUES = Object.freeze(["Refunded", "refunded"]);
export const FINANCIAL_EXCLUDED_PAID_STATUS_VALUES = Object.freeze([
  ...PAID_ORDER_STATUS_VALUES,
  ...REFUNDED_ORDER_STATUS_VALUES,
]);

const PAID_STATUS_SET = new Set(["paid"]);
const REFUNDED_STATUS_SET = new Set(["refunded"]);
const REFUND_STATUS_WITHOUT_EVIDENCE = new Set(["partial", "refunded"]);

function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function toMinorUnits(value) {
  const number = toFiniteNumber(value);
  return number === null ? null : Math.round(number * 100);
}

function toNonNegativeNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number > 0 ? number : 0;
}

function toCount(value) {
  return Math.max(0, Math.trunc(toNonNegativeNumber(value)));
}

export function normalizeOrderStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function refundEvidence(order) {
  const refunds = order?.refunds;
  if (refunds !== undefined && !Array.isArray(refunds)) {
    return { valid: false, reason: "invalid_refunds_field" };
  }

  const refundRecords = refunds || [];
  const succeeded = refundRecords.filter(
    refund => normalizeOrderStatus(refund?.status) === "succeeded",
  );
  const successfulAmounts = succeeded.map(refund => {
    const amount = toFiniteNumber(refund?.amount_minor);
    return amount !== null && Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
  });
  if (successfulAmounts.some(amount => amount === null)) {
    return { valid: false, reason: "invalid_successful_refund_amount" };
  }

  let recordMinor = 0;
  for (const amount of successfulAmounts) {
    recordMinor += amount;
    if (!Number.isSafeInteger(recordMinor)) {
      return { valid: false, reason: "refund_amount_overflow" };
    }
  }

  const hasAggregateMinor = Object.prototype.hasOwnProperty.call(order, "refunded_amount_minor");
  const hasLegacyAmount = Object.prototype.hasOwnProperty.call(order, "refunded_amount");
  const aggregateMinor = hasAggregateMinor ? toFiniteNumber(order.refunded_amount_minor) : null;
  const legacyMinor = hasLegacyAmount ? toMinorUnits(order.refunded_amount) : null;

  if (hasAggregateMinor && (aggregateMinor === null || !Number.isSafeInteger(aggregateMinor) || aggregateMinor < 0)) {
    return { valid: false, reason: "invalid_refunded_amount_minor" };
  }
  if (hasLegacyAmount && (legacyMinor === null || !Number.isSafeInteger(legacyMinor) || legacyMinor < 0)) {
    return { valid: false, reason: "invalid_refunded_amount" };
  }

  const candidates = [
    succeeded.length > 0 ? recordMinor : null,
    hasAggregateMinor ? aggregateMinor : null,
    hasLegacyAmount ? legacyMinor : null,
  ].filter(value => value !== null);
  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length > 1) {
    return { valid: false, reason: "conflicting_refund_representations" };
  }

  const confirmedMinor = uniqueCandidates[0] || 0;
  const hasSuccessfulRecord = succeeded.length > 0;
  const hasPositiveConfirmedAmount = confirmedMinor > 0;
  return {
    valid: true,
    confirmedMinor,
    hasSuccessfulRecord,
    hasConfirmedAmount: uniqueCandidates.length > 0,
    hasPositiveConfirmedAmount,
    evidence: hasSuccessfulRecord || hasPositiveConfirmedAmount,
  };
}

export function classifyOrderFinancially(order) {
  if (!order || typeof order !== "object") {
    return { classification: "unresolved", reason: "invalid_order" };
  }

  const status = normalizeOrderStatus(order.status);
  const paymentStatus = normalizeOrderStatus(order.payment_status);
  const refund = refundEvidence(order);
  const statusPaid = PAID_STATUS_SET.has(status);
  const paymentPaid = paymentStatus === "paid";
  const hasPaidEvidence = statusPaid || paymentPaid;
  const isRefundedStatus = REFUNDED_STATUS_SET.has(status) || paymentStatus === "refunded";

  const contradictoryPaymentState =
    (statusPaid && ["failed", "unpaid", "refunded"].includes(paymentStatus)) ||
    (paymentPaid && status === "failed") ||
    (REFUNDED_STATUS_SET.has(status) && ["failed", "unpaid"].includes(paymentStatus)) ||
    (paymentStatus === "refunded" && !REFUNDED_STATUS_SET.has(status));
  if (contradictoryPaymentState) {
    return { classification: "unresolved", reason: "contradictory_payment_state" };
  }

  if (isRefundedStatus && !hasPaidEvidence && !refund.evidence) {
    return { classification: "unresolved", reason: "refund_status_without_payment_evidence" };
  }
  if (!refund.valid) {
    return { classification: "unresolved", reason: refund.reason };
  }
  if (!hasPaidEvidence && !(isRefundedStatus && refund.evidence)) {
    return { classification: "excluded", reason: "unpaid_or_pending" };
  }
  if (REFUND_STATUS_WITHOUT_EVIDENCE.has(normalizeOrderStatus(order.refund_status)) && !refund.evidence) {
    return { classification: "unresolved", reason: "refund_status_without_refund_evidence" };
  }

  const grossMinor = toMinorUnits(order.total_amount);
  if (grossMinor === null || !Number.isSafeInteger(grossMinor) || grossMinor < 0) {
    return { classification: "unresolved", reason: "invalid_gross_amount" };
  }

  const tickets = toFiniteNumber(order.total_ticket);
  const totalTickets = tickets !== null && tickets >= 0 ? tickets : 0;
  if (refund.confirmedMinor > grossMinor) {
    return { classification: "unresolved", reason: "refund_exceeds_gross" };
  }
  const fullyRefunded = refund.confirmedMinor >= grossMinor && refund.hasPositiveConfirmedAmount;
  const fulfillmentStatus = normalizeOrderStatus(order.fulfillment_status);
  const paidUnfulfilled = paymentPaid && fulfillmentStatus !== "fulfilled";
  return {
    classification: fullyRefunded
      ? "fully_refunded"
      : refund.hasPositiveConfirmedAmount
        ? "partially_refunded"
        : paidUnfulfilled || (fulfillmentStatus && fulfillmentStatus !== "fulfilled")
          ? "paid_unfulfilled"
          : "paid_fulfilled",
    grossMinor,
    confirmedRefundMinor: refund.confirmedMinor,
    tickets: totalTickets,
  };
}

export function isFinanciallyPaidOrder(order) {
  const result = classifyOrderFinancially(order);
  return result.classification !== "excluded" && result.classification !== "unresolved";
}

export function computeDetailedOrderFinancialSummary(orders = []) {
  const totals = {
    totalOrders: 0,
    grossMinor: 0,
    confirmedRefundMinor: 0,
    totalTicketsSold: 0,
    unresolvedCount: 0,
    invalidAmountCount: 0,
    conflictingRefundCount: 0,
    anomalyCount: 0,
    overflowCount: 0,
  };

  for (const order of orders) {
    const result = classifyOrderFinancially(order);
    if (result.classification === "excluded") continue;
    if (result.classification === "unresolved") {
      totals.unresolvedCount += 1;
      if (result.reason === "invalid_gross_amount") totals.invalidAmountCount += 1;
      if (result.reason === "conflicting_refund_representations") totals.conflictingRefundCount += 1;
      if (result.reason === "refund_exceeds_gross") totals.anomalyCount += 1;
      continue;
    }
    const nextGrossMinor = totals.grossMinor + result.grossMinor;
    const nextRefundMinor = totals.confirmedRefundMinor + result.confirmedRefundMinor;
    if (!Number.isSafeInteger(nextGrossMinor) || !Number.isSafeInteger(nextRefundMinor)) {
      totals.overflowCount += 1;
      continue;
    }
    totals.totalOrders += 1;
    totals.grossMinor = nextGrossMinor;
    totals.confirmedRefundMinor = nextRefundMinor;
    totals.totalTicketsSold += result.tickets;
  }

  return {
    ...totals,
    totalRevenue: Math.max(0, totals.grossMinor - totals.confirmedRefundMinor) / 100,
  };
}

export function computeOrderFinancialSummaryFromOrders(orders = []) {
  const detailed = computeDetailedOrderFinancialSummary(orders);
  if (detailed.overflowCount > 0) {
    throw new Error("Financial metrics totals exceeded the safe integer range.");
  }
  return {
    totalOrders: detailed.totalOrders,
    totalRevenue: detailed.totalRevenue,
    totalTicketsSold: toCount(detailed.totalTicketsSold),
  };
}
