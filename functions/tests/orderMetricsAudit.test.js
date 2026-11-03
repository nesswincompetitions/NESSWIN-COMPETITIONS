import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderMetricsAuditHandler } from '../services/orderMetricsAuditService.js';
import { MemoryDB, MockHttpsError } from './helpers/memoryFirestore.js';

const adminAssert = async request => {
  if (!request.auth?.uid) throw new MockHttpsError('unauthenticated', 'Login required.');
  if (request.auth.uid !== 'admin') throw new MockHttpsError('permission-denied', 'Admin required.');
};

function makeOrders(count, make = index => ({ status: index % 2 ? 'pending' : 'paid', payment_status: 'paid', total_amount: 10, total_ticket: 1 })) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`order-${String(index).padStart(5, '0')}`, make(index)]));
}

describe('read-only order metrics audit', () => {
  it('rejects unauthorized callers before reads', async () => {
    const handler = createOrderMetricsAuditHandler({ db: new MemoryDB(), assertAdmin: adminAssert });
    await assert.rejects(handler({ auth: null }), error => error.code === 'unauthenticated');
  });

  it('requires verified payment, validates numbers, sanitizes values, and detects contradictions', async () => {
    const db = new MemoryDB({
      order: {
        paidPending: { status: 'paid', payment_status: 'pending', total_amount: 100, total_ticket: 1 },
        paidFailed: { status: 'paid', payment_status: 'failed', total_amount: 100, total_ticket: 1 },
        paidMissing: { status: 'paid', total_amount: 100, total_ticket: 1 },
        unfulfilled: { status: 'pending', payment_status: 'paid', fulfillment_status: 'pending', total_amount: 7, total_ticket: 1 },
        failedFulfillment: { status: 'paid', payment_status: 'paid', fulfillment_status: 'failed', total_amount: 8, total_ticket: 1 },
        partial: { status: 'paid', payment_status: 'paid', total_amount: 20, total_ticket: 2, refunded_amount: 5, refunded_amount_minor: 500, refund_status: 'partial' },
        reserved: { status: 'paid', payment_status: 'paid', fulfillment_status: 'fulfilled', total_amount: 30, total_ticket: 3, refunded_amount: 0, refund_reserved_amount_minor: 1000, refund_status: 'pending' },
        full: { status: 'Refunded', payment_status: 'refunded', total_amount: 10, total_ticket: 1, refunded_amount: 10, refund_status: 'refunded', refunds: [{ status: 'succeeded', amount_minor: 1000 }] },
        paidFull: { status: 'paid', payment_status: 'paid', total_amount: 40, total_ticket: 4, refunded_amount: 40, refunded_amount_minor: 4000, refund_status: 'refunded' },
        paidStatusRefunded: { status: 'paid', payment_status: 'paid', total_amount: '40', refund_status: 'refunded' },
        paymentPaidStatusRefunded: { status: 'Refunded', payment_status: 'paid', total_amount: 50, total_ticket: 3 },
        strange: { status: 'do-not-return-this', payment_status: null, total_amount: null, total_ticket: true, refund_status: 'refunded', customer_email: 'secret@example.com' },
      },
      system_metrics: { dashboard: { total_revenue: 14, updated_at: 123 } },
    });
    const beforeDashboard = db.snapshot('system_metrics', 'dashboard').data();
    const beforeVersions = [db.version('order/paid'), db.version('system_metrics/dashboard')];
    const result = await createOrderMetricsAuditHandler({ db, assertAdmin: adminAssert })({ auth: { uid: 'admin' } });

    assert.equal(result.coverage.complete, true);
    assert.equal(result.financial_classification.independent.gross, 115);
    assert.equal(result.financial_classification.independent.confirmed_refunds, 45);
    assert.equal(result.financial_classification.independent.net_revenue, 70);
    assert.equal(result.financial_classification.independent.historically_verified_paid.count, 7);
    assert.equal(result.financial_classification.independent.fulfillment.unfulfilled.count, 1);
    assert.equal(result.financial_classification.refund_classification.confirmed_fully, 2);
    assert.equal(result.financial_classification.refund_classification.confirmed_major, 45);
    assert.equal(result.financial_classification.refund_classification.legacy_major, 10);
    assert.equal(result.financial_classification.independent.fulfillment.unfulfilled.count, 1);
    assert.equal(result.financial_classification.independent.fulfillment.failed.count, 1);
    assert.equal(result.financial_classification.independent.fulfillment.fulfilled.count, 1);
    assert.equal(result.financial_classification.independent.fulfillment.unknown.count, 4);
    assert.equal(result.financial_classification.order_counts.historically_verified_paid, 7);
    assert.equal(result.financial_classification.order_counts.currently_refunded, 2);
    assert.equal(result.financial_classification.order_counts.confirmed_full_refund, 2);
    assert.equal(result.financial_classification.order_counts.unresolved_historical_payment, 1);
    assert.equal(result.financial_classification.revenue_completeness.historical_payment_classification_complete, false);
    assert.equal(result.financial_classification.refund_classification.confirmed_partially, 1);
    assert.equal(result.financial_classification.refund_classification.reservation_pending, 1);
    assert.equal(result.financial_classification.successful_refund_records.orders_with_successful_record, 1);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_missing_aggregate, 1);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_amount_without_aggregate, 1);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_valid_amount, 1);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_invalid_amount, 0);
    assert.equal(result.financial_classification.revenue_completeness.confirmed_refunds_complete, false);
    assert.equal(result.financial_classification.contradictory_states.count, 3);
    assert.deepEqual(result.financial_classification.contradictory_states.reasons, {
      status_without_refund_evidence: 1,
      paid_status_refunded: 2,
      payment_paid_status_refunded: 1,
    });
    assert.equal(result.field_diagnostics.status.allowed_values.paid, 8);
    assert.equal(result.field_diagnostics.status.unexpected_value_count, 1);
    assert.equal(result.field_diagnostics.total_amount.type_counts.string, 1);
    assert.equal(result.field_diagnostics.total_amount.nulls, 1);
    assert.equal(result.field_diagnostics.total_amount.numeric_string_count, 1);
    assert.equal(result.field_diagnostics.total_ticket.invalid_value_count, 1);
    assert.equal(JSON.stringify(result).includes('do-not-return-this'), false);
    assert.equal(JSON.stringify(result).includes('secret@example.com'), false);
    assert.deepEqual(db.snapshot('system_metrics', 'dashboard').data(), beforeDashboard);
    assert.deepEqual([db.version('order/paid'), db.version('system_metrics/dashboard')], beforeVersions);
  });

  it('marks revenue incomplete for legacy refunds, invalid gross amounts, and missing refund aggregates', async () => {
    const db = new MemoryDB({
      order: {
        legacy: { status: 'paid', payment_status: 'paid', total_amount: 100, refunded_amount: 10, refund_status: 'partial' },
        conflict: { status: 'paid', payment_status: 'paid', total_amount: 20, refunded_amount: 10, refunded_amount_minor: 500, refund_status: 'partial' },
        invalidGross: { status: 'paid', payment_status: 'paid', total_amount: 'not-a-number' },
        successfulMissingAggregate: { status: 'pending', payment_status: 'paid', total_amount: 5, refunds: [{ status: 'succeeded', amount_minor: 500 }] },
        successfulWithAggregate: { status: 'pending', payment_status: 'paid', total_amount: 10, refunded_amount_minor: 500, refunds: [{ status: 'succeeded', amount_minor: 500 }] },
        successfulInvalidAmount: { status: 'pending', payment_status: 'paid', total_amount: 5, refunds: [{ status: 'succeeded', amount_minor: '500' }] },
      },
    });
    const result = await createOrderMetricsAuditHandler({ db, assertAdmin: adminAssert })({ auth: { uid: 'admin' } });

    assert.equal(result.financial_classification.amount_quality.legacy_refund_amounts, 2);
    assert.equal(result.financial_classification.amount_quality.legacy_only_refund_amounts, 1);
    assert.equal(result.financial_classification.amount_quality.gross_invalid, 1);
    assert.equal(result.financial_classification.amount_quality.conflicting_refund_amounts, 1);
    assert.equal(result.financial_classification.successful_refund_records.orders_with_successful_record, 3);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_missing_aggregate, 2);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_amount_without_aggregate, 1);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_valid_amount, 2);
    assert.equal(result.financial_classification.successful_refund_records.successful_record_invalid_amount, 1);
    assert.equal(result.financial_classification.refund_classification.confirmed_major, 10);
    assert.equal(result.financial_classification.revenue_completeness.gross_revenue_complete, false);
    assert.equal(result.financial_classification.revenue_completeness.confirmed_refunds_complete, false);
    assert.equal(result.financial_classification.revenue_completeness.net_revenue_complete, false);
  });

  it('handles multiple pages and reports complete totals', async () => {
    const db = new MemoryDB({ order: makeOrders(501) });
    const result = await createOrderMetricsAuditHandler({ db, assertAdmin: adminAssert })({ auth: { uid: 'admin' } });
    assert.equal(result.coverage.scanned, 501);
    assert.equal(result.coverage.complete, true);
    assert.equal(result.coverage.max_reached, false);
    assert.equal(result.coverage.totals_scope, 'complete_collection');
  });

  it('reports bounded partial coverage at the configured maximum', async () => {
    const db = new MemoryDB({ order: makeOrders(4) });
    const result = await createOrderMetricsAuditHandler({ db, assertAdmin: adminAssert, pageSize: 2, maxDocuments: 3 })({ auth: { uid: 'admin' } });
    assert.deepEqual(result.coverage, { scanned: 3, complete: false, max_reached: true, scan_failed: false, totals_complete: false, totals_scope: 'partial_scan', max_documents: 3 });
  });

  it('does not return a successful result when pagination fails', async () => {
    const db = new MemoryDB({ order: makeOrders(1) });
    const originalCollection = db.collection.bind(db);
    db.collection = name => {
      if (name === 'order') return { orderBy: () => ({ limit: () => ({ get: async () => { throw new Error('read failed'); } }) }) };
      return originalCollection(name);
    };
    const handler = createOrderMetricsAuditHandler({ db, assertAdmin: adminAssert });
    await assert.rejects(handler({ auth: { uid: 'admin' } }), /read failed/);
  });

  it('never writes to any collection during an authorized audit', async () => {
    const db = new MemoryDB({ order: makeOrders(2), system_metrics: { dashboard: { total_revenue: 20 } } });
    const before = JSON.stringify([...db.collections].map(([name, docs]) => [name, [...docs]]));
    await createOrderMetricsAuditHandler({ db, assertAdmin: adminAssert })({ auth: { uid: 'admin' } });
    const after = JSON.stringify([...db.collections].map(([name, docs]) => [name, [...docs]]));
    assert.equal(after, before);
  });
});
