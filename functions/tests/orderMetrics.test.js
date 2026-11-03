import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyOrderFinancially,
  computeDetailedOrderFinancialSummary,
  computeOrderFinancialSummaryFromOrders,
  isFinanciallyPaidOrder,
} from '../services/orderMetricsService.js';

describe('order financial metrics', () => {
  it('counts paid and paid-but-unfulfilled orders while excluding pending and failed payments', () => {
    const orders = [
      { id: 'o1', status: 'paid', payment_status: 'paid', total_amount: 270, total_ticket: 3, refunded_amount: 0 },
      { id: 'o2', status: 'paid', payment_status: 'paid', total_amount: 40, total_ticket: 4, refunded_amount: 10 },
      { id: 'o3', status: 'pending', payment_status: 'unpaid', total_amount: 50, total_ticket: 5 },
      { id: 'o4', status: 'failed', payment_status: 'unpaid', total_amount: 30, total_ticket: 3 },
      { id: 'o5', status: 'Refunded', payment_status: 'refunded', total_amount: 100, total_ticket: 10, refunded_amount: 100 },
      { id: 'o6', status: 'Refunded', total_amount: 20, total_ticket: 2 },
      { id: 'o7', status: 'pending', payment_status: 'paid', fulfillment_status: 'failed', total_amount: 60 },
      { id: 'o8', status: 'paid', total_amount: 80, total_ticket: 8, refunded_amount: 0, refund_reserved_amount_minor: 5000 },
      { id: 'o9', status: 'paid', total_amount: 25, total_ticket: 1, order_type: 'additional_payment' },
      { id: 'o10', status: 'Paid', total_amount: 15, total_ticket: 1 },
      { id: 'o11', status: 'refunded', total_amount: 50, total_ticket: 1 },
    ];

    assert.deepEqual(computeOrderFinancialSummaryFromOrders(orders), {
      totalOrders: 7,
      totalRevenue: 480,
      totalTicketsSold: 27,
    });
  });

  it('does not subtract pending refund reservations', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      {
        status: 'paid',
        payment_status: 'paid',
        total_amount: 100,
        total_ticket: 1,
        refunded_amount: 0,
        refund_reserved_amount_minor: 10000,
        refund_status: 'pending',
      },
    ]);

    assert.equal(summary.totalRevenue, 100);
  });

  it('does not treat a refund status alone as historical payment evidence', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      { status: 'Refunded', total_amount: 100, total_ticket: 1, refunded_amount: 100 },
      { status: 'refunded', total_amount: 45, total_ticket: 1 },
    ]);

    assert.deepEqual(summary, {
      totalOrders: 1,
      totalRevenue: 0,
      totalTicketsSold: 1,
    });
  });

  it('keeps successful zero-value refund records distinct from missing evidence', () => {
    assert.equal(classifyOrderFinancially({
      status: 'paid',
      payment_status: 'paid',
      total_amount: 10,
      refunds: [{ status: 'succeeded', amount_minor: 0 }],
    }).classification, 'paid_unfulfilled');
    assert.equal(classifyOrderFinancially({
      status: 'paid',
      payment_status: 'paid',
      total_amount: 0,
      refunds: [{ status: 'succeeded', amount_minor: 0 }],
    }).classification, 'paid_unfulfilled');
    assert.equal(classifyOrderFinancially({
      status: 'paid',
      payment_status: 'paid',
      total_amount: 10,
      refunds: [{ status: 'succeeded', amount_minor: 250 }],
    }).classification, 'partially_refunded');
    assert.equal(classifyOrderFinancially({
      status: 'paid',
      payment_status: 'paid',
      total_amount: 10,
      refunds: [{ status: 'succeeded', amount_minor: 1000 }],
    }).classification, 'fully_refunded');

    const zeroRefund = computeOrderFinancialSummaryFromOrders([
      { status: 'paid', payment_status: 'paid', total_amount: 10, refund_status: 'partial', refunds: [{ status: 'succeeded', amount_minor: 0 }] },
      { status: 'Refunded', payment_status: 'paid', total_amount: 10, refund_status: 'refunded', refunds: [{ status: 'succeeded', amount_minor: 0 }] },
    ]);
    assert.deepEqual(zeroRefund, { totalOrders: 2, totalRevenue: 20, totalTicketsSold: 0 });

    assert.equal(
      classifyOrderFinancially({ status: 'paid', payment_status: 'paid', total_amount: 10, refund_status: 'partial' }).classification,
      'unresolved',
    );
    assert.equal(
      classifyOrderFinancially({ status: 'paid', payment_status: 'paid', total_amount: 10, refund_status: 'refunded' }).classification,
      'unresolved',
    );
  });

  it('handles legacy capitalised paid status and partial refund amounts', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      { status: 'Paid', total_amount: 19.99, total_ticket: 1, refunded_amount: 0.5 },
      { status: 'paid', total_amount: 0.1, total_ticket: 1, refunded_amount: 0 },
    ]);

    assert.equal(summary.totalRevenue, 19.59);
    assert.equal(summary.totalOrders, 2);
  });

  it('identifies financially paid order states', () => {
    assert.equal(isFinanciallyPaidOrder({ status: 'paid', total_amount: 0 }), true);
    assert.equal(isFinanciallyPaidOrder({ status: 'Paid', total_amount: 10 }), true);
    assert.equal(isFinanciallyPaidOrder({ status: 'Refunded' }), false);
    assert.equal(isFinanciallyPaidOrder({ status: 'Refunded', total_amount: 10, refunded_amount: 10 }), true);
    assert.equal(isFinanciallyPaidOrder({ status: 'pending', payment_status: 'paid' }), false);
    assert.equal(isFinanciallyPaidOrder({ status: 'pending', payment_status: 'unpaid' }), false);
    assert.equal(isFinanciallyPaidOrder({ status: 'failed', payment_status: 'unpaid' }), false);
  });

  it('supports legacy orders with missing refund fields and zero-value paid orders', () => {
    assert.deepEqual(computeOrderFinancialSummaryFromOrders([
      { status: 'paid', total_amount: 0, total_ticket: 0 },
      { status: 'paid', total_amount: 10, total_ticket: 1 },
    ]), {
      totalOrders: 2,
      totalRevenue: 10,
      totalTicketsSold: 1,
    });
  });

  it('reconciles minor-unit, legacy and successful refund representations once', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      {
        status: 'paid',
        total_amount: 100,
        total_ticket: 10,
        refunded_amount: 30,
        refunded_amount_minor: 3000,
        refunds: [{ status: 'succeeded', amount_minor: 3000 }],
      },
      {
        status: 'Refunded',
        total_amount: 50,
        total_ticket: 5,
        refunded_amount_minor: 5000,
        refunds: [{ status: 'succeeded', amount_minor: 5000 }],
      },
    ]);
    assert.deepEqual(summary, { totalOrders: 2, totalRevenue: 70, totalTicketsSold: 15 });
  });

  it('does not deduct pending, requires-action, failed or canceled refunds', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      { status: 'paid', total_amount: 10, refunds: [{ status: 'pending', amount_minor: 1000 }] },
      { status: 'paid', total_amount: 20, refunds: [{ status: 'requires_action', amount_minor: 2000 }] },
      { status: 'paid', total_amount: 30, refunds: [{ status: 'failed', amount_minor: 3000 }] },
      { status: 'paid', total_amount: 40, refunds: [{ status: 'canceled', amount_minor: 4000 }] },
    ]);
    assert.equal(summary.totalRevenue, 100);
  });

  it('exposes invalid and conflicting financial evidence instead of inventing a refund', () => {
    const result = computeDetailedOrderFinancialSummary([
      { status: 'paid', total_amount: 10, refunded_amount: 2, refunded_amount_minor: 300 },
      { status: 'paid', total_amount: -1 },
    ]);
    assert.equal(result.totalOrders, 0);
    assert.equal(result.unresolvedCount, 2);
    assert.equal(result.conflictingRefundCount, 1);
    assert.equal(result.invalidAmountCount, 1);
  });

  it('does not treat present invalid refund fields as missing', () => {
    const result = computeDetailedOrderFinancialSummary([
      { status: 'paid', total_amount: 10, refunded_amount: 'not-a-number' },
      { status: 'paid', total_amount: 10, refunded_amount_minor: null },
      { status: 'paid', total_amount: 10, refunds: [{ status: 'succeeded' }] },
    ]);
    assert.equal(result.totalOrders, 0);
    assert.equal(result.unresolvedCount, 3);
  });

  it('flags contradictory payment states and refunds exceeding gross', () => {
    const result = computeDetailedOrderFinancialSummary([
      { status: 'paid', payment_status: 'refunded', total_amount: 10 },
      { status: 'pending', payment_status: 'refunded', total_amount: 10, refunded_amount: 10 },
      { status: 'paid', total_amount: 10, refunded_amount_minor: 1001 },
    ]);
    assert.equal(result.totalOrders, 0);
    assert.equal(result.unresolvedCount, 3);
    assert.equal(result.anomalyCount, 1);
  });

  it('defines refunded and payment-status combinations explicitly', () => {
    const refundEvidence = { total_amount: 10, refunded_amount_minor: 1000 };
    const cases = [
      [{ status: 'Refunded', payment_status: 'failed', ...refundEvidence }, 'unresolved'],
      [{ status: 'Refunded', payment_status: 'unpaid', ...refundEvidence }, 'unresolved'],
      [{ status: 'Refunded', payment_status: 'paid', ...refundEvidence }, 'fully_refunded'],
      [{ status: 'Refunded', ...refundEvidence }, 'fully_refunded'],
      [{ status: 'paid', payment_status: 'refunded', ...refundEvidence }, 'unresolved'],
      [{ status: 'paid', payment_status: 'failed', total_amount: 10 }, 'unresolved'],
      [{ status: 'pending', payment_status: 'paid', total_amount: 10 }, 'paid_unfulfilled'],
      [{ status: 'pending', payment_status: 'refunded', ...refundEvidence }, 'unresolved'],
    ];

    for (const [order, classification] of cases) {
      const result = classifyOrderFinancially(order);
      assert.equal(result.classification, classification, JSON.stringify(order));
      assert.equal(isFinanciallyPaidOrder(order), classification !== 'unresolved' && classification !== 'excluded');
    }
  });

  it('rejects successful refund totals that overflow safe integer range', () => {
    const result = computeDetailedOrderFinancialSummary([{
      status: 'paid',
      total_amount: 100,
      refunds: [
        { status: 'succeeded', amount_minor: Number.MAX_SAFE_INTEGER },
        { status: 'succeeded', amount_minor: 1 },
      ],
    }]);
    assert.equal(result.totalOrders, 0);
    assert.equal(result.unresolvedCount, 1);
  });

  it('detects cumulative gross and refund total overflow', () => {
    const result = computeDetailedOrderFinancialSummary([
      { status: 'paid', total_amount: Number.MAX_SAFE_INTEGER / 100 },
      { status: 'paid', total_amount: Number.MAX_SAFE_INTEGER / 100 },
    ]);
    assert.equal(result.overflowCount, 1);
    assert.throws(
      () => computeOrderFinancialSummaryFromOrders([
        { status: 'paid', total_amount: Number.MAX_SAFE_INTEGER / 100 },
        { status: 'paid', total_amount: Number.MAX_SAFE_INTEGER / 100 },
      ]),
      /safe integer range/,
    );
  });

  it('includes paid-but-unfulfilled and additional-payment orders once', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      { status: 'pending', payment_status: 'paid', fulfillment_status: 'failed', total_amount: 15 },
      { status: 'paid', payment_status: 'paid', order_type: 'additional_payment', total_amount: 25 },
    ]);
    assert.deepEqual(summary, { totalOrders: 2, totalRevenue: 40, totalTicketsSold: 0 });
  });
});
