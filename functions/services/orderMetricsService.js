export const PAID_ORDER_STATUS_VALUES = Object.freeze(["paid", "Paid"]);
export const REFUNDED_ORDER_STATUS_VALUES = Object.freeze(["Refunded", "refunded"]);
export const FINANCIAL_EXCLUDED_PAID_STATUS_VALUES = Object.freeze([
  ...PAID_ORDER_STATUS_VALUES,
  ...REFUNDED_ORDER_STATUS_VALUES,
]);

const PAID_STATUS_SET = new Set(["paid"]);
const REFUNDED_STATUS_SET = new Set(["refunded"]);

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function toCount(value) {
  return Math.max(0, Math.trunc(toNonNegativeNumber(value)));
}

export function normalizeOrderStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function isFinanciallyPaidOrder(order) {
  if (!order || typeof order !== "object") return false;
  const status = normalizeOrderStatus(order.status);
  if (PAID_STATUS_SET.has(status) || REFUNDED_STATUS_SET.has(status)) return true;
  return normalizeOrderStatus(order.payment_status) === "paid";
}

export function computeOrderFinancialSummaryFromAggregates({
  paidCount = 0,
  paidGross = 0,
  paidRefunded = 0,
  paidTickets = 0,
  unfulfilledCount = 0,
  unfulfilledGross = 0,
  unfulfilledRefunded = 0,
  unfulfilledTickets = 0,
  refundedCount = 0,
  refundedTickets = 0,
} = {}) {
  const gross = toNonNegativeNumber(paidGross) + toNonNegativeNumber(unfulfilledGross);
  const refunded = toNonNegativeNumber(paidRefunded) + toNonNegativeNumber(unfulfilledRefunded);

  return {
    totalOrders: toCount(paidCount) + toCount(unfulfilledCount) + toCount(refundedCount),
    totalRevenue: Math.max(0, Math.round((gross - refunded) * 100) / 100),
    totalTicketsSold:
      toCount(paidTickets) + toCount(unfulfilledTickets) + toCount(refundedTickets),
  };
}

export function computeOrderFinancialSummaryFromOrders(orders = []) {
  const totals = {
    paidCount: 0,
    paidGross: 0,
    paidRefunded: 0,
    paidTickets: 0,
    unfulfilledCount: 0,
    unfulfilledGross: 0,
    unfulfilledRefunded: 0,
    unfulfilledTickets: 0,
    refundedCount: 0,
    refundedTickets: 0,
  };

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;

    const status = normalizeOrderStatus(order.status);
    const tickets = toNonNegativeNumber(order.total_ticket);

    if (REFUNDED_STATUS_SET.has(status)) {
      totals.refundedCount += 1;
      totals.refundedTickets += tickets;
      continue;
    }

    const gross = toNonNegativeNumber(order.total_amount);
    const refunded = toNonNegativeNumber(order.refunded_amount);

    if (PAID_STATUS_SET.has(status)) {
      totals.paidCount += 1;
      totals.paidGross += gross;
      totals.paidRefunded += refunded;
      totals.paidTickets += tickets;
      continue;
    }

    if (normalizeOrderStatus(order.payment_status) === "paid") {
      totals.unfulfilledCount += 1;
      totals.unfulfilledGross += gross;
      totals.unfulfilledRefunded += refunded;
      totals.unfulfilledTickets += tickets;
    }
  }

  return computeOrderFinancialSummaryFromAggregates(totals);
}
