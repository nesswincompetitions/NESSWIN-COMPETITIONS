import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  createRecoverOrderFulfillmentHandler,
  markOrderExpiredForRestriction,
  reconcilePendingOrdersForParticipantRestriction,
} from '../services/orderTransactionService.js';
import {
  createInvalidateUserCompetitionTicketsHandler,
  PARTICIPANT_REMOVAL_MODES,
} from '../services/ticketInvalidationService.js';

const NOW = 1_800_000_000_000;
const FUTURE_DRAW = new Date(NOW + 48 * 60 * 60 * 1000);
const ADMIN_UID = 'admin1';
const USER_UID = 'u1';
const COMPETITION_ID = 'c1';
const ORDER_ID = 'o1';

function makeAssertAdmin(db) {
  return async (request) => {
    if (!request.auth?.uid) {
      throw new MockHttpsError('unauthenticated', 'You must be logged in.');
    }
    const snap = db.snapshot('user', request.auth.uid);
    if (!snap.exists || snap.data().role !== 'admin') {
      throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
    }
    return request.auth.uid;
  };
}

function seed(db, overrides = {}) {
  const userRef = db.collection('user').doc(USER_UID);
  const adminRef = db.collection('user').doc(ADMIN_UID);
  const competitionRef = db.collection('competition').doc(COMPETITION_ID);

  db.setDocument('user', USER_UID, {
    display_name: 'Participant',
    is_active: true,
    free_tickets: 0,
    total_tickets_bought: 0,
    total_spent: 0,
  });
  db.setDocument('user', ADMIN_UID, { role: 'admin' });
  db.setDocument('competition', COMPETITION_ID, {
    title: 'Order Recovery Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    ticket_price: 10,
    total_tickets: 20,
    stock_quantity: 20,
    sold_tickets: 0,
    last_ticket_sequence: 0,
    participants: [userRef],
    ...(overrides.competition || {}),
  });
  db.setDocument('skill_attempts', `${USER_UID}_${COMPETITION_ID}`, {
    passed: true,
  });

  return { userRef, adminRef, competitionRef };
}

function seedOrder(db, refs, overrides = {}) {
  db.setDocument('order', ORDER_ID, {
    user_ref: refs.userRef,
    competition_id: refs.competitionRef,
    status: 'pending',
    ticket_quantity: 1,
    free_tickets_to_use: 0,
    referrals_to_burn: [],
    question_answer: {},
    total_amount: 10,
    currency: 'GBP',
    stripe_checkout_session_id: 'cs_order_1',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });
  return ORDER_ID;
}

function paidSession(overrides = {}) {
  return {
    id: 'cs_order_1',
    status: 'complete',
    payment_status: 'paid',
    payment_intent: 'pi_order_1',
    amount_total: 1000,
    currency: 'gbp',
    mode: 'payment',
    metadata: { orderId: ORDER_ID },
    ...overrides,
  };
}

function makeStripe({ sessions = {}, retrieveImpl, expireImpl } = {}) {
  const calls = { retrieve: [], expire: [], create: [] };
  const factory = () => ({
    checkout: {
      sessions: {
        create: async () => {
          calls.create.push(true);
          throw new Error('Stripe session creation is not expected in reconciliation tests.');
        },
        retrieve: async (id) => {
          calls.retrieve.push(id);
          if (retrieveImpl) return retrieveImpl(id);
          return sessions[id];
        },
        expire: async (id) => {
          calls.expire.push(id);
          if (expireImpl) return expireImpl(id);
          return { id, status: 'expired', payment_status: 'unpaid' };
        },
      },
    },
  });
  return { factory, calls };
}

function makeRecoveryHandler(db, stripe) {
  return createRecoverOrderFulfillmentHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
    stripeFactory: stripe.factory,
    getStripeSecretKey: () => 'sk_test',
  });
}

function recoveryRequest() {
  return { auth: { uid: ADMIN_UID }, data: { orderId: ORDER_ID } };
}

async function reconcile(db, stripe) {
  return reconcilePendingOrdersForParticipantRestriction({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    userId: USER_UID,
    competitionId: COMPETITION_ID,
    stripeFactory: stripe.factory,
    getStripeSecretKey: () => 'sk_test',
  });
}

describe('normal order restriction reconciliation', () => {
  it('expires an open Stripe session and marks the pending order failed', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    const stripe = makeStripe({
      sessions: {
        cs_order_1: {
          id: 'cs_order_1',
          status: 'open',
          payment_status: 'unpaid',
          amount_total: 1000,
          currency: 'gbp',
          mode: 'payment',
          metadata: { orderId: ORDER_ID },
        },
      },
    });

    const result = await reconcile(db, stripe);

    assert.deepEqual(stripe.calls.expire, ['cs_order_1']);
    assert.equal(result.pending, 1);
    assert.equal(result.outcomes[0].outcome, 'expired:marked_expired');
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'failed');
    assert.equal(order.payment_status, 'unpaid');
    assert.equal(order.stripe_status, 'expired');
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('records a verified paid session as paid-but-unfulfilled without issuing tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });

    const result = await reconcile(db, stripe);

    assert.equal(result.outcomes[0].outcome, 'paid_unfulfilled:marked_failed');
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'failed');
    assert.equal(order.stripe_status, 'paid');
    assert.equal(order.stripe_payment_intent_id, 'pi_order_1');
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('order').size, 1);
  });

  it('marks an already expired session without downgrading a paid order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    const stripe = makeStripe({
      sessions: {
        cs_order_1: {
          id: 'cs_order_1',
          status: 'expired',
          payment_status: 'unpaid',
          amount_total: 1000,
          currency: 'gbp',
          mode: 'payment',
          metadata: { orderId: ORDER_ID },
        },
      },
    });

    await reconcile(db, stripe);

    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'failed');
    assert.equal(order.stripe_status, 'expired');
    assert.equal(stripe.calls.expire.length, 0);
  });

  it('preserves the order and session when Stripe retrieval fails', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    const stripe = makeStripe({
      retrieveImpl: () => {
        throw new Error('stripe unavailable');
      },
    });

    const result = await reconcile(db, stripe);

    assert.equal(result.outcomes[0].outcome, 'retrieval_failed');
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'pending');
    assert.equal(order.stripe_checkout_session_id, 'cs_order_1');
    assert.equal(stripe.calls.expire.length, 0);
  });

  it('preserves a complete-but-unpaid session as unresolved', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    const stripe = makeStripe({
      sessions: {
        cs_order_1: {
          id: 'cs_order_1',
          status: 'complete',
          payment_status: 'unpaid',
          amount_total: 1000,
          currency: 'gbp',
          mode: 'payment',
          metadata: { orderId: ORDER_ID },
        },
      },
    });

    const result = await reconcile(db, stripe);

    assert.equal(result.outcomes[0].outcome, 'unresolved');
    assert.equal(db.snapshot('order', ORDER_ID).data().status, 'pending');
    assert.equal(stripe.calls.expire.length, 0);
  });

  it('handles multiple outstanding orders without touching other orders', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    db.setDocument('order', 'o2', {
      ...db.snapshot('order', ORDER_ID).data(),
      stripe_checkout_session_id: 'cs_order_2',
      created_at: NOW - 1000,
    });
    db.setDocument('order', 'other', {
      ...db.snapshot('order', ORDER_ID).data(),
      user_ref: db.collection('user').doc('u2'),
      stripe_checkout_session_id: 'cs_other',
      status: 'paid',
    });
    const stripe = makeStripe({
      sessions: {
        cs_order_1: paidSession(),
        cs_order_2: {
          id: 'cs_order_2',
          status: 'open',
          payment_status: 'unpaid',
          amount_total: 1000,
          currency: 'gbp',
          mode: 'payment',
          metadata: { orderId: 'o2' },
        },
        cs_other: paidSession({ id: 'cs_other', metadata: { orderId: 'other' } }),
      },
    });

    const result = await reconcile(db, stripe);

    assert.equal(result.pending, 2);
    assert.equal(db.snapshot('order', ORDER_ID).data().payment_status, 'paid');
    assert.equal(db.snapshot('order', 'o2').data().status, 'failed');
    assert.equal(db.snapshot('order', 'other').data().status, 'paid');
  });
});

describe('expired order session identity', () => {
  function expireOrder(db, checkoutSessionId = 'cs_order_1') {
    return markOrderExpiredForRestriction({
      db,
      admin: createMockAdmin(),
      orderId: ORDER_ID,
      checkoutSessionId,
    });
  }

  it('marks the order expired only when the stored session ID exactly matches', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);

    const result = await expireOrder(db);

    assert.equal(result.outcome, 'marked_expired');
    assert.equal(db.snapshot('order', ORDER_ID).data().status, 'failed');
  });

  it('rejects a different stored session ID without changing the order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);

    const result = await expireOrder(db, 'cs_order_other');

    assert.equal(result.outcome, 'session_mismatch');
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'pending');
    assert.equal(order.stripe_checkout_session_id, 'cs_order_1');
  });

  it('rejects a missing stored session ID without changing the order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs, { stripe_checkout_session_id: '' });

    const result = await expireOrder(db, 'cs_order_1');

    assert.equal(result.outcome, 'session_mismatch');
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'pending');
    assert.equal(order.stripe_checkout_session_id, '');
  });

  it('does not downgrade an order that becomes paid before expiration is persisted', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    let changed = false;
    db.afterTransactionRead = (ref) => {
      if (ref.path === `order/${ORDER_ID}` && !changed) {
        changed = true;
        db.setDocument('order', ORDER_ID, {
          ...db.snapshot('order', ORDER_ID).data(),
          status: 'paid',
          payment_status: 'paid',
          fulfillment_status: 'fulfilled',
        });
      }
    };

    const result = await expireOrder(db);

    assert.equal(result.outcome, 'already_paid');
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'paid');
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'fulfilled');
  });

  it('never downgrades an already paid order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs, {
      status: 'paid',
      payment_status: 'paid',
      fulfillment_status: 'fulfilled',
    });

    const result = await expireOrder(db);

    assert.equal(result.outcome, 'already_paid');
    assert.equal(db.snapshot('order', ORDER_ID).data().status, 'paid');
  });
});

describe('participant restriction wiring', () => {
  function makeRemovalHandler(db, stripe) {
    return createInvalidateUserCompetitionTicketsHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      assertAdmin: makeAssertAdmin(db),
      HttpsError: MockHttpsError,
      stripeFactory: stripe.factory,
      getStripeSecretKey: () => 'sk_test',
    });
  }

  function removalRequest() {
    return {
      auth: { uid: ADMIN_UID },
      data: {
        userId: USER_UID,
        competitionId: COMPETITION_ID,
        reason: 'Administrative participant removal',
        requestId: 'req-remove-and-block-order',
        mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
      },
    };
  }

  it('expires an outstanding normal checkout session during remove_and_block', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    const stripe = makeStripe({
      sessions: {
        cs_order_1: {
          id: 'cs_order_1',
          status: 'open',
          payment_status: 'unpaid',
          amount_total: 1000,
          currency: 'gbp',
          mode: 'payment',
          metadata: { orderId: ORDER_ID },
        },
      },
    });

    await makeRemovalHandler(db, stripe)(removalRequest());

    assert.deepEqual(stripe.calls.expire, ['cs_order_1']);
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'failed');
    assert.equal(order.stripe_status, 'expired');
    assert.equal(db.snapshot('competition', COMPETITION_ID).data().restricted_participants.length, 1);
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('records a paid normal checkout as paid-but-unfulfilled during remove_and_block', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs);
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });

    await makeRemovalHandler(db, stripe)(removalRequest());

    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'failed');
    assert.equal(order.stripe_payment_intent_id, 'pi_order_1');
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(stripe.calls.create.length, 0);
  });
});

describe('ordinary order recovery', () => {
  it('re-verifies Stripe and fulfills a paid-but-unfulfilled order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs, {
      payment_status: 'paid',
      fulfillment_status: 'failed',
      stripe_status: 'paid',
      stripe_payment_intent_id: 'pi_order_1',
      fulfillment_error: 'Participant was restricted before fulfillment.',
    });
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });

    const result = await makeRecoveryHandler(db, stripe)(recoveryRequest());

    assert.equal(result.outcome, 'fulfilled');
    assert.equal(result.recovered, true);
    assert.equal(result.ticketCount, 1);
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'paid');
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'fulfilled');
    assert.equal(db.collectionStore('ticket').size, 1);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(stripe.calls.create.length, 0);
  });

  it('returns already fulfilled without creating new tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs, {
      status: 'paid',
      payment_status: 'paid',
      fulfillment_status: 'fulfilled',
      stripe_status: 'paid',
    });
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });

    const result = await makeRecoveryHandler(db, stripe)(recoveryRequest());

    assert.equal(result.outcome, 'already_fulfilled');
    assert.equal(result.recovered, false);
    assert.equal(stripe.calls.retrieve.length, 0);
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('rejects unauthorized callers without contacting Stripe', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs, {
      payment_status: 'paid',
      fulfillment_status: 'failed',
    });
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });

    await assert.rejects(
      makeRecoveryHandler(db, stripe)({
        auth: { uid: USER_UID },
        data: { orderId: ORDER_ID },
      }),
      (error) => error.code === 'permission-denied',
    );

    assert.equal(stripe.calls.retrieve.length, 0);
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('rejects a mismatched Stripe session without issuing tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs, {
      payment_status: 'paid',
      fulfillment_status: 'failed',
    });
    const stripe = makeStripe({
      sessions: { cs_order_1: paidSession({ id: 'cs_other' }) },
    });

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition',
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'failed');
  });

  it('refuses to fulfill a restricted participant and preserves the paid state', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.setDocument('competition', COMPETITION_ID, {
      ...db.snapshot('competition', COMPETITION_ID).data(),
      restricted_participants: [refs.userRef],
    });
    seedOrder(db, refs, {
      payment_status: 'paid',
      fulfillment_status: 'failed',
    });
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition',
    );

    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'failed');
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('preserves paid-but-unfulfilled state when stock is insufficient', async () => {
    const db = new MemoryDB();
    const refs = seed(db, { competition: { stock_quantity: 0 } });
    seedOrder(db, refs, {
      payment_status: 'paid',
      fulfillment_status: 'failed',
    });
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition',
    );

    const order = db.snapshot('order', ORDER_ID).data();
    assert.equal(order.payment_status, 'paid');
    assert.equal(order.fulfillment_status, 'failed');
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('serializes concurrent recovery attempts without duplicate tickets or orders', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedOrder(db, refs, {
      payment_status: 'paid',
      fulfillment_status: 'failed',
    });
    const stripe = makeStripe({ sessions: { cs_order_1: paidSession() } });
    const handler = makeRecoveryHandler(db, stripe);

    const results = await Promise.allSettled([
      handler(recoveryRequest()),
      handler(recoveryRequest()),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(db.collectionStore('ticket').size, 1);
    assert.equal(db.snapshot('order', ORDER_ID).data().fulfillment_status, 'fulfilled');
  });
});
