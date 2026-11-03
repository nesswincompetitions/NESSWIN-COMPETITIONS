import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrderStatusQueryValues,
  isPaidOrderStatus,
  isRefundedOrderStatus,
  normalizeOrderStatus,
} from '../../src/shared/utils/orderStatus.js';

describe('order status filtering', () => {
  it('returns no query values for the All filter', () => {
    assert.equal(getOrderStatusQueryValues('all'), null);
    assert.equal(getOrderStatusQueryValues(''), null);
    assert.equal(getOrderStatusQueryValues(undefined), null);
  });

  it('uses the stored canonical paid and pending values', () => {
    assert.deepEqual(getOrderStatusQueryValues('paid'), ['paid', 'Paid']);
    assert.deepEqual(getOrderStatusQueryValues('pending'), ['pending', 'Pending']);
    assert.deepEqual(getOrderStatusQueryValues('failed'), ['failed', 'Failed']);
  });

  it('matches the capitalised refunded status used by the refund service', () => {
    assert.deepEqual(getOrderStatusQueryValues('refunded'), ['Refunded', 'refunded']);
  });

  it('keeps every filter genuinely distinct', () => {
    const signatures = ['paid', 'pending', 'failed', 'refunded'].map((key) =>
      JSON.stringify(getOrderStatusQueryValues(key))
    );
    assert.equal(new Set(signatures).size, signatures.length);
  });

  it('normalises legacy casing for display and comparisons', () => {
    assert.equal(normalizeOrderStatus('Refunded'), 'refunded');
    assert.equal(normalizeOrderStatus('Paid'), 'paid');
    assert.equal(isPaidOrderStatus('Paid'), true);
    assert.equal(isRefundedOrderStatus('REFUNDED'), true);
    assert.equal(isRefundedOrderStatus('paid'), false);
  });
});
