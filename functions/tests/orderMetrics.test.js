import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOrderFinancialSummaryFromAggregates,
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
      totalOrders: 9,
      totalRevenue: 480,
      totalTicketsSold: 30,
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

  it('treats full refunds as zero net revenue, including legacy refunds without an amount', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      { status: 'Refunded', total_amount: 100, total_ticket: 1, refunded_amount: 100 },
      { status: 'refunded', total_amount: 45, total_ticket: 1 },
    ]);

    assert.deepEqual(summary, {
      totalOrders: 2,
      totalRevenue: 0,
      totalTicketsSold: 2,
    });
  });

  it('handles legacy capitalised paid status and partial refund amounts', () => {
    const summary = computeOrderFinancialSummaryFromOrders([
      { status: 'Paid', total_amount: 19.99, total_ticket: 1, refunded_amount: 0.5 },
      { status: 'paid', total_amount: 0.1, total_ticket: 1, refunded_amount: 0 },
    ]);

    assert.equal(summary.totalRevenue, 19.59);
    assert.equal(summary.totalOrders, 2);
  });

  it('never returns negative totals from inconsistent aggregates', () => {
    const summary = computeOrderFinancialSummaryFromAggregates({
      paidCount: -3,
      paidGross: -100,
      paidRefunded: 20,
      paidTickets: -5,
      refundedCount: -1,
    });

    assert.deepEqual(summary, {
      totalOrders: 0,
      totalRevenue: 0,
      totalTicketsSold: 0,
    });
  });

  it('clamps net revenue when refunds exceed gross collections', () => {
    const summary = computeOrderFinancialSummaryFromAggregates({
      paidCount: 1,
      paidGross: 100,
      paidRefunded: 150,
      paidTickets: 1,
    });

    assert.equal(summary.totalRevenue, 0);
  });

  it('identifies financially paid order states', () => {
    assert.equal(isFinanciallyPaidOrder({ status: 'paid' }), true);
    assert.equal(isFinanciallyPaidOrder({ status: 'Paid' }), true);
    assert.equal(isFinanciallyPaidOrder({ status: 'Refunded' }), true);
    assert.equal(isFinanciallyPaidOrder({ status: 'pending', payment_status: 'paid' }), true);
    assert.equal(isFinanciallyPaidOrder({ status: 'pending', payment_status: 'unpaid' }), false);
    assert.equal(isFinanciallyPaidOrder({ status: 'failed', payment_status: 'unpaid' }), false);
  });
});
