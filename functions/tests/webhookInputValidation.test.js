import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createStripeWebhookHandler } from '../controllers/paymentWebhookController.js';
import {
  runOrderTransaction,
} from '../services/orderTransactionService.js';
import {
  evaluateCheckoutSettlement,
  SettlementValidationError,
} from '../services/stripeSettlementService.js';
import { buildNotificationPayload } from '../services/orderNotificationService.js';
import { PAYMENT_SETTLEMENT } from '../services/ticketOrigin.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);

function seed(db, { freeTickets = 1, referralTypes = ['referral'] } = {}) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', 'u1', {
    display_name: 'Webhook User',
    free_tickets: freeTickets,
    total_free_tickets: freeTickets,
  });
  db.setDocument('competition', 'c1', {
    title: 'Webhook Competition',
    status: 'active',
    draw_date: { toDate: () => FUTURE_DRAW },
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: 100,
    sold_tickets: 0,
    last_ticket_sequence: 0,
    participants: [],
  });
  db.setDocument('skill_attempts', 'u1_c1', { passed: true });

  const referrals = referralTypes.map((rewardType, index) => {
    const id = `r${index + 1}`;
    db.setDocument('referrals', id, {
      referrer_id: userRef,
      reward_type: rewardType,
      reward_value: 1,
      reward_issued: false,
      created_at: new Date(),
    });
    return { id };
  });

  return { userRef, competitionRef, referrals };
}

function setPendingOrder(db, { userRef, competitionRef }, overrides = {}, omit = []) {
  const order = {
    status: 'pending',
    user_ref: userRef,
    competition_id: competitionRef,
    total_amount: 50,
    stripe_checkout_session_id: 'cs_1',
    ticket_quantity: 5,
    free_tickets_to_use: 1,
    referrals_to_burn: [{ id: 'r1' }],
    ...overrides,
  };
  for (const field of omit) {
    delete order[field];
  }
  db.setDocument('order', 'o1', order);
}

function checkoutEvent(sessionOverrides = {}) {
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
        ...sessionOverrides,
      },
    },
  };
}

function makeHandler(db, { event = checkoutEvent(), constructEvent } = {}) {
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
      webhooks: {
        constructEvent: constructEvent || (() => event),
      },
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

async function invoke(handler, req = makeRequest()) {
  const res = makeResponse();
  await handler(req, res);
  return res;
}

function assertNoFulfillment(db, { orderBefore, userBefore, referralBefore }) {
  const orderAfter = db.snapshot('order', 'o1').data();
  assert.equal(orderAfter.status, orderBefore.status);
  assert.equal(orderAfter.stripe_checkout_session_id, orderBefore.stripe_checkout_session_id);
  assert.equal(orderAfter.payment_status, 'paid');
  assert.equal(orderAfter.fulfillment_status, 'failed');
  assert.equal(orderAfter.stripe_status, 'paid');
  assert.equal(orderAfter.stripe_payment_intent_id, 'pi_1');
  assert.equal(typeof orderAfter.fulfillment_error, 'string');
  assert.equal(orderAfter.fulfillment_attempts, 1);
  assert.deepEqual(db.snapshot('user', 'u1').data(), userBefore);
  assert.deepEqual(db.snapshot('referrals', 'r1').data(), referralBefore);
  assert.equal(db.collectionStore('ticket').size, 0);
  assert.equal(db.collectionStore('free_ticket_log').size, 0);
}

describe('Stripe webhook persisted input validation', () => {
  it('rejects missing persisted checkout fields without defaults', async () => {
    const cases = [
      { label: 'ticket_quantity', omit: ['ticket_quantity'] },
      { label: 'free_tickets_to_use', omit: ['free_tickets_to_use'] },
      { label: 'referrals_to_burn', omit: ['referrals_to_burn'] },
    ];

    for (const testCase of cases) {
      const db = new MemoryDB();
      const refs = seed(db);
      setPendingOrder(db, refs, {}, testCase.omit);
      const orderBefore = db.snapshot('order', 'o1').data();
      const userBefore = db.snapshot('user', 'u1').data();
      const referralBefore = db.snapshot('referrals', 'r1').data();

      const res = await invoke(makeHandler(db));

      assert.equal(res.statusCode, 400, testCase.label);
      assert.match(res.body, /Checkout validation failed/);
      assertNoFulfillment(db, { orderBefore, userBefore, referralBefore });
      assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
    }
  });

  it('rejects null, malformed, duplicate, oversized, and mismatched persisted inputs', async () => {
    const cases = [
      {
        label: 'null free tickets',
        setup: (db, refs) => {
          setPendingOrder(db, refs, { free_tickets_to_use: null });
        },
      },
      {
        label: 'null referrals',
        setup: (db, refs) => {
          setPendingOrder(db, refs, { referrals_to_burn: null });
        },
      },
      {
        label: 'string free tickets',
        setup: (db, refs) => {
          setPendingOrder(db, refs, { free_tickets_to_use: '1' });
        },
      },
      {
        label: 'malformed referral id',
        setup: (db, refs) => {
          setPendingOrder(db, refs, { referrals_to_burn: [{ id: '' }] });
        },
      },
      {
        label: 'duplicate referral ids',
        setup: (db, refs) => {
          setPendingOrder(db, refs, {
            free_tickets_to_use: 2,
            referrals_to_burn: [{ id: 'r1' }, { id: 'r1' }],
          });
        },
      },
      {
        label: 'oversized referral count',
        setup: (db, refs) => {
          setPendingOrder(db, refs, {
            free_tickets_to_use: 101,
            referrals_to_burn: Array.from({ length: 101 }, (_, index) => ({
              id: `oversized-${index}`,
            })),
          });
        },
        freeTickets: 101,
      },
      {
        label: 'mismatched free/referral counts',
        setup: (db, refs) => {
          setPendingOrder(db, refs, {
            free_tickets_to_use: 2,
            referrals_to_burn: [{ id: 'r1' }],
          });
        },
      },
    ];

    for (const testCase of cases) {
      const db = new MemoryDB();
      const refs = seed(db, { freeTickets: testCase.freeTickets ?? 1 });
      testCase.setup(db, refs);
      const orderBefore = db.snapshot('order', 'o1').data();
      const userBefore = db.snapshot('user', 'u1').data();
      const referralBefore = db.snapshot('referrals', 'r1').data();

      const res = await invoke(makeHandler(db));

      assert.equal(res.statusCode, 400, testCase.label);
      assertNoFulfillment(db, { orderBefore, userBefore, referralBefore });
      assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
    }
  });

  it('fulfills valid persisted inputs exactly once', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    setPendingOrder(db, refs);
    const handler = makeHandler(db);

    const first = await invoke(handler);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(db.snapshot('order', 'o1').data().status, 'paid');
    assert.equal(db.snapshot('order', 'o1').data().stripe_status, 'paid');
    assert.equal(db.snapshot('order', 'o1').data().stripe_payment_intent_id, 'pi_1');
    assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, true);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 0);
    assert.equal(db.collectionStore('ticket').size, 6);

    const second = await invoke(handler);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body, 'Order already processed.');
    assert.equal(db.collectionStore('ticket').size, 6);
    assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, true);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 0);
  });

  it('rejects an insufficient persisted balance without fulfillment writes', async () => {
    const db = new MemoryDB();
    const refs = seed(db, { freeTickets: 0 });
    setPendingOrder(db, refs);
    const orderBefore = db.snapshot('order', 'o1').data();
    const userBefore = db.snapshot('user', 'u1').data();
    const referralBefore = db.snapshot('referrals', 'r1').data();

    const res = await invoke(makeHandler(db));

    assert.equal(res.statusCode, 500);
    assert.match(res.body, /Checkout validation failed/);
    assertNoFulfillment(db, { orderBefore, userBefore, referralBefore });
    assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
  });

  it('rejects invalid signatures before reading or mutating order data', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    setPendingOrder(db, refs);
    const orderBefore = db.snapshot('order', 'o1').data();
    const handler = makeHandler(db, {
      constructEvent: () => {
        throw new Error('invalid signature');
      },
    });

    const res = await invoke(handler);

    assert.equal(res.statusCode, 400);
    assert.match(res.body, /Webhook Error: invalid signature/);
    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
    assert.equal(db.collectionStore('ticket').size, 0);
  });
});
