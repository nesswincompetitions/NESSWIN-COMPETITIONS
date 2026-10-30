import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createDecreaseUserCompetitionTicketsHandler } from '../services/ticketAdjustmentService.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST_DRAW = new Date(Date.now() - 60 * 1000);

function makeHandler(db, assertAdmin = async () => 'admin1') {
  return createDecreaseUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin,
    HttpsError: MockHttpsError,
  });
}

function seed(db, overrides = {}) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', 'u1', {
    free_tickets: 5,
    total_free_tickets: 10,
  });
  db.setDocument('competition', 'c1', {
    title: 'Decrease Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    stock_quantity: 88,
    sold_tickets: 12,
    total_tickets: 100,
    last_ticket_sequence: 12,
    participants: [userRef],
    ...(overrides.competition || {}),
  });
  db.setDocument('referrals', 'r1', {
    referrer_id: userRef,
    reward_type: 'free_ticket',
    reward_issued: true,
    reward_value: 1,
  });
  db.setDocument('free_ticket_log', 'l1', {
    user_id: userRef,
    competition_id: competitionRef,
    quantity: 1,
    reward_type: 'referral',
  });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    total_ticket: 12,
    paid_ticket: 4,
    free_ticket: 2,
    free_used: 4,
    total_amount: 40,
    currency: 'GBP',
    stripe_status: 'paid',
    stripe_payment_intent_id: 'pi_123',
    is_winner: false,
    ...(overrides.order || {}),
  });

  const tickets = [
    [1, 'paid'],
    [2, 'paid'],
    [3, 'paid'],
    [4, 'paid'],
    [5, 'pack_bonus'],
    [6, 'referral_credit'],
    [7, 'referral_use_bonus'],
    [8, 'admin_bonus'],
    [9, 'admin_adjustment'],
    [10, 'zero_payment'],
    [11, 'unverified'],
    [12, undefined],
  ];
  tickets.forEach(([number, allocationType]) => {
    db.setDocument('ticket', `t${number}`, {
      competition_id: competitionRef,
      user_id: userRef,
      order_id: orderRef,
      ticket_number: number,
      ticket_sequence: `DEC${String(number).padStart(3, '0')}`,
      status: 'active',
      is_winner: false,
      ...(allocationType ? { allocation_type: allocationType } : {}),
    });
  });

  return { userRef, competitionRef, orderRef };
}

function request(overrides = {}) {
  return {
    auth: { uid: 'admin1' },
    data: {
      userId: 'u1',
      competitionId: 'c1',
      orderId: 'o1',
      origin: 'paid',
      quantity: 2,
      reason: 'customer correction',
      requestId: 'req-decrease-001',
      ...overrides,
    },
  };
}

function ticketStatuses(db) {
  const result = {};
  db.collectionStore('ticket').forEach((data, id) => {
    result[id] = data.status;
  });
  return result;
}

describe('admin ticket decrease', () => {
  it('decreases the highest-numbered paid tickets and preserves all other records', async () => {
    const db = new MemoryDB();
    seed(db);
    const orderBefore = { ...db.snapshot('order', 'o1').data() };
    const competitionBefore = { ...db.snapshot('competition', 'c1').data() };
    const userBefore = { ...db.snapshot('user', 'u1').data() };
    const referralBefore = { ...db.snapshot('referrals', 'r1').data() };
    const logBefore = { ...db.snapshot('free_ticket_log', 'l1').data() };

    const result = await makeHandler(db)(request());

    assert.equal(result.success, true);
    assert.equal(result.decreasedCount, 2);
    assert.deepEqual(result.ticketIds, ['t3', 't4']);
    assert.deepEqual(result.ticketNumbers, [3, 4]);
    assert.deepEqual(result.ticketSequences, ['DEC003', 'DEC004']);
    assert.deepEqual(result.ticketOrigins, ['paid', 'paid']);
    assert.deepEqual(result.originBreakdown, { paid: 2 });
    assert.equal(result.activeTicketCountBefore, 4);
    assert.equal(result.activeTicketCountAfter, 2);
    assert.equal(result.orderActiveTicketCountBefore, 12);
    assert.equal(result.orderActiveTicketCountAfter, 10);
    assert.equal(result.paymentEffect, 'none');

    for (const id of ['t3', 't4']) {
      const ticket = db.snapshot('ticket', id).data();
      assert.equal(ticket.status, 'invalid');
      assert.equal(ticket.status_before_invalidation, 'active');
      assert.equal(ticket.invalidation_reason, 'customer correction');
      assert.equal(ticket.invalidated_by.path, 'user/admin1');
      assert.equal(ticket.allocation_type, 'paid');
      assert.equal(ticket.ticket_number, id === 't3' ? 3 : 4);
    }

    const statuses = ticketStatuses(db);
    for (const id of ['t1', 't2', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12']) {
      assert.equal(statuses[id], 'active');
    }

    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), competitionBefore);
    assert.deepEqual(db.snapshot('user', 'u1').data(), userBefore);
    assert.deepEqual(db.snapshot('referrals', 'r1').data(), referralBefore);
    assert.deepEqual(db.snapshot('free_ticket_log', 'l1').data(), logBefore);

    const audit = db.snapshot('ticket_adjustments', 'req-decrease-001').data();
    assert.equal(audit.operation, 'ticket_decrease');
    assert.equal(audit.source, 'admin_order_decrease');
    assert.equal(audit.direction, 'decrease');
    assert.equal(audit.requested_origin, 'paid');
    assert.equal(audit.actor_role, 'admin');
    assert.equal(audit.payment_effect, 'none');
    assert.equal(audit.performed_by.path, 'user/admin1');
    assert.deepEqual(audit.ticket_ids, ['t3', 't4']);
    assert.deepEqual(audit.ticket_numbers, [3, 4]);
    assert.deepEqual(audit.ticket_sequences, ['DEC003', 'DEC004']);
    assert.deepEqual(audit.ticket_origins, ['paid', 'paid']);
    assert.deepEqual(audit.origin_breakdown, { paid: 2 });
    assert.equal(audit.ticket_ids.length, audit.ticket_origins.length);
    assert.equal(audit.previous_quantity, 4);
    assert.equal(audit.new_quantity, 2);
    assert.equal(audit.reason, 'customer correction');
    assert.equal(audit.request_id, 'req-decrease-001');
  });

  it('decreases each supported bonus origin independently', async () => {
    const cases = [
      ['pack_bonus', 't5'],
      ['referral_credit', 't6'],
      ['referral_use_bonus', 't7'],
      ['admin_bonus', 't8'],
      ['admin_adjustment', 't9'],
    ];

    for (const [origin, ticketId] of cases) {
      const db = new MemoryDB();
      seed(db);
      const result = await makeHandler(db)(request({
        origin,
        quantity: 1,
        requestId: `req-${origin}`,
      }));

      assert.equal(result.decreasedCount, 1, origin);
      assert.deepEqual(result.ticketIds, [ticketId], origin);
      assert.deepEqual(result.ticketOrigins, [origin], origin);
      assert.equal(db.snapshot('ticket', ticketId).data().status, 'invalid', origin);
      const audit = db.snapshot('ticket_adjustments', `req-${origin}`).data();
      assert.equal(audit.requested_origin, origin);
      assert.deepEqual(audit.ticket_origins, [origin]);
    }
  });

  it('allows an explicit bonus group without merging it with paid tickets', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await makeHandler(db)(request({
      origin: 'bonus',
      quantity: 4,
      requestId: 'req-bonus-group',
    }));

    assert.deepEqual(result.ticketIds, ['t5', 't6', 't7', 't8']);
    assert.deepEqual(result.ticketOrigins, [
      'pack_bonus',
      'referral_credit',
      'referral_use_bonus',
      'admin_bonus',
    ]);
    assert.deepEqual(result.originBreakdown, {
      pack_bonus: 1,
      referral_credit: 1,
      referral_use_bonus: 1,
      admin_bonus: 1,
    });
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.snapshot('ticket', 't9').data().status, 'active');
  });

  it('selects only active non-winner tickets in the requested origin', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('ticket', 't3', {
      ...db.snapshot('ticket', 't3').data(),
      is_winner: true,
    });
    db.setDocument('ticket', 't4', {
      ...db.snapshot('ticket', 't4').data(),
      status: 'invalid',
    });

    const result = await makeHandler(db)(request({
      origin: 'paid',
      quantity: 2,
      requestId: 'req-active-winner-filter',
    }));

    assert.deepEqual(result.ticketIds, ['t1', 't2']);
    assert.equal(db.snapshot('ticket', 't3').data().is_winner, true);
    assert.equal(db.snapshot('ticket', 't3').data().status, 'active');
    assert.equal(db.snapshot('ticket', 't4').data().status, 'invalid');
  });

  it('rejects unsupported, unknown, zero-payment, and unverified origins', async () => {
    for (const origin of ['zero_payment', 'unverified', 'legacy_unknown', 'other', '', undefined]) {
      const db = new MemoryDB();
      seed(db);
      await assert.rejects(
        makeHandler(db)(request({ origin, requestId: `req-invalid-${String(origin)}` })),
        (error) => error.code === 'invalid-argument'
      );
      assert.equal(db.collectionStore('ticket_adjustments').size, 0);
      assert.equal(ticketStatuses(db).t1, 'active');
    }
  });

  it('rejects a decrease larger than the eligible active quantity without writes', async () => {
    const db = new MemoryDB();
    seed(db);
    const before = ticketStatuses(db);

    await assert.rejects(
      makeHandler(db)(request({ origin: 'paid', quantity: 5, requestId: 'req-too-many' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(ticketStatuses(db), before);
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
  });

  it('rejects unauthorized callers without writes', async () => {
    const db = new MemoryDB();
    seed(db);
    const before = ticketStatuses(db);

    await assert.rejects(
      makeHandler(db, async () => {
        throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
      })(request()),
      (error) => error.code === 'permission-denied'
    );

    assert.deepEqual(ticketStatuses(db), before);
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
  });

  it('rejects draw-frozen, past-draw, winner-reference, and winning-order adjustments', async () => {
    const cases = [
      { competition: { status: 'drawing' } },
      { competition: { status: 'winner_announced' } },
      { competition: { draw_date: PAST_DRAW } },
      { competition: { winner_ref: 'user/winner' } },
      { order: { is_winner: true } },
    ];

    for (const overrides of cases) {
      const db = new MemoryDB();
      seed(db, overrides);
      const before = ticketStatuses(db);

      await assert.rejects(
        makeHandler(db)(request({ requestId: `req-frozen-${Object.keys(overrides)[0]}` })),
        (error) => error.code === 'failed-precondition'
      );

      assert.deepEqual(ticketStatuses(db), before);
      assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    }
  });

  it('is idempotent for the same request ID and does not invalidate more tickets', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const first = await handler(request({ requestId: 'req-replay' }));
    const second = await handler(request({ requestId: 'req-replay' }));

    assert.equal(first.decreasedCount, 2);
    assert.equal(second.decreasedCount, 2);
    assert.equal(second.idempotentReplay, true);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(ticketStatuses(db).t3, 'invalid');
    assert.equal(ticketStatuses(db).t4, 'invalid');
    assert.equal(ticketStatuses(db).t2, 'active');
  });

  it('serializes concurrent duplicate requests without over-invalidating', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const results = await Promise.all([
      handler(request({ requestId: 'req-concurrent-same' })),
      handler(request({ requestId: 'req-concurrent-same' })),
    ]);

    assert.equal(results.filter((result) => result.idempotentReplay === true).length, 1);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(ticketStatuses(db).t3, 'invalid');
    assert.equal(ticketStatuses(db).t4, 'invalid');
    assert.equal(ticketStatuses(db).t2, 'active');
  });

  it('serializes concurrent different requests without exceeding eligible tickets', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const results = await Promise.allSettled([
      handler(request({ quantity: 3, requestId: 'req-concurrent-a' })),
      handler(request({ quantity: 3, requestId: 'req-concurrent-b' })),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(
      Object.values(ticketStatuses(db)).filter((status) => status === 'invalid').length,
      3
    );
  });

  it('rejects an order-linked ticket belonging to a different user', async () => {
    const db = new MemoryDB();
    seed(db);
    const t1 = { ...db.snapshot('ticket', 't1').data() };
    t1.user_id = db.collection('user').doc('u2');
    db.setDocument('ticket', 't1', t1);
    const before = ticketStatuses(db);

    await assert.rejects(
      makeHandler(db)(request({ origin: 'paid', quantity: 1, requestId: 'req-wrong-user' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(ticketStatuses(db), before);
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
  });

  it('rejects an order-linked ticket belonging to a different competition', async () => {
    const db = new MemoryDB();
    seed(db);
    const t1 = { ...db.snapshot('ticket', 't1').data() };
    t1.competition_id = db.collection('competition').doc('c2');
    db.setDocument('ticket', 't1', t1);
    const before = ticketStatuses(db);

    await assert.rejects(
      makeHandler(db)(request({ origin: 'paid', quantity: 1, requestId: 'req-wrong-competition' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(ticketStatuses(db), before);
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
  });

  it('fails closed for missing or malformed user and competition references', async () => {
    const cases = [
      ['missing-user', (ticket) => delete ticket.user_id],
      ['malformed-user', (ticket) => { ticket.user_id = { malformed: true }; }],
      ['missing-competition', (ticket) => delete ticket.competition_id],
      ['malformed-competition', (ticket) => { ticket.competition_id = { malformed: true }; }],
    ];

    for (const [name, mutate] of cases) {
      const db = new MemoryDB();
      seed(db);
      const t1 = { ...db.snapshot('ticket', 't1').data() };
      mutate(t1);
      db.setDocument('ticket', 't1', t1);
      const before = ticketStatuses(db);

      await assert.rejects(
        makeHandler(db)(request({ origin: 'paid', quantity: 1, requestId: `req-${name}` })),
        (error) => error.code === 'failed-precondition',
        name
      );

      assert.deepEqual(ticketStatuses(db), before, name);
      assert.equal(db.collectionStore('ticket_adjustments').size, 0, name);
    }
  });

  it('rejects the entire adjustment when mixed valid and invalid order tickets exist', async () => {
    const db = new MemoryDB();
    seed(db);
    const t7 = { ...db.snapshot('ticket', 't7').data() };
    t7.user_id = db.collection('user').doc('u2');
    t7.competition_id = db.collection('competition').doc('c2');
    db.setDocument('ticket', 't7', t7);
    const before = ticketStatuses(db);

    await assert.rejects(
      makeHandler(db)(request({ origin: 'paid', quantity: 1, requestId: 'req-mixed-invalid' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(ticketStatuses(db), before);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
  });
});
