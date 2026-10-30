import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createProcessOrderHandler } from '../controllers/orderController.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);

function seed(db) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', 'u1', {
    display_name: 'Test User',
    free_tickets: 1,
    total_free_tickets: 1,
    total_tickets_bought: 0,
    total_spent: 0,
  });
  db.setDocument('competition', 'c1', {
    title: 'Payment Safety Competition',
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
    total_amount: 0,
  });

  return { userRef, competitionRef };
}

function makeHandler(db, admin = createMockAdmin()) {
  return createProcessOrderHandler({
    db,
    admin,
    logger: createMockLogger(),
    assertAuthenticated: (request) => {
      if (!request.auth?.uid) {
        throw new MockHttpsError('unauthenticated', 'You must be logged in.');
      }
      return request.auth.uid;
    },
    HttpsError: MockHttpsError,
  });
}

describe('processOrder payment safety', () => {
  it('rejects an authenticated positive-total direct order before any mutation', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);
    const beforeOrder = { ...db.snapshot('order', 'o1').data() };
    const beforeUser = { ...db.snapshot('user', 'u1').data() };
    const beforeCompetition = { ...db.snapshot('competition', 'c1').data() };
    const beforeReferral = { ...db.snapshot('referrals', 'r1').data() };

    await assert.rejects(
      handler({
        auth: { uid: 'u1' },
        data: {
          competitionId: 'c1',
          ticketQuantity: 5,
          questionAnswer: {},
          freeTicketsToUse: 1,
          referralsToBurn: [{ id: 'r1' }],
        },
      }),
      (error) =>
        error instanceof MockHttpsError &&
        error.code === 'failed-precondition' &&
        /Stripe Checkout/.test(error.message)
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('free_ticket_log').size, 0);
    assert.equal(db.collections.has('ff_user_push_notifications'), false);
    assert.deepEqual(db.snapshot('order', 'o1').data(), beforeOrder);
    assert.deepEqual(db.snapshot('user', 'u1').data(), beforeUser);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), beforeCompetition);
    assert.deepEqual(db.snapshot('referrals', 'r1').data(), beforeReferral);
    assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
  });

  it('cannot bypass the restriction by passing a positive pending Stripe order ID', async () => {
    const db = new MemoryDB();
    const { userRef, competitionRef } = seed(db);
    db.setDocument('order', 'o1', {
      status: 'pending',
      user_ref: userRef,
      competition_id: competitionRef,
      total_amount: 50,
      stripe_checkout_session_id: 'cs_1',
    });
    const handler = makeHandler(db);
    const beforeOrder = { ...db.snapshot('order', 'o1').data() };
    const beforeUser = { ...db.snapshot('user', 'u1').data() };
    const beforeReferral = { ...db.snapshot('referrals', 'r1').data() };

    await assert.rejects(
      handler({
        auth: { uid: 'u1' },
        data: {
          competitionId: 'c1',
          ticketQuantity: 0,
          questionAnswer: {},
          freeTicketsToUse: 1,
          referralsToBurn: [{ id: 'r1' }],
          orderId: 'o1',
        },
      }),
      (error) =>
        error instanceof MockHttpsError &&
        error.code === 'failed-precondition' &&
        /Stripe Checkout/.test(error.message)
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('free_ticket_log').size, 0);
    assert.equal(db.collections.has('ff_user_push_notifications'), false);
    assert.deepEqual(db.snapshot('order', 'o1').data(), beforeOrder);
    assert.deepEqual(db.snapshot('user', 'u1').data(), beforeUser);
    assert.deepEqual(db.snapshot('referrals', 'r1').data(), beforeReferral);
  });
});
