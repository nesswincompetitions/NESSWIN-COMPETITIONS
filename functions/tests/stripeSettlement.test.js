import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCheckoutSettlement,
  isVerifiedStripeSettlementContext,
  SettlementValidationError,
} from '../services/stripeSettlementService.js';
import { PAYMENT_SETTLEMENT } from '../services/ticketOrigin.js';

function order(overrides = {}) {
  return {
    status: 'pending',
    stripe_checkout_session_id: 'cs_1',
    total_amount: 40,
    currency: 'GBP',
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    id: 'cs_1',
    metadata: { orderId: 'o1' },
    amount_total: 4000,
    currency: 'gbp',
    payment_status: 'paid',
    payment_intent: 'pi_1',
    mode: 'payment',
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluateCheckoutSettlement({
    eventType: 'checkout.session.completed',
    session: session(overrides.session),
    orderData: overrides.orderData === undefined ? order() : overrides.orderData,
  });
}

function expectCode(code, overrides) {
  assert.throws(
    () => evaluate(overrides),
    (error) =>
      error instanceof SettlementValidationError &&
      error.code === code
  );
}

describe('Stripe Checkout settlement decision', () => {
  it('fulfills a paid session only after order, session, amount, and currency verification', () => {
    const decision = evaluate();

    assert.equal(decision.action, 'fulfill');
    assert.equal(decision.settlement, PAYMENT_SETTLEMENT.STRIPE_PAID);
    assert.equal(decision.paymentIntentId, 'pi_1');
    assert.equal(decision.orderId, 'o1');
    assert.equal(isVerifiedStripeSettlementContext(decision.settlementContext), true);
    assert.equal(decision.settlementContext.type, PAYMENT_SETTLEMENT.STRIPE_PAID);
    assert.equal(decision.settlementContext.orderId, 'o1');
    assert.equal(decision.settlementContext.amountMinor, 4000);
    assert.equal(decision.settlementContext.currency, 'gbp');
  });

  it('keeps an unpaid completed session pending', () => {
    const decision = evaluate({ session: { payment_status: 'unpaid', payment_intent: null } });

    assert.equal(decision.action, 'pending');
    assert.equal(decision.reason, 'unpaid');
  });

  it('fulfills a no-payment-required zero session as zero_payment', () => {
    const decision = evaluate({
      orderData: order({ total_amount: 0 }),
      session: {
        payment_status: 'no_payment_required',
        payment_intent: null,
        amount_total: 0,
      },
    });

    assert.equal(decision.action, 'fulfill');
    assert.equal(decision.settlement, PAYMENT_SETTLEMENT.STRIPE_ZERO_PAYMENT);
    assert.equal(decision.paymentIntentId, '');
    assert.equal(isVerifiedStripeSettlementContext(decision.settlementContext), true);
    assert.equal(decision.settlementContext.type, PAYMENT_SETTLEMENT.STRIPE_ZERO_PAYMENT);
  });

  it('rejects no-payment-required sessions with a non-zero amount', () => {
    expectCode('amount_mismatch', {
      session: { payment_status: 'no_payment_required', payment_intent: null },
    });
  });

  it('rejects amount and currency mismatches', () => {
    expectCode('amount_mismatch', { session: { amount_total: 3999 } });
    expectCode('currency_mismatch', { session: { currency: 'usd' } });
  });

  it('rejects wrong, missing, or mismatched order/session associations', () => {
    expectCode('missing_order_id', { session: { metadata: {} } });
    expectCode('order_not_found', { orderData: null });
    expectCode('session_mismatch', {
      orderData: order({ stripe_checkout_session_id: 'cs_other' }),
    });
  });

  it('rejects invalid order states and missing payment intent', () => {
    expectCode('invalid_order_status', { orderData: order({ status: 'failed' }) });
    expectCode('missing_payment_intent', { session: { payment_intent: null } });
    expectCode('unsupported_payment_status', { session: { payment_status: 'processing' } });
  });

  it('requires payment mode and rejects missing or invalid modes', () => {
    expectCode('invalid_mode', { session: { mode: undefined } });
    expectCode('invalid_mode', { session: { mode: 'subscription' } });
  });

  it('rejects missing, null, empty, malformed, and non-finite order amounts', () => {
    const missingAmountOrder = order();
    delete missingAmountOrder.total_amount;

    for (const orderData of [
      missingAmountOrder,
      order({ total_amount: null }),
      order({ total_amount: '' }),
      order({ total_amount: '40' }),
      order({ total_amount: true }),
      order({ total_amount: Number.NaN }),
      order({ total_amount: Number.POSITIVE_INFINITY }),
      order({ total_amount: -1 }),
    ]) {
      expectCode('invalid_order_amount', { orderData });
    }
  });

  it('treats duplicate delivery of a paid order as already processed without downgrading it', () => {
    const paidOrder = evaluate({
      orderData: order({
        status: 'paid',
        stripe_status: 'paid',
        stripe_payment_intent_id: 'pi_existing',
      }),
    });
    assert.equal(paidOrder.action, 'already_processed');
    assert.equal(paidOrder.expectedStripeStatus, 'paid');
    assert.equal(paidOrder.paymentIntentId, 'pi_existing');

    const unpaidDuplicate = evaluate({
      orderData: order({
        status: 'paid',
        stripe_status: 'paid',
        stripe_payment_intent_id: 'pi_existing',
      }),
      session: { payment_status: 'unpaid', payment_intent: null },
    });
    assert.equal(unpaidDuplicate.action, 'already_processed');
    assert.equal(unpaidDuplicate.expectedStripeStatus, 'paid');
    assert.equal(unpaidDuplicate.paymentIntentId, 'pi_existing');
  });

  it('preserves an existing free classification for duplicate zero-payment delivery', () => {
    const decision = evaluate({
      orderData: order({
        status: 'paid',
        stripe_status: 'free',
        stripe_payment_intent_id: '',
        total_amount: 0,
      }),
      session: {
        payment_status: 'no_payment_required',
        payment_intent: null,
        amount_total: 0,
      },
    });

    assert.equal(decision.action, 'already_processed');
    assert.equal(decision.expectedStripeStatus, 'free');
    assert.equal(decision.paymentIntentId, '');
  });

  it('does not downgrade an existing paid classification on a zero-payment duplicate', () => {
    const decision = evaluate({
      orderData: order({
        status: 'paid',
        stripe_status: 'paid',
        stripe_payment_intent_id: 'pi_existing',
        total_amount: 0,
      }),
      session: {
        payment_status: 'no_payment_required',
        payment_intent: null,
        amount_total: 0,
      },
    });

    assert.equal(decision.action, 'already_processed');
    assert.equal(decision.expectedStripeStatus, 'paid');
    assert.equal(decision.paymentIntentId, 'pi_existing');
  });

  it('ignores non-completed event types', () => {
    const decision = evaluateCheckoutSettlement({
      eventType: 'checkout.session.expired',
      session: session(),
      orderData: order(),
    });
    assert.equal(decision.action, 'ignore');
  });
});
