export const PAID_ORDER_STATUS_VALUES = Object.freeze(['paid', 'Paid']);
export const PENDING_ORDER_STATUS_VALUES = Object.freeze(['pending', 'Pending']);
export const FAILED_ORDER_STATUS_VALUES = Object.freeze(['failed', 'Failed']);
export const REFUNDED_ORDER_STATUS_VALUES = Object.freeze(['Refunded', 'refunded']);

export const FINANCIAL_EXCLUDED_PAID_STATUS_VALUES = Object.freeze([
  ...PAID_ORDER_STATUS_VALUES,
  ...REFUNDED_ORDER_STATUS_VALUES,
]);

const FILTER_STATUS_VALUES = Object.freeze({
  paid: PAID_ORDER_STATUS_VALUES,
  pending: PENDING_ORDER_STATUS_VALUES,
  failed: FAILED_ORDER_STATUS_VALUES,
  refunded: REFUNDED_ORDER_STATUS_VALUES,
});

export function normalizeOrderStatus(value) {
  return String(value || '').trim().toLowerCase();
}

export function getOrderStatusQueryValues(filterKey) {
  if (!filterKey || filterKey === 'all') return null;
  return FILTER_STATUS_VALUES[filterKey] || null;
}

export function isPaidOrderStatus(value) {
  return normalizeOrderStatus(value) === 'paid';
}

export function isRefundedOrderStatus(value) {
  return normalizeOrderStatus(value) === 'refunded';
}
