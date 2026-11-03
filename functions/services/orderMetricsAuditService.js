import { isFinanciallyPaidOrder } from './orderMetricsService.js';

export const AUDIT_PAGE_SIZE = 500;
export const AUDIT_MAX_DOCUMENTS = 10_000;

const CATEGORICAL_FIELDS = Object.freeze({
  status: new Set(['pending', 'paid', 'Paid', 'failed', 'Refunded', 'refunded']),
  payment_status: new Set(['pending', 'paid', 'unpaid', 'failed', 'refunded', 'processing']),
  fulfillment_status: new Set(['pending', 'fulfilled', 'failed']),
  refund_status: new Set(['pending', 'partial', 'refunded', 'failed', 'canceled', 'requires_action']),
});
const AMOUNT_FIELDS = new Set(['refunded_amount', 'refunded_amount_minor', 'refund_reserved_amount_minor', 'total_amount']);
const REFUND_FIELDS = new Set(['refunded_amount', 'refunded_amount_minor', 'refund_reserved_amount_minor', 'refund_status']);
const TICKET_FIELDS = new Set(['total_ticket']);
const PAID_STATUSES = new Set(['paid', 'Paid']);
const REFUNDED_STATUSES = new Set(['Refunded', 'refunded']);
const EXCLUDED_PAID_STATUSES = new Set([...PAID_STATUSES, ...REFUNDED_STATUSES]);

function valueType(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function addType(stats, value) {
  const type = valueType(value);
  stats.type_counts[type] = (stats.type_counts[type] || 0) + 1;
  if (type === 'missing') stats.missing += 1;
  if (type === 'null') stats.nulls += 1;
  return type;
}

function createFieldStats(field) {
  const stats = { type_counts: {}, missing: 0, nulls: 0 };
  if (CATEGORICAL_FIELDS[field]) {
    stats.allowed_values = Object.fromEntries([...CATEGORICAL_FIELDS[field]].map(value => [value, 0]));
    stats.unexpected_value_count = 0;
  }
  if (AMOUNT_FIELDS.has(field) || TICKET_FIELDS.has(field)) {
    stats.finite_numeric_sum = 0;
    stats.numeric_string_count = 0;
    stats.invalid_value_count = 0;
  }
  return stats;
}

function recordField(stats, field, value) {
  const type = addType(stats, value);
  if (value === undefined || value === null) return;
  if (CATEGORICAL_FIELDS[field]) {
    if (type === 'string' && CATEGORICAL_FIELDS[field].has(value)) stats.allowed_values[value] += 1;
    else stats.unexpected_value_count += 1;
  }
  if (AMOUNT_FIELDS.has(field) || TICKET_FIELDS.has(field)) {
    const number = finiteNumber(value);
    if (number !== null) stats.finite_numeric_sum += number;
    else if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) stats.numeric_string_count += 1;
    else stats.invalid_value_count += 1;
  }
}

function emptyTotals() {
  return { count: 0, gross: 0, refunded: 0, tickets: 0 };
}

function addToTotals(totals, order) {
  totals.count += 1;
  totals.gross += finiteNumber(order.total_amount) ?? 0;
  totals.refunded += finiteNumber(order.refunded_amount) ?? 0;
  totals.tickets += finiteNumber(order.total_ticket) ?? 0;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function matchesExistingGroups(order) {
  const status = order?.status;
  return {
    paid: PAID_STATUSES.has(status),
    // Firestore `not-in` does not match documents where the field is missing/null.
    unfulfilled: order?.payment_status === 'paid' && status !== undefined && status !== null && !EXCLUDED_PAID_STATUSES.has(status),
    refunded: REFUNDED_STATUSES.has(status),
  };
}

function isUnexpectedStatus(value) {
  return value !== undefined && value !== null && (typeof value !== 'string' || !CATEGORICAL_FIELDS.status.has(value));
}

function isHistoricallyPaid(order, refund) {
  const status = String(order?.status || '').trim().toLowerCase();
  const paymentStatus = String(order?.payment_status || '').trim().toLowerCase();
  const refundStatus = String(order?.refund_status || '').trim().toLowerCase();
  const contradictoryPaymentState =
    (['paid'].includes(status) && ['failed', 'unpaid', 'refunded'].includes(paymentStatus)) ||
    (paymentStatus === 'paid' && status === 'failed') ||
    (['refunded'].includes(status) && ['failed', 'unpaid'].includes(paymentStatus)) ||
    (paymentStatus === 'refunded' && status !== 'refunded');
  if (contradictoryPaymentState) return false;
  if (
    paymentStatus === 'paid' &&
    status !== 'refunded' &&
    status !== 'failed' &&
    (refundStatus !== 'refunded' || refund.evidence)
  ) return true;
  return Boolean(refund.evidence && (
    status === 'refunded' ||
    paymentStatus === 'refunded' ||
    refundStatus === 'refunded'
  ));
}

function refundEvidence(order) {
  const refundedMinor = finiteNumber(order?.refunded_amount_minor);
  const succeededRecord = Array.isArray(order?.refunds) && order.refunds.some(refund => refund?.status === 'succeeded');
  const legacyMajor = finiteNumber(order?.refunded_amount);
  return (refundedMinor !== null && refundedMinor > 0) || succeededRecord || (refundedMinor === null && legacyMajor !== null && legacyMajor > 0);
}

function refundClassification(order) {
  const evidence = refundEvidence(order);
  const total = finiteNumber(order?.total_amount);
  const refundedMinor = finiteNumber(order?.refunded_amount_minor);
  const legacyMajor = finiteNumber(order?.refunded_amount);
  const legacyPositive = legacyMajor !== null && legacyMajor > 0;
  const reconciledMinorMajor = refundedMinor === null ? null : refundedMinor / 100;
  const conflictingAggregates = legacyPositive && refundedMinor !== null && legacyMajor !== reconciledMinorMajor;
  const confirmedMajor = refundedMinor === null ? 0 : refundedMinor / 100;
  const fullyRefunded = evidence && (
    order?.status === 'Refunded' ||
    order?.payment_status === 'refunded' ||
    order?.refund_status === 'refunded' ||
    (total !== null && refundedMinor !== null && refundedMinor >= total * 100)
  );
  const reservationPending = (finiteNumber(order?.refund_reserved_amount_minor) ?? 0) > 0 ||
    (Array.isArray(order?.refunds) && order.refunds.some(refund => ['pending', 'requires_action'].includes(refund?.status)));
  return {
    fullyRefunded: Boolean(fullyRefunded),
    partiallyRefunded: evidence && !fullyRefunded,
    statusWithoutEvidence: REFUNDED_STATUSES.has(order?.status) && !evidence,
    paidStatusRefunded: PAID_STATUSES.has(order?.status) && order?.refund_status === 'refunded',
    paymentPaidStatusRefunded: order?.payment_status === 'paid' && REFUNDED_STATUSES.has(order?.status),
    reservationPending,
    evidence,
    confirmed_major: confirmedMajor,
    legacy_major: refundedMinor === null && legacyPositive ? legacyMajor : 0,
    legacy_only: refundedMinor === null && legacyPositive,
    conflicting_aggregates: Boolean(conflictingAggregates),
    legacy_present: legacyPositive,
  };
}

function currentAndIndependentTotals(orders) {
  const existing = { paid: emptyTotals(), unfulfilled: emptyTotals(), refunded: emptyTotals() };
  const independent = { historically_verified_paid: emptyTotals() };
  const helperAccepted = emptyTotals();
  const helperExcluded = emptyTotals();
  const refunds = { confirmed_fully: 0, confirmed_fully_status_refunded: 0, confirmed_partially: 0, status_marked_refunded: 0, status_without_evidence: 0, paid_status_refunded: 0, payment_paid_status_refunded: 0, reservation_pending: 0, legacy_only: 0, conflicting_aggregates: 0 };
  const contradictionReasons = { status_without_refund_evidence: 0, paid_status_refunded: 0, payment_paid_status_refunded: 0 };
  let contradictoryCount = 0;
  const statusQuality = { missing: 0, unexpected: 0 };
  const orderCounts = {
    historically_verified_paid: 0,
    currently_refunded: 0,
    confirmed_full_refund: 0,
    confirmed_partial_refund: 0,
    refunded_status_without_evidence: 0,
    refund_evidence_without_verified_payment: 0,
    unresolved_historical_payment: 0,
  };

  const fulfillment = { fulfilled: emptyTotals(), unfulfilled: emptyTotals(), failed: emptyTotals(), unknown: emptyTotals() };
  let confirmedRefundMajor = 0;
  let legacyRefundMajor = 0;
  const amountQuality = {
    gross_missing: 0,
    gross_invalid: 0,
    refund_minor_invalid: 0,
    legacy_refund_amounts: 0,
    legacy_only_refund_amounts: 0,
    conflicting_refund_amounts: 0,
  };
  const successfulRefundRecords = {
    orders_with_successful_record: 0,
    successful_record_missing_aggregate: 0,
    successful_record_amount_without_aggregate: 0,
    successful_record_valid_amount: 0,
    successful_record_invalid_amount: 0,
  };

  for (const order of orders) {
    const groups = matchesExistingGroups(order);
    for (const [name, matched] of Object.entries(groups)) if (matched) addToTotals(existing[name], order);

    if (order?.status === undefined || order?.status === null) statusQuality.missing += 1;
    else if (isUnexpectedStatus(order.status)) statusQuality.unexpected += 1;

    const refund = refundClassification(order);
    const historicalPaid = isHistoricallyPaid(order, refund);
    const financiallyRelevant = historicalPaid || refund.fullyRefunded;
    if (financiallyRelevant) {
      if (order?.total_amount === undefined || order?.total_amount === null) amountQuality.gross_missing += 1;
      else if (finiteNumber(order.total_amount) === null) amountQuality.gross_invalid += 1;
    }
    if (order?.refunded_amount_minor !== undefined && order?.refunded_amount_minor !== null && finiteNumber(order.refunded_amount_minor) === null) {
      amountQuality.refund_minor_invalid += 1;
    }
    if (refund.legacy_present) amountQuality.legacy_refund_amounts += 1;
    if (refund.legacy_only) amountQuality.legacy_only_refund_amounts += 1;
    if (refund.conflicting_aggregates) amountQuality.conflicting_refund_amounts += 1;
    const successfulRecord = Array.isArray(order?.refunds) && order.refunds.some(record => record?.status === 'succeeded');
    if (successfulRecord) {
      successfulRefundRecords.orders_with_successful_record += 1;
      const aggregateMissing = order?.refunded_amount_minor === undefined || order?.refunded_amount_minor === null;
      if (aggregateMissing) successfulRefundRecords.successful_record_missing_aggregate += 1;
      const successfulAmounts = order.refunds.filter(record => record?.status === 'succeeded');
      if (successfulAmounts.some(record => finiteNumber(record?.amount_minor) !== null)) successfulRefundRecords.successful_record_valid_amount += 1;
      if (successfulAmounts.some(record => record?.amount_minor !== undefined && record?.amount_minor !== null && finiteNumber(record?.amount_minor) === null)) successfulRefundRecords.successful_record_invalid_amount += 1;
      if (aggregateMissing && successfulAmounts.some(record => record?.status === 'succeeded' && finiteNumber(record?.amount_minor) !== null)) {
        successfulRefundRecords.successful_record_amount_without_aggregate += 1;
      }
    }
    if (historicalPaid) {
      addToTotals(independent.historically_verified_paid, order);
      orderCounts.historically_verified_paid += 1;
      confirmedRefundMajor += refund.confirmed_major;
      legacyRefundMajor += refund.legacy_major;
      const fulfillmentStatus = order?.fulfillment_status;
      if (fulfillmentStatus === 'fulfilled') addToTotals(fulfillment.fulfilled, order);
      else if (fulfillmentStatus === 'pending') addToTotals(fulfillment.unfulfilled, order);
      else if (fulfillmentStatus === 'failed') addToTotals(fulfillment.failed, order);
      else addToTotals(fulfillment.unknown, order);
    }

    if (isFinanciallyPaidOrder(order)) {
      addToTotals(helperAccepted, order);
      if (!groups.paid && !groups.unfulfilled && !groups.refunded) addToTotals(helperExcluded, order);
    }

    if (refund.fullyRefunded) refunds.confirmed_fully += 1;
    if (REFUNDED_STATUSES.has(order?.status)) refunds.status_marked_refunded += 1;
    if (refund.fullyRefunded && REFUNDED_STATUSES.has(order?.status)) refunds.confirmed_fully_status_refunded += 1;
    if (refund.partiallyRefunded) refunds.confirmed_partially += 1;
    if (refund.statusWithoutEvidence) refunds.status_without_evidence += 1;
    if (refund.paidStatusRefunded) refunds.paid_status_refunded += 1;
    if (refund.paymentPaidStatusRefunded) refunds.payment_paid_status_refunded += 1;
    if (refund.reservationPending) refunds.reservation_pending += 1;
    if (refund.legacy_only) refunds.legacy_only += 1;
    if (refund.conflicting_aggregates) refunds.conflicting_aggregates += 1;
    if (REFUNDED_STATUSES.has(order?.status)) orderCounts.currently_refunded += 1;
    if (refund.fullyRefunded) orderCounts.confirmed_full_refund += 1;
    if (refund.partiallyRefunded) orderCounts.confirmed_partial_refund += 1;
    if (refund.statusWithoutEvidence) orderCounts.refunded_status_without_evidence += 1;
    if (refund.evidence && !historicalPaid) orderCounts.refund_evidence_without_verified_payment += 1;
    if ((REFUNDED_STATUSES.has(order?.status) || order?.payment_status === 'refunded') && !historicalPaid) orderCounts.unresolved_historical_payment += 1;
    const reasons = [];
    if (refund.statusWithoutEvidence) reasons.push('status_without_refund_evidence');
    if (refund.paidStatusRefunded) reasons.push('paid_status_refunded');
    if (refund.paymentPaidStatusRefunded) reasons.push('payment_paid_status_refunded');
    if (reasons.length) {
      contradictoryCount += 1;
      for (const reason of reasons) contradictionReasons[reason] += 1;
    }
  }

  const paidGross = independent.historically_verified_paid.gross;
  const confirmedRefunds = confirmedRefundMajor;
  return {
    existing,
    independent: {
      historically_verified_paid: independent.historically_verified_paid,
      fulfillment,
      gross: roundMoney(paidGross),
      confirmed_refunds: roundMoney(confirmedRefunds),
      net_revenue: roundMoney(paidGross - confirmedRefunds),
      total_tickets: independent.historically_verified_paid.tickets,
    },
    helper_accepted: helperAccepted,
    helper_excluded_from_existing_groups: helperExcluded,
    refund_classification: { ...refunds, confirmed_major: roundMoney(confirmedRefundMajor), legacy_major: roundMoney(legacyRefundMajor) },
    amount_quality: amountQuality,
    successful_refund_records: successfulRefundRecords,
    contradictory_states: { count: contradictoryCount, reasons: contradictionReasons },
    status_quality: statusQuality,
    order_counts: orderCounts,
  };
}

function timestampValue(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : null;
}

export function createOrderMetricsAuditHandler({ db, assertAdmin, pageSize = AUDIT_PAGE_SIZE, maxDocuments = AUDIT_MAX_DOCUMENTS } = {}) {
  return async request => {
    await assertAdmin(request);
    const ordersRef = db.collection('order');
    const fields = [...new Set([...Object.keys(CATEGORICAL_FIELDS), ...AMOUNT_FIELDS, ...REFUND_FIELDS, ...TICKET_FIELDS])];
    const fieldStats = new Map(fields.map(field => [field, createFieldStats(field)]));
    const orders = [];
    let last = null;
    let complete = false;

    while (orders.length < maxDocuments) {
      const batchSize = Math.min(pageSize, maxDocuments - orders.length);
      let query = ordersRef.orderBy('__name__').limit(batchSize);
      if (last) query = query.startAfter(last);
      const snapshot = await query.get();
      if (!snapshot.docs.length) {
        complete = true;
        break;
      }
      for (const doc of snapshot.docs) {
        const data = doc.data() || {};
        orders.push(data);
        for (const [field, stats] of fieldStats) recordField(stats, field, data[field]);
      }
      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < batchSize) {
        complete = true;
        break;
      }
    }

    const maxReached = orders.length >= maxDocuments && !complete;
    const reconciliation = currentAndIndependentTotals(orders);
    const historicalPaymentComplete = complete && reconciliation.order_counts.unresolved_historical_payment === 0 &&
      reconciliation.order_counts.refund_evidence_without_verified_payment === 0;
    const grossComplete = complete && historicalPaymentComplete && reconciliation.amount_quality.gross_missing === 0 && reconciliation.amount_quality.gross_invalid === 0;
    const refundsComplete = complete && reconciliation.amount_quality.legacy_only_refund_amounts === 0 &&
      reconciliation.amount_quality.conflicting_refund_amounts === 0 &&
      reconciliation.amount_quality.refund_minor_invalid === 0 &&
      reconciliation.successful_refund_records.successful_record_missing_aggregate === 0 &&
      reconciliation.successful_refund_records.successful_record_invalid_amount === 0;
    const dashboardSnapshot = await db.collection('system_metrics').doc('dashboard').get();
    const dashboardData = dashboardSnapshot.exists ? dashboardSnapshot.data() : null;

    return {
      coverage: {
        scanned: orders.length,
        complete,
        max_reached: maxReached,
        scan_failed: false,
        totals_complete: complete,
        totals_scope: complete ? 'complete_collection' : 'partial_scan',
        max_documents: maxDocuments,
      },
      field_diagnostics: Object.fromEntries(fieldStats),
      existing_aggregation_predicates: {
        paid: 'status in ["paid", "Paid"]',
        paid_but_unfulfilled: 'payment_status == "paid" AND status not-in ["paid", "Paid", "Refunded", "refunded"]',
        refunded: 'status in ["Refunded", "refunded"]',
      },
      existing_aggregation: reconciliation.existing,
      financial_classification: {
        helper_accepted: reconciliation.helper_accepted,
        helper_excluded_from_existing_groups: reconciliation.helper_excluded_from_existing_groups,
        independent: reconciliation.independent,
        refund_classification: reconciliation.refund_classification,
        amount_quality: reconciliation.amount_quality,
        successful_refund_records: reconciliation.successful_refund_records,
        contradictory_states: reconciliation.contradictory_states,
        status_quality: reconciliation.status_quality,
        order_counts: reconciliation.order_counts,
        revenue_completeness: {
          gross_revenue_complete: grossComplete,
          confirmed_refunds_complete: refundsComplete,
          net_revenue_complete: grossComplete && refundsComplete,
          historical_payment_classification_complete: historicalPaymentComplete,
          legacy_refund_amounts_exist: reconciliation.amount_quality.legacy_refund_amounts > 0,
          totals_scope: complete ? 'complete_collection' : 'partial_scan',
        },
      },
      dashboard: dashboardData
        ? {
            total_orders: dashboardData.total_orders ?? null,
            total_revenue: dashboardData.total_revenue ?? null,
            total_tickets_sold: dashboardData.total_tickets_sold ?? null,
            last_refreshed_at: timestampValue(dashboardData.last_refreshed_at),
            updated_at: timestampValue(dashboardData.updated_at),
          }
        : null,
    };
  };
}
