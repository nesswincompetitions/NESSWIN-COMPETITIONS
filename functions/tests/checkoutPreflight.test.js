import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createStripeCheckoutSessionHandler } from '../controllers/orderController.js';

const NOW = 1_800_000_000_000;
const FUTURE_DRAW = NOW + (2 * 60 * 60 * 1000);
const LONG_DRAW = NOW + (48 * 60 * 60 * 1000);
const TOO_SOON_DRAW = NOW + (30 * 60 * 1000);
const PAST_DRAW = NOW - (60 * 1000);

function seed(db, {
  competition = {},
  user = {},
  skillAttempt = { passed: true },
  referrals = [{ id: 'r1' }],
} = {}) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', 'u1', {
    display_name: 'Checkout User',
    free_tickets: 2,
    total_free_tickets: 2,
    total_tickets_bought: 0,
    total_spent: 0,
    ...user,
  });

  db.setDocument('competition', 'c1', {
    title: 'Checkout Competition',
    status: 'active',
    draw_date: new Date(FUTURE_DRAW),
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: 100,
    sold_tickets: 0,
    last_ticket_sequence: 0,
    participants: [],
    ...competition,
  });

  db.setDocument('skill_attempts', 'u1_c1', skillAttempt);

  referrals.forEach(({ id, ...overrides }) => {
    db.setDocument('referrals', id, {
      referrer_id: userRef,
      reward_type: 'referral',
      reward_value: 1,
      reward_issued: false,
      created_at: new Date(NOW),
      ...overrides,
    });
  });

  return { userRef, competitionRef };
}

function makeHandler(db, { sessions = [], now = () => NOW } = {}) {
  const stripeFactory = () => ({
    checkout: {
      sessions: {
        create: async (args) => {
          sessions.push(args);
          return { id: 'cs_test_1', url: 'https://stripe.test/cs_test_1' };
        },
      },
    },
  });

  return createStripeCheckoutSessionHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAuthenticated: (request) => {
      if (!request.auth?.uid) {
        throw new MockHttpsError('unauthenticated', 'You must be logged in.');
      }
      return request.auth.uid;
    },
    HttpsError: MockHttpsError,
    stripeFactory,
    getStripeSecretKey: () => 'sk_test',
    schedulePendingTask: async () => {},
    now,
  });
}

function request(overrides = {}) {
  return {
    auth: { uid: 'u1' },
    data: {
      competitionId: 'c1',
      ticketQuantity: 1,
      questionAnswer: {},
      freeTicketsToUse: 0,
      referralsToBurn: [],
      origin: 'https://app.test',
      success_path: '/profile/tickets',
      ...overrides,
    },
  };
}

async function expectRejection(db, sessions, requestData, code) {
  await assert.rejects(
    makeHandler(db, { sessions })(requestData),
    (error) => error.code === code
  );
  assert.equal(sessions.length, 0);
  assert.equal(db.collectionStore('order').size, 0);
}

describe('createStripeCheckoutSession preflight', () => {
  it('preserves a valid paid checkout and uses server pricing', async () => {
    const db = new MemoryDB();
    seed(db);
    const sessions = [];
    const result = await makeHandler(db, { sessions })(request());

    assert.equal(result.sessionUrl, 'https://stripe.test/cs_test_1');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].line_items[0].price_data.unit_amount, 1000);
    assert.equal(sessions[0].mode, 'payment');
    assert.equal(sessions[0].expires_at, Math.floor(FUTURE_DRAW / 1000) - 1);

    const orders = Array.from(db.collectionStore('order').entries());
    assert.equal(orders.length, 1);
    const [orderId, order] = orders[0];
    assert.equal(order.status, 'pending');
    assert.equal(order.ticket_quantity, 1);
    assert.equal(order.total_amount, 10);
    assert.equal(order.stripe_checkout_session_id, 'cs_test_1');
    assert.equal(sessions[0].metadata.orderId, orderId);
  });

  it('caps Stripe expiry at 24 hours while keeping it before a distant draw', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: new Date(LONG_DRAW) } });
    const sessions = [];

    await makeHandler(db, { sessions })(request());

    assert.equal(
      sessions[0].expires_at,
      Math.floor(NOW / 1000) + (24 * 60 * 60)
    );
  });

  it('recalculates expiry with a fresh timestamp immediately before session creation', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: new Date(LONG_DRAW) } });
    const sessions = [];
    const times = [NOW, NOW + (10 * 60 * 1000)];
    let timeIndex = 0;

    await makeHandler(db, {
      sessions,
      now: () => times[Math.min(timeIndex++, times.length - 1)],
    })(request());

    assert.equal(
      sessions[0].expires_at,
      Math.floor(times[1] / 1000) + (24 * 60 * 60)
    );
  });

  it('captures checkout time after the final competition read completes', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: new Date(LONG_DRAW) } });
    const sessions = [];
    const originalSnapshot = db.snapshot.bind(db);
    let competitionReads = 0;
    let currentTime = NOW;

    db.snapshot = (collectionName, id) => {
      const snapshot = originalSnapshot(collectionName, id);
      if (collectionName === 'competition' && id === 'c1') {
        competitionReads += 1;
        if (competitionReads === 2) {
          currentTime = NOW + (10 * 60 * 1000);
        }
      }
      return snapshot;
    };

    await makeHandler(db, {
      sessions,
      now: () => currentTime,
    })(request());

    assert.equal(competitionReads, 2);
    assert.equal(
      sessions[0].expires_at,
      Math.floor((NOW + (10 * 60 * 1000)) / 1000) + (24 * 60 * 60)
    );
  });

  it('rejects when the minimum expiry window becomes invalid after preflight', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: new Date(NOW + (32 * 60 * 1000)) } });
    const sessions = [];
    const times = [NOW, NOW + (2 * 60 * 1000)];
    let timeIndex = 0;

    await assert.rejects(
      makeHandler(db, {
        sessions,
        now: () => times[Math.min(timeIndex++, times.length - 1)],
      })(request()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(sessions.length, 0);
  });

  it('rejects when the draw deadline moves too close during the final competition read', async () => {
    const db = new MemoryDB();
    seed(db);
    const sessions = [];
    const originalSnapshot = db.snapshot.bind(db);
    let competitionReads = 0;

    db.snapshot = (collectionName, id) => {
      if (collectionName === 'competition' && id === 'c1') {
        competitionReads += 1;
        if (competitionReads === 2) {
          db.setDocument('competition', 'c1', {
            ...originalSnapshot('competition', 'c1').data(),
            draw_date: new Date(NOW + (30 * 60 * 1000)),
          });
        }
      }
      return originalSnapshot(collectionName, id);
    };

    await assert.rejects(
      makeHandler(db, { sessions, now: () => NOW })(request()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(competitionReads, 2);
    assert.equal(sessions.length, 0);
  });

  it('rejects if the competition enters drawing during the final competition read', async () => {
    const db = new MemoryDB();
    seed(db);
    const sessions = [];
    const originalSnapshot = db.snapshot.bind(db);
    let competitionReads = 0;

    db.snapshot = (collectionName, id) => {
      if (collectionName === 'competition' && id === 'c1') {
        competitionReads += 1;
        if (competitionReads === 2) {
          db.setDocument('competition', 'c1', {
            ...originalSnapshot('competition', 'c1').data(),
            status: 'drawing',
          });
        }
      }
      return originalSnapshot(collectionName, id);
    };

    await assert.rejects(
      makeHandler(db, { sessions, now: () => NOW })(request()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(competitionReads, 2);
    assert.equal(sessions.length, 0);
  });

  it('rejects an insufficient window before the draw', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: new Date(TOO_SOON_DRAW) } });
    const sessions = [];

    await expectRejection(db, sessions, request(), 'failed-precondition');
  });

  it('rejects past, missing, and malformed draw dates for new sessions', async () => {
    for (const drawDate of [new Date(PAST_DRAW), null, 'not-a-date']) {
      const db = new MemoryDB();
      seed(db, { competition: { draw_date: drawDate } });
      const sessions = [];

      await expectRejection(db, sessions, request(), 'failed-precondition');
    }
  });

  it('rejects drawing states and winner references', async () => {
    for (const competition of [
      { status: 'drawing' },
      { status: 'active', draw_started_at: new Date(NOW - 1000) },
      { status: 'active', winner_ref: 'user/winner' },
      { status: 'active', winner_ticket_ref: 'ticket/winner' },
    ]) {
      const db = new MemoryDB();
      seed(db, { competition });
      const sessions = [];

      await expectRejection(db, sessions, request(), 'failed-precondition');
    }
  });

  it('rejects insufficient stock including pack bonus tickets', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { stock_quantity: 10 } });
    const sessions = [];

    await expectRejection(
      db,
      sessions,
      request({ ticketQuantity: 10 }),
      'failed-precondition'
    );
  });

  it('rejects deleting and deleted users', async () => {
    for (const user of [{ status: 'deleting' }, { status: 'deleted' }, { is_deleted: true }]) {
      const db = new MemoryDB();
      seed(db, { user });
      const sessions = [];

      await expectRejection(db, sessions, request(), 'failed-precondition');
    }
  });

  it('rejects a missing or failed skill attempt', async () => {
    const missingDb = new MemoryDB();
    seed(missingDb);
    missingDb.collectionStore('skill_attempts').delete('u1_c1');
    await expectRejection(missingDb, [], request(), 'failed-precondition');

    const failedDb = new MemoryDB();
    seed(failedDb, { skillAttempt: { passed: false } });
    await expectRejection(failedDb, [], request(), 'failed-precondition');
  });

  it('preserves referral/free-ticket validation', async () => {
    const validDb = new MemoryDB();
    seed(validDb);
    const validSessions = [];
    await makeHandler(validDb, { sessions: validSessions })(request({
      freeTicketsToUse: 1,
      referralsToBurn: [{ id: 'r1' }],
    }));
    assert.equal(validSessions.length, 1);

    const usedDb = new MemoryDB();
    seed(usedDb, { referrals: [{ id: 'r1', reward_issued: true }] });
    await expectRejection(usedDb, [], request({
      freeTicketsToUse: 1,
      referralsToBurn: [{ id: 'r1' }],
    }), 'failed-precondition');

    const balanceDb = new MemoryDB();
    seed(balanceDb, { user: { free_tickets: 0 } });
    await expectRejection(balanceDb, [], request({
      freeTicketsToUse: 1,
      referralsToBurn: [{ id: 'r1' }],
    }), 'failed-precondition');
  });

  it('ignores client-supplied amount, price, stock, and eligibility fields', async () => {
    const db = new MemoryDB();
    seed(db);
    const sessions = [];

    await makeHandler(db, { sessions })(request({
      ticketQuantity: 1,
      totalAmount: 0.01,
      ticketPrice: 0.01,
      stock_quantity: 999999,
      is_verified: false,
      userData: { is_deleted: true },
    }));

    assert.equal(sessions[0].line_items[0].price_data.unit_amount, 1000);
    const order = Array.from(db.collectionStore('order').values())[0];
    assert.equal(order.total_amount, 10);
  });

  it('rejects a zero-total Stripe session without creating an order', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { ticket_price: 0 } });
    const sessions = [];

    await expectRejection(db, sessions, request(), 'invalid-argument');
  });

  it('rejects unauthorized callers before any reads or writes', async () => {
    const db = new MemoryDB();
    seed(db);
    const sessions = [];

    await assert.rejects(
      makeHandler(db, { sessions })({ data: request().data }),
      (error) => error.code === 'unauthenticated'
    );
    assert.equal(sessions.length, 0);
    assert.equal(db.collectionStore('order').size, 0);
  });
});
