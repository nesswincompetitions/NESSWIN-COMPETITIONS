import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  createMockAdmin,
  createMockLogger,
  MockHttpsError,
} from './helpers/memoryFirestore.js';
import { createStripeWebhookHandler } from '../controllers/paymentWebhookController.js';
import { runOrderTransaction } from '../services/orderTransactionService.js';
import {
  evaluateCheckoutSettlement,
  SettlementValidationError,
} from '../services/stripeSettlementService.js';
import { buildNotificationPayload } from '../services/orderNotificationService.js';
import { PAYMENT_SETTLEMENT } from '../services/ticketOrigin.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);

function seed(db, { stockQuantity = 100 } = {}) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', 'u1', {
    display_name: 'Webhook User',
    free_tickets: 1,
    total_free_tickets: 1,
  });
  db.setDocument('competition', 'c1', {
    title: 'Webhook Competition',
    status: 'active',
    draw_date: { toDate: () => FUTURE_DRAW },
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: stockQuantity,
    sold_tickets: 0,
    last_ticket_sequence: 0,
    participants: [],
  });
  db.setDocument('skill_attempts', 'u1_c1', { passed: true });
  db.setDocument('referrals', 'r1', {
    referrer_id: userRef,
    reward_type: 'referral',
    reward_value: 1,
    reward_issued: false,
    created_at: new Date(),
  });
  db.setDocument('order', 'o1', {
    status: 'pending',
    user_ref: userRef,
    competition_id: competitionRef,
    total_amount: 50,
    stripe_checkout_session_id: 'cs_1',
    ticket_quantity: 5,
    free_tickets_to_use: 1,
    referrals_to_burn: [{ id: 'r1' }],
  });

  return { userRef, competitionRef };
}

function checkoutEvent() {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        metadata: { orderId: 'o1' },
        amount_total: 5000,
        currency: 'gbp',
        payment_status: 'paid',
        payment_intent: 'pi_1',
        mode: 'payment',
      },
    },
  };
}

function makeHandler(db, { event = checkoutEvent() } = {}) {
  return createStripeWebhookHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    runOrderTransaction,
    buildNotificationPayload,
    evaluateCheckoutSettlement,
    SettlementValidationError,
    PAYMENT_SETTLEMENT,
    stripeFactory: () => ({
      webhooks: { constructEvent: () => event },
    }),
    getStripeSecretKey: () => 'sk_test',
    getWebhookSecret: () => 'whsec_test',
  });
}

function makeRequest() {
  return {
    headers: { 'stripe-signature': 'sig_test' },
    rawBody: new TextEncoder().encode('{}'),
  };
}

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(handler) {
  const res = makeResponse();
  await handler(makeRequest(), res);
  return res;
}

function assertPaidUnfulfilled(db, { attempts = 1 } = {}) {
  const order = db.snapshot('order', 'o1').data();
  assert.equal(order.status, 'pending');
  assert.equal(order.payment_status, 'paid');
  assert.equal(order.fulfillment_status, 'failed');
  assert.equal(order.stripe_status, 'paid');
  assert.equal(order.stripe_payment_intent_id, 'pi_1');
  assert.equal(typeof order.fulfillment_error, 'string');
  assert.equal(order.fulfillment_attempts, attempts);
  assert.equal(db.collectionStore('ticket').size, 0);
  assert.equal(db.collectionStore('free_ticket_log').size, 0);
  assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, false);
}

describe('paid-but-unfulfilled webhook handling', () => {
  it('marks a paid order as unfulfilled when the draw starts before fulfillment', async () => {
    const db = new MemoryDB();
    seed(db);
    db.beforeTransaction = async () => {
      db.setDocument('competition', 'c1', {
        ...db.snapshot('competition', 'c1').data(),
        status: 'drawing',
      });
    };

    const res = await invoke(makeHandler(db));

    assert.equal(res.statusCode, 500);
    assert.match(res.body, /Fulfillment Error/);
    assertPaidUnfulfilled(db);
  });

  it('marks a paid order as unfulfilled when stock is insufficient', async () => {
    const db = new MemoryDB();
    seed(db, { stockQuantity: 1 });

    const res = await invoke(makeHandler(db));

    assert.equal(res.statusCode, 500);
    assertPaidUnfulfilled(db);
  });

  it('retries safely after a previous failure without duplicating tickets', async () => {
    const db = new MemoryDB();
    seed(db, { stockQuantity: 1 });
    const handler = makeHandler(db);

    const first = await invoke(handler);
    assert.equal(first.statusCode, 500);
    assertPaidUnfulfilled(db);

    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      stock_quantity: 100,
    });

    const second = await invoke(handler);
    assert.equal(second.statusCode, 200, second.body);

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'fulfilled');
    assert.equal(order.fulfillment_error, undefined);
    assert.equal(order.stripe_status, 'paid');
    assert.equal(order.stripe_payment_intent_id, 'pi_1');
    assert.equal(db.collectionStore('ticket').size, 6);
    assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, true);
  });

  it('keeps repeated failed deliveries idempotent for tickets and financial records', async () => {
    const db = new MemoryDB();
    seed(db, { stockQuantity: 1 });
    const handler = makeHandler(db);

    await invoke(handler);
    await invoke(handler);

    assertPaidUnfulfilled(db, { attempts: 2 });
    assert.equal(db.collectionStore('order').size, 1);
  });

  it('keeps a successful delivery idempotent', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const first = await invoke(handler);
    const second = await invoke(handler);

    assert.equal(first.statusCode, 200, first.body);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body, 'Order already processed.');
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'fulfilled');
    assert.equal(order.stripe_status, 'paid');
    assert.equal(order.stripe_payment_intent_id, 'pi_1');
    assert.equal(db.collectionStore('ticket').size, 6);
  });

  it('does not mark an unpaid session as paid-unfulfilled', async () => {
    const db = new MemoryDB();
    seed(db);
    const before = db.snapshot('order', 'o1').data();
    const event = checkoutEvent();
    event.data.object.payment_status = 'unpaid';

    const res = await invoke(makeHandler(db, { event }));

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, 'Payment pending.');
    assert.deepEqual(db.snapshot('order', 'o1').data(), before);
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('does not mark an amount-mismatched session as paid-unfulfilled', async () => {
    const db = new MemoryDB();
    seed(db);
    const before = db.snapshot('order', 'o1').data();
    const event = checkoutEvent();
    event.data.object.amount_total = 4999;

    const res = await invoke(makeHandler(db, { event }));

    assert.equal(res.statusCode, 400);
    assert.deepEqual(db.snapshot('order', 'o1').data(), before);
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('does not mark an order when the Stripe session does not match', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('order', 'o1', {
      ...db.snapshot('order', 'o1').data(),
      stripe_checkout_session_id: 'cs_other',
    });
    const before = db.snapshot('order', 'o1').data();

    const res = await invoke(makeHandler(db));

    assert.equal(res.statusCode, 400);
    assert.deepEqual(db.snapshot('order', 'o1').data(), before);
    assert.equal(db.collectionStore('ticket').size, 0);
  });
});
