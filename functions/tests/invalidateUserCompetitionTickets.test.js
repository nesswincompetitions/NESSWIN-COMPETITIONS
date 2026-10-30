import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  INVALIDATION_MAX_TICKETS,
  createInvalidateUserCompetitionTicketsHandler,
} from '../services/ticketInvalidationService.js';

function makeHandler(db, { adminUid = 'admin1', assertAdmin } = {}) {
  return createInvalidateUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: assertAdmin || (async () => adminUid),
    HttpsError: MockHttpsError,
  });
}

function seedBase(db) {
  const userRef = db.collection('user').doc('u1');
  const adminRef = db.collection('user').doc('admin1');
  const otherUserRef = db.collection('user').doc('u2');
  const competitionRef = db.collection('competition').doc('c1');
  const otherCompetitionRef = db.collection('competition').doc('c2');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', 'u1', {
    role: 'user',
    free_tickets: 1,
    total_free_tickets: 2,
    total_tickets_bought: 4,
    total_spent: 40,
  });
  db.setDocument('user', 'admin1', { role: 'admin' });
  db.setDocument('user', 'u2', { role: 'user' });
  db.setDocument('competition', 'c1', {
    title: 'Competition One',
    status: 'active',
    draw_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
    sold_tickets: 4,
    stock_quantity: 96,
    last_ticket_sequence: 4,
    participants: [userRef, otherUserRef],
  });
  db.setDocument('competition', 'c2', {
    title: 'Competition Two',
    status: 'active',
    draw_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
    sold_tickets: 1,
    stock_quantity: 99,
    last_ticket_sequence: 1,
    participants: [userRef],
  });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    stripe_status: 'paid',
    stripe_payment_intent_id: 'pi_123',
    total_ticket: 4,
    paid_ticket: 4,
    total_amount: 40,
    paid_at: 'paid-at',
  });
  db.setDocument('referrals', 'r1', {
    referrer_id: userRef,
    reward_type: 'admin_bonus',
    reward_issued: true,
    reward_revoked: false,
  });
  db.setDocument('free_ticket_log', 'l1', {
    user_id: userRef,
    competition_id: competitionRef,
    order_id: orderRef,
    quantity: 1,
    reason: 'ticket_bonus',
    reward_type: 'pack_bonus',
  });

  return {
    userRef,
    adminRef,
    otherUserRef,
    competitionRef,
    otherCompetitionRef,
    orderRef,
  };
}

function addTicket(db, id, data) {
  db.setDocument('ticket', id, data);
}

describe('invalidateUserCompetitionTickets', () => {
  it('invalidates active tickets and preserves cancelled, invalid, order, competition, and user records', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);
    const secondOrderRef = db.collection('order').doc('o2');
    db.setDocument('order', 'o2', {
      user_ref: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'paid',
      stripe_status: 'paid',
      total_ticket: 1,
      paid_ticket: 1,
      total_amount: 10,
    });

    addTicket(db, 't1', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      order_id: refs.orderRef,
      ticket_sequence: 'C1O001',
      ticket_number: 1,
      status: 'active',
      is_winner: false,
    });
    addTicket(db, 't2', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      order_id: secondOrderRef,
      ticket_sequence: 'C1O002',
      ticket_number: 2,
      status: 'active',
      is_winner: false,
    });
    addTicket(db, 't3', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      order_id: refs.orderRef,
      ticket_sequence: 'C1O003',
      ticket_number: 3,
      status: 'cancelled',
      is_winner: false,
    });
    addTicket(db, 't4', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      order_id: refs.orderRef,
      ticket_sequence: 'C1O004',
      ticket_number: 4,
      status: 'invalid',
      is_winner: false,
      invalidated_at: 'original-invalidated-at',
      invalidated_by: refs.adminRef,
      invalidation_reason: 'original reason',
      status_before_invalidation: 'active',
    });
    addTicket(db, 't5', {
      user_id: refs.userRef,
      competition_id: refs.otherCompetitionRef,
      ticket_sequence: 'C2O001',
      ticket_number: 1,
      status: 'active',
      is_winner: false,
    });
    addTicket(db, 't6', {
      user_id: refs.otherUserRef,
      competition_id: refs.competitionRef,
      ticket_sequence: 'C1O005',
      ticket_number: 5,
      status: 'active',
      is_winner: false,
    });

    const handler = makeHandler(db);
    const result = await handler({
      auth: { uid: 'admin1' },
      data: { userId: 'u1', competitionId: 'c1', reason: '  fraud review  ' },
    });

    assert.equal(result.success, true);
    assert.equal(result.complete, true);
    assert.equal(result.invalidatedCount, 2);
    assert.equal(result.alreadyInvalidCount, 1);
    assert.equal(result.cancelledCount, 1);
    assert.equal(result.skippedCount, 0);
    assert.equal(result.totalRelevantCount, 4);
    assert.deepEqual(result.ticketIds.sort(), ['t1', 't2']);

    const t1 = db.snapshot('ticket', 't1').data();
    assert.equal(t1.status, 'invalid');
    assert.equal(t1.invalidation_reason, 'fraud review');
    assert.equal(t1.status_before_invalidation, 'active');
    assert.equal(t1.invalidated_by.path, 'user/admin1');
    assert.equal(t1.invalidated_at.__mockServerTimestamp, true);

    const t2 = db.snapshot('ticket', 't2').data();
    assert.equal(t2.status, 'invalid');

    const t3 = db.snapshot('ticket', 't3').data();
    assert.equal(t3.status, 'cancelled');
    assert.equal(t3.invalidation_reason, undefined);

    const t4 = db.snapshot('ticket', 't4').data();
    assert.equal(t4.status, 'invalid');
    assert.equal(t4.invalidation_reason, 'original reason');
    assert.equal(t4.invalidated_at, 'original-invalidated-at');

    assert.equal(db.snapshot('ticket', 't5').data().status, 'active');
    assert.equal(db.snapshot('ticket', 't6').data().status, 'active');

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.sold_tickets, 4);
    assert.equal(competition.stock_quantity, 96);
    assert.equal(competition.last_ticket_sequence, 4);
    assert.equal(competition.participants.length, 2);

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.stripe_status, 'paid');
    assert.equal(order.stripe_payment_intent_id, 'pi_123');
    assert.equal(order.total_ticket, 4);
    assert.equal(order.total_amount, 40);

    const secondOrder = db.snapshot('order', 'o2').data();
    assert.equal(secondOrder.status, 'paid');
    assert.equal(secondOrder.total_ticket, 1);
    assert.equal(secondOrder.total_amount, 10);

    const user = db.snapshot('user', 'u1').data();
    assert.equal(user.free_tickets, 1);
    assert.equal(user.total_free_tickets, 2);
    assert.equal(user.total_tickets_bought, 4);
    assert.equal(user.total_spent, 40);

    const referral = db.snapshot('referrals', 'r1').data();
    assert.equal(referral.reward_issued, true);
    assert.equal(referral.reward_revoked, false);

    const log = db.snapshot('free_ticket_log', 'l1').data();
    assert.equal(log.quantity, 1);
    assert.equal(log.reason, 'ticket_bonus');
    assert.equal(log.reward_type, 'pack_bonus');
  });

  it('rejects unauthorized callers without writes', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);
    addTicket(db, 't1', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'active',
    });

    const handler = makeHandler(db, {
      assertAdmin: async () => {
        throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
      },
    });

    await assert.rejects(
      handler({ data: { userId: 'u1', competitionId: 'c1', reason: 'x' } }),
      (error) => error.code === 'permission-denied'
    );
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
  });

  it('validates required identifiers and reason', async () => {
    const db = new MemoryDB();
    seedBase(db);
    const handler = makeHandler(db);

    await assert.rejects(
      handler({ data: { competitionId: 'c1', reason: 'x' } }),
      (error) => error.code === 'invalid-argument'
    );
    await assert.rejects(
      handler({ data: { userId: 'u1', reason: 'x' } }),
      (error) => error.code === 'invalid-argument'
    );
    await assert.rejects(
      handler({ data: { userId: 'u1', competitionId: 'c1', reason: '   ' } }),
      (error) => error.code === 'invalid-argument'
    );
  });

  it('rejects missing user or competition', async () => {
    const db = new MemoryDB();
    seedBase(db);
    const handler = makeHandler(db);

    await assert.rejects(
      handler({ data: { userId: 'missing', competitionId: 'c1', reason: 'x' } }),
      (error) => error.code === 'not-found'
    );
    await assert.rejects(
      handler({ data: { userId: 'u1', competitionId: 'missing', reason: 'x' } }),
      (error) => error.code === 'not-found'
    );
  });

  it('supports legacy user and competition reference/string formats', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);

    addTicket(db, 't1', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'active',
    });
    addTicket(db, 't2', {
      user_id: 'u1',
      competition_id: 'c1',
      status: 'active',
    });
    addTicket(db, 't3', {
      user_ref: refs.userRef,
      competition_id: 'competition/c1',
      status: 'active',
    });
    addTicket(db, 't4', {
      user: refs.userRef,
      competition_id: '/competition/c1',
      status: 'active',
    });
    addTicket(db, 't5', {
      user_id: '/user/u1',
      competition_id: refs.competitionRef,
      status: 'active',
    });

    const result = await makeHandler(db)({
      data: { userId: 'u1', competitionId: 'c1', reason: 'legacy cleanup' },
    });

    assert.equal(result.invalidatedCount, 5);
    assert.deepEqual(result.ticketIds.sort(), ['t1', 't2', 't3', 't4', 't5']);
  });

  it('is idempotent and never overwrites original invalidation metadata', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);
    addTicket(db, 't1', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'active',
    });

    const handler = makeHandler(db);
    await handler({ data: { userId: 'u1', competitionId: 'c1', reason: 'first reason' } });
    const first = db.snapshot('ticket', 't1').data();

    const secondResult = await handler({
      data: { userId: 'u1', competitionId: 'c1', reason: 'second reason' },
    });
    const second = db.snapshot('ticket', 't1').data();

    assert.equal(secondResult.invalidatedCount, 0);
    assert.equal(secondResult.alreadyInvalidCount, 1);
    assert.equal(second.status, 'invalid');
    assert.equal(second.invalidation_reason, 'first reason');
    assert.equal(second.status_before_invalidation, 'active');
    assert.equal(second.invalidated_at, first.invalidated_at);
    assert.equal(second.invalidated_by.path, first.invalidated_by.path);
  });

  it('rejects protected competition finality states and winner references without writes', async () => {
    for (const status of ['drawing', 'winner_announced', 'completed', 'end', 'closed']) {
      const db = new MemoryDB();
      const refs = seedBase(db);
      db.setDocument('competition', 'c1', {
        status,
        sold_tickets: 4,
        stock_quantity: 96,
        last_ticket_sequence: 4,
        participants: [refs.userRef],
      });
    addTicket(db, 't1', {
      user_id: refs.userRef,
      user_ref: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'active',
    });

      await assert.rejects(
        makeHandler(db)({ data: { userId: 'u1', competitionId: 'c1', reason: 'x' } }),
        (error) => error.code === 'failed-precondition'
      );
      assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    }

    const db = new MemoryDB();
    const refs = seedBase(db);
    db.setDocument('competition', 'c1', {
      status: 'active',
      winner_ref: refs.userRef,
      winner_ticket_ref: db.collection('ticket').doc('t1'),
    });
    addTicket(db, 't1', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'active',
    });

    await assert.rejects(
      makeHandler(db)({ data: { userId: 'u1', competitionId: 'c1', reason: 'x' } }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
  });

  it('rejects winner tickets even when the competition has not reached finality', async () => {
    for (const winnerData of [
      { status: 'winner', is_winner: false },
      { status: 'active', is_winner: true },
    ]) {
      const db = new MemoryDB();
      const refs = seedBase(db);
      addTicket(db, 't1', {
        user_id: refs.userRef,
        competition_id: refs.competitionRef,
        ...winnerData,
      });
      addTicket(db, 't2', {
        user_id: refs.userRef,
        competition_id: refs.competitionRef,
        status: 'active',
        is_winner: false,
      });

      await assert.rejects(
        makeHandler(db)({ data: { userId: 'u1', competitionId: 'c1', reason: 'x' } }),
        (error) => error.code === 'failed-precondition'
      );
      assert.equal(db.snapshot('ticket', 't1').data().status, winnerData.status);
      assert.equal(db.snapshot('ticket', 't2').data().status, 'active');
    }
  });

  it('rejects safely when the competition becomes final after preflight', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);
    addTicket(db, 't1', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'active',
    });

    db.beforeTransaction = async () => {
      db.setDocument('competition', 'c1', {
        title: 'Competition One',
        status: 'winner_announced',
        winner_ref: refs.userRef,
        winner_ticket_ref: db.collection('ticket').doc('t1'),
        sold_tickets: 4,
        stock_quantity: 96,
        last_ticket_sequence: 4,
        participants: [refs.userRef],
      });
    };

    await assert.rejects(
      makeHandler(db)({ data: { userId: 'u1', competitionId: 'c1', reason: 'x' } }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
  });

  it('retries and aborts when draw start commits after the competition read', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);
    addTicket(db, 't1', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      status: 'active',
    });

    let drawStartInjected = false;
    db.afterTransactionRead = async (ref) => {
      if (!drawStartInjected && ref.path === 'competition/c1') {
        drawStartInjected = true;
        db.setDocument('competition', 'c1', {
          title: 'Competition One',
          status: 'drawing',
          draw_started_at: 'draw-started-at',
          sold_tickets: 4,
          stock_quantity: 96,
          last_ticket_sequence: 4,
          participants: [refs.userRef],
        });
      }
    };

    await assert.rejects(
      makeHandler(db)({ data: { userId: 'u1', competitionId: 'c1', reason: 'x' } }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(drawStartInjected, true);
    assert.equal(db.snapshot('competition', 'c1').data().status, 'drawing');
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
  });

  it('invalidates missing and empty legacy statuses in the all-active path', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);

    addTicket(db, 'legacyMissing', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      ticket_number: 1,
      ticket_sequence: 'C1O001',
      is_winner: false,
    });
    addTicket(db, 'legacyEmpty', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      ticket_number: 2,
      ticket_sequence: 'C1O002',
      status: '',
      is_winner: false,
    });

    const result = await makeHandler(db)({
      data: { userId: 'u1', competitionId: 'c1', reason: 'legacy cleanup' },
    });

    assert.equal(result.invalidatedCount, 2);
    assert.equal(db.snapshot('ticket', 'legacyMissing').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 'legacyEmpty').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 'legacyMissing').data().status_before_invalidation, 'active');
    assert.equal(db.snapshot('ticket', 'legacyEmpty').data().status_before_invalidation, 'active');

    const audits = Array.from(db.collectionStore('ticket_adjustments').entries());
    assert.equal(audits.length, 1);
    const audit = audits[0][1];
    assert.equal(audit.source, 'admin_all_active_tickets');
    assert.equal(audit.actor_role, 'admin');
    assert.equal(audit.request_id, null);
    assert.deepEqual(audit.ticket_origins, ['legacy_unknown', 'legacy_unknown']);
    assert.equal(audit.ticket_origins.length, audit.ticket_ids.length);
    assert.deepEqual(audit.origin_breakdown, { legacy_unknown: 2 });

    const replay = await makeHandler(db)({
      data: { userId: 'u1', competitionId: 'c1', reason: 'legacy cleanup again' },
    });
    assert.equal(replay.invalidatedCount, 0);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
  });

  it('rejects over-limit requests without partial writes', async () => {
    const db = new MemoryDB();
    const refs = seedBase(db);

    for (let index = 0; index <= INVALIDATION_MAX_TICKETS; index++) {
      addTicket(db, `t${index}`, {
        user_id: refs.userRef,
        competition_id: refs.competitionRef,
        status: 'active',
        ticket_number: index + 1,
      });
    }

    await assert.rejects(
      makeHandler(db)({ data: { userId: 'u1', competitionId: 'c1', reason: 'x' } }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 't0').data().status, 'active');
    assert.equal(
      db.snapshot('ticket', `t${INVALIDATION_MAX_TICKETS}`).data().status,
      'active'
    );
  });
});
