import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createSoftDeleteUserHandler } from '../services/userDeletionService.js';
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

function seed(db) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', 'u1', {
    display_name: 'Deletion User',
    email: 'deletion@example.com',
    is_active: true,
    free_tickets: 1,
    total_free_tickets: 1,
  });
  db.setDocument('competition', 'c1', {
    title: 'Deletion Competition',
    status: 'active',
    draw_date: {
      toDate: () => FUTURE_DRAW,
      toMillis: () => FUTURE_DRAW.getTime(),
    },
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: 100,
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

function makeDeletionHandler(db, admin = createMockAdmin()) {
  return createSoftDeleteUserHandler({
    db,
    admin,
    HttpsError: MockHttpsError,
  });
}

function makeWebhookHandler(db) {
  const event = checkoutEvent();
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
        constructEvent: () => event,
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

async function invokeWebhook(handler) {
  const res = makeResponse();
  await handler(makeRequest(), res);
  return res;
}

function assertNoFulfillment(db, { orderBefore, userBefore, competitionBefore }) {
  assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
  assert.deepEqual(db.snapshot('user', 'u1').data(), userBefore);
  assert.deepEqual(db.snapshot('competition', 'c1').data(), competitionBefore);
  assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, false);
  assert.equal(db.collectionStore('ticket').size, 0);
  assert.equal(db.collectionStore('free_ticket_log').size, 0);
}

describe('account deletion and checkout fulfillment safety', () => {
  it('rejects webhook fulfillment after deletion has completed', async () => {
    const db = new MemoryDB();
    seed(db);
    const deletionHandler = makeDeletionHandler(db);

    const deletion = await deletionHandler({ auth: { uid: 'u1' } });
    assert.equal(deletion.success, true);
    assert.equal(db.snapshot('user', 'u1').data().status, 'deleted');
    assert.equal(db.snapshot('user', 'u1').data().is_active, false);

    const orderBefore = db.snapshot('order', 'o1').data();
    const userBefore = db.snapshot('user', 'u1').data();
    const competitionBefore = db.snapshot('competition', 'c1').data();
    const res = await invokeWebhook(makeWebhookHandler(db));

    assert.equal(res.statusCode, 400);
    assert.match(res.body, /Account not eligible/);
    assertNoFulfillment(db, { orderBefore, userBefore, competitionBefore });
    assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
  });

  it('rejects webhook fulfillment while deletion is retryable after an Auth failure', async () => {
    const db = new MemoryDB();
    seed(db);
    const admin = createMockAdmin();
    admin.auth = () => ({
      deleteUser: async () => {
        throw new Error('temporary auth outage');
      },
    });
    const deletionHandler = makeDeletionHandler(db, admin);

    await assert.rejects(
      deletionHandler({ auth: { uid: 'u1' } }),
      (error) => error.code === 'internal'
    );
    assert.equal(db.snapshot('user', 'u1').data().status, 'deleting');
    assert.equal(db.snapshot('user', 'u1').data().is_active, true);

    const orderBefore = db.snapshot('order', 'o1').data();
    const userBefore = db.snapshot('user', 'u1').data();
    const competitionBefore = db.snapshot('competition', 'c1').data();
    const res = await invokeWebhook(makeWebhookHandler(db));

    assert.equal(res.statusCode, 400);
    assert.match(res.body, /Account not eligible/);
    assertNoFulfillment(db, { orderBefore, userBefore, competitionBefore });
  });

  it('serializes deletion marking against a concurrent webhook transaction', async () => {
    const db = new MemoryDB();
    seed(db);
    let deletionMarked = false;
    db.afterTransactionRead = async (ref) => {
      if (ref.path === 'user/u1' && !deletionMarked) {
        deletionMarked = true;
        db.setDocument('user', 'u1', {
          ...db.snapshot('user', 'u1').data(),
          status: 'deleting',
        });
      }
    };

    const orderBefore = db.snapshot('order', 'o1').data();
    const competitionBefore = db.snapshot('competition', 'c1').data();
    const res = await invokeWebhook(makeWebhookHandler(db));

    assert.equal(deletionMarked, true);
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /Account not eligible/);
    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), competitionBefore);
    assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, false);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('free_ticket_log').size, 0);
  });

  it('keeps duplicate webhook delivery idempotent after deletion invalidates fulfilled tickets', async () => {
    const db = new MemoryDB();
    seed(db);
    const webhookHandler = makeWebhookHandler(db);

    const first = await invokeWebhook(webhookHandler);
    assert.equal(first.statusCode, 200);
    assert.equal(db.snapshot('order', 'o1').data().status, 'paid');
    assert.equal(db.collectionStore('ticket').size, 6);

    const deletionHandler = makeDeletionHandler(db);
    const deletion = await deletionHandler({ auth: { uid: 'u1' } });
    assert.equal(deletion.success, true);
    assert.equal(
      Array.from(db.collectionStore('ticket').values()).every(
        (ticket) => ticket.status === 'invalid'
      ),
      true
    );

    const duplicate = await invokeWebhook(webhookHandler);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.body, 'Order already processed.');
    assert.equal(db.collectionStore('ticket').size, 6);
    assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, true);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 0);
    assert.equal(db.snapshot('user', 'u1').data().status, 'deleted');
  });
});
