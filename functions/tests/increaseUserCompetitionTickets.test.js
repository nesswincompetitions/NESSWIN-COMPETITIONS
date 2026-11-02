import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createIncreaseUserCompetitionTicketsHandler } from '../services/ticketAdjustmentService.js';
import { isTicketBlockedFromWinnerSelection } from '../services/ticketEligibility.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST_DRAW = new Date(Date.now() - 60 * 1000);

function makeHandler(db) {
  return createIncreaseUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: async () => 'admin1',
    HttpsError: MockHttpsError,
  });
}

function seed(db, overrides = {}) {
  const userRef = db.collection('user').doc('u1');
  const adminRef = db.collection('user').doc('admin1');
  const competitionRef = db.collection('competition').doc('c1');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', 'u1', {
    free_tickets: 2,
    total_free_tickets: 5,
    total_tickets_bought: 4,
    total_spent: 40,
  });
  db.setDocument('user', 'admin1', { role: 'admin' });
  db.setDocument('competition', 'c1', {
    title: 'Test Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    stock_quantity: 96,
    sold_tickets: 4,
    total_tickets: 100,
    last_ticket_sequence: 4,
    participants: [userRef],
    ...(overrides.competition || {}),
  });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    stripe_status: 'paid',
    stripe_payment_intent_id: 'pi_123',
    total_ticket: 4,
    paid_ticket: 4,
    free_ticket: 0,
    free_used: 0,
    subtotal: 40,
    discount_amount: 0,
    total_amount: 40,
    currency: 'GBP',
    paid_at: 'paid-at',
    ...(overrides.order || {}),
  });

  for (let i = 1; i <= 4; i++) {
    db.setDocument('ticket', `t${i}`, {
      competition_id: competitionRef,
      user_id: userRef,
      order_id: orderRef,
      ticket_number: i,
      ticket_sequence: `TC00${i}`,
      status: 'active',
      is_winner: false,
    });
  }

  return { userRef, adminRef, competitionRef, orderRef };
}

function request(overrides = {}) {
  return {
    auth: { uid: 'admin1' },
    data: {
      userId: 'u1',
      competitionId: 'c1',
      orderId: 'o1',
      quantity: 2,
      reason: 'goodwill allocation',
      requestId: 'req-increase-001',
      ...overrides,
    },
  };
}

describe('admin ticket increase', () => {
  it('adds new sequential tickets to an existing paid order without changing payment fields', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    const beforeOrder = { ...db.snapshot('order', 'o1').data() };

    const result = await makeHandler(db)(request());

    assert.equal(result.success, true);
    assert.equal(result.addedCount, 2);
    assert.equal(result.activeTicketCountBefore, 4);
    assert.equal(result.activeTicketCountAfter, 6);
    assert.equal(result.paymentEffect, 'none');

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.stock_quantity, 94);
    assert.equal(competition.sold_tickets, 6);
    assert.equal(competition.last_ticket_sequence, 6);
    assert.equal(competition.status, 'active');
    assert.equal(competition.participants.length, 1);

    const afterOrder = db.snapshot('order', 'o1').data();
    assert.deepEqual(afterOrder, beforeOrder);

    const addedTickets = result.ticketIds.map((id) => db.snapshot('ticket', id).data());
    assert.deepEqual(addedTickets.map((ticket) => ticket.ticket_number), [5, 6]);
    assert.deepEqual(addedTickets.map((ticket) => ticket.ticket_sequence), ['TC005', 'TC006']);
    addedTickets.forEach((ticket) => {
      assert.equal(ticket.status, 'active');
      assert.equal(ticket.order_id.path, refs.orderRef.path);
      assert.equal(ticket.competition_id.path, refs.competitionRef.path);
      assert.equal(ticket.allocation_type, 'admin_adjustment');
      assert.equal(ticket.granted_by.path, 'user/admin1');
      assert.equal(ticket.adjustment_ref.path, `ticket_adjustments/req-increase-001`);
      assert.equal(isTicketBlockedFromWinnerSelection(ticket.status), false);
    });

    const user = db.snapshot('user', 'u1').data();
    assert.equal(user.free_tickets, 2);
    assert.equal(user.total_free_tickets, 5);
    assert.equal(user.total_tickets_bought, 4);
    assert.equal(user.total_spent, 40);

    assert.equal(db.collections.has('referrals'), false);
    assert.equal(db.collections.has('free_ticket_log'), false);

    const audit = db.snapshot('ticket_adjustments', 'req-increase-001').data();
    assert.equal(audit.operation, 'ticket_increase');
    assert.equal(audit.direction, 'increase');
    assert.equal(audit.quantity, 2);
    assert.equal(audit.quantity_scope, 'order_active_tickets');
    assert.equal(audit.previous_quantity, 4);
    assert.equal(audit.new_quantity, 6);
    assert.equal(audit.active_count_scope, 'order');
    assert.equal(audit.active_count_before, 4);
    assert.equal(audit.active_count_after, 6);
    assert.deepEqual(audit.ticket_numbers, [5, 6]);
    assert.equal(audit.inventory_before.stock_quantity, 96);
    assert.equal(audit.inventory_before.total_tickets, 100);
    assert.equal(audit.inventory_before.capacity_remaining, 96);
    assert.equal(audit.inventory_after.stock_quantity, 94);
    assert.equal(audit.inventory_after.total_tickets, 100);
    assert.equal(audit.inventory_after.capacity_remaining, 94);
    assert.equal(audit.payment_effect, 'none');
    assert.equal(audit.order_snapshot.total_ticket, 4);
    assert.equal(audit.order_snapshot.paid_ticket, 4);
    assert.equal(audit.performed_by.path, 'user/admin1');
    assert.equal(audit.actor_role, 'admin');
    assert.equal(audit.payment_effect, 'none');
    assert.deepEqual(audit.ticket_origins, ['admin_adjustment', 'admin_adjustment']);
    assert.equal(audit.ticket_origins.length, audit.ticket_ids.length);
    assert.deepEqual(audit.origin_breakdown, { admin_adjustment: 2 });
    assert.deepEqual(audit.ticket_ids.sort(), result.ticketIds.sort());
  });

  it('marks the competition sold out when the increase consumes the remaining stock', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { stock_quantity: 2, sold_tickets: 4, total_tickets: 6, last_ticket_sequence: 4 } });

    const result = await makeHandler(db)(request());

    assert.equal(result.addedCount, 2);
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 0);
    assert.equal(db.snapshot('competition', 'c1').data().status, 'sold_out');
  });

  it('rejects unpaid, refunded, mismatched, and missing orders without writes', async () => {
    for (const order of [
      { status: 'pending' },
      { status: 'Refunded' },
      { user_ref: 'user/u2' },
      { competition_id: 'competition/c2' },
      { is_winner: true },
    ]) {
      const db = new MemoryDB();
      seed(db, { order });
      const before = db.snapshot('competition', 'c1').data().stock_quantity;
      await assert.rejects(
        makeHandler(db)(request({ requestId: `req-order-${String(order.status || order.user_ref || order.competition_id).replace(/[^a-z0-9]/gi, '')}` })),
        (error) => error.code === 'failed-precondition'
      );
      assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, before);
      assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    }

    const missingDb = new MemoryDB();
    seed(missingDb);
    await assert.rejects(
      makeHandler(missingDb)(request({ orderId: 'missing-order', requestId: 'req-missing-order' })),
      (error) => error.code === 'not-found'
    );
  });

  it('rejects invalid quantities, insufficient stock, and malformed counters', async () => {
    for (const quantity of [0, -1, 1.5, '2x', 401]) {
      const db = new MemoryDB();
      seed(db);
      await assert.rejects(
        makeHandler(db)(request({ quantity, requestId: `req-qty-${String(quantity).replace(/[^a-z0-9]/gi, '')}` })),
        (error) => error.code === 'invalid-argument'
      );
    }

    for (const competition of [
      { stock_quantity: 1, sold_tickets: 4, total_tickets: 5, last_ticket_sequence: 4 },
      { stock_quantity: '96' },
      { sold_tickets: '4' },
      { last_ticket_sequence: '4' },
      { last_ticket_sequence: -1 },
      { stock_quantity: undefined },
      { sold_tickets: undefined },
      { last_ticket_sequence: undefined },
      { total_tickets: '100' },
      { total_tickets: 0 },
      { total_tickets: 100.5 },
    ]) {
      const db = new MemoryDB();
      seed(db, { competition });
      await assert.rejects(
        makeHandler(db)(request({ requestId: `req-inventory-${Object.keys(competition)[0]}${String(competition[Object.keys(competition)[0]]).replace(/[^a-z0-9]/gi, '')}` })),
        (error) => error.code === 'failed-precondition'
      );
      assert.equal((db.collections.get('ticket_adjustments')?.size || 0), 0);
    }
  });

  it('rejects stale ticket sequences without changing existing tickets', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 95,
        sold_tickets: 5,
        total_tickets: 100,
        last_ticket_sequence: 5,
      },
    });
    db.setDocument('ticket', 'existing10', {
      competition_id: db.collection('competition').doc('c1'),
      user_id: db.collection('user').doc('u1'),
      order_id: db.collection('order').doc('o1'),
      ticket_number: 10,
      ticket_sequence: 'TC010',
      status: 'active',
      is_winner: false,
    });

    await assert.rejects(
      makeHandler(db)(request({ requestId: 'req-stale-sequence' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 95);
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 5);
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 5);
    assert.equal(db.snapshot('ticket', 'existing10').data().status, 'active');
    assert.equal((db.collections.get('ticket_adjustments')?.size || 0), 0);
  });

  it('detects stale sequences stored with legacy string competition references', async () => {
    for (const [index, competitionId] of ['c1', 'competition/c1', '/competition/c1'].entries()) {
      const db = new MemoryDB();
      seed(db);
      db.setDocument('ticket', 'legacy10', {
        competition_id: competitionId,
        user_id: db.collection('user').doc('u1'),
        order_id: db.collection('order').doc('o1'),
        ticket_number: 10,
        ticket_sequence: 'TC010',
        status: 'active',
        is_winner: false,
      });

      await assert.rejects(
        makeHandler(db)(request({ requestId: `req-legacy-sequence-${index}` })),
        (error) => error.code === 'failed-precondition'
      );
      assert.equal(db.snapshot('ticket', 'legacy10').data().status, 'active');
    }
  });

  it('rejects duplicate highest ticket numbers', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 95,
        sold_tickets: 5,
        total_tickets: 100,
        last_ticket_sequence: 5,
      },
    });
    for (const [id, competitionId] of [['dup-ref', db.collection('competition').doc('c1')], ['dup-string', 'c1']]) {
      db.setDocument('ticket', id, {
        competition_id: competitionId,
        user_id: db.collection('user').doc('u1'),
        order_id: db.collection('order').doc('o1'),
        ticket_number: 5,
        ticket_sequence: 'TC005',
        status: 'active',
        is_winner: false,
      });
    }

    await assert.rejects(
      makeHandler(db)(request({ requestId: 'req-duplicate-max' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 'dup-ref').data().status, 'active');
    assert.equal(db.snapshot('ticket', 'dup-string').data().status, 'active');
  });

  it('rejects a trailing sequence gap where counters exceed the highest ticket', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 95,
        sold_tickets: 5,
        total_tickets: 100,
        last_ticket_sequence: 5,
      },
    });

    await assert.rejects(
      makeHandler(db)(request({ requestId: 'req-sequence-gap' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 5);
  });

  it('rejects malformed existing ticket numbers', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 95,
        sold_tickets: 5,
        total_tickets: 100,
        last_ticket_sequence: 5,
      },
    });
    db.setDocument('ticket', 'bad-number', {
      competition_id: db.collection('competition').doc('c1'),
      user_id: db.collection('user').doc('u1'),
      order_id: db.collection('order').doc('o1'),
      ticket_number: 4.5,
      ticket_sequence: 'TC0045',
      status: 'active',
      is_winner: false,
    });

    await assert.rejects(
      makeHandler(db)(request({ requestId: 'req-malformed-sequence' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 'bad-number').data().status, 'active');
  });

  it('allows an increase that exactly reaches configured capacity', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 2,
        sold_tickets: 98,
        total_tickets: 100,
        last_ticket_sequence: 98,
      },
    });
    for (let i = 5; i <= 98; i++) {
      db.setDocument('ticket', `t${i}`, {
        competition_id: db.collection('competition').doc('c1'),
        user_id: db.collection('user').doc('u1'),
        order_id: db.collection('order').doc('o1'),
        ticket_number: i,
        ticket_sequence: `TC${String(i).padStart(3, '0')}`,
        status: 'active',
        is_winner: false,
      });
    }

    const result = await makeHandler(db)(request());
    const competition = db.snapshot('competition', 'c1').data();

    assert.equal(result.addedCount, 2);
    assert.equal(competition.stock_quantity, 0);
    assert.equal(competition.sold_tickets, 100);
    assert.equal(competition.last_ticket_sequence, 100);
    assert.equal(competition.status, 'sold_out');
  });

  it('rejects an increase that exceeds configured capacity by one', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 1,
        sold_tickets: 99,
        total_tickets: 100,
        last_ticket_sequence: 99,
      },
    });
    for (let i = 5; i <= 99; i++) {
      db.setDocument('ticket', `t${i}`, {
        competition_id: db.collection('competition').doc('c1'),
        user_id: db.collection('user').doc('u1'),
        order_id: db.collection('order').doc('o1'),
        ticket_number: i,
        ticket_sequence: `TC${String(i).padStart(3, '0')}`,
        status: 'active',
        is_winner: false,
      });
    }

    await assert.rejects(
      makeHandler(db)(request()),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 99);
    assert.equal((db.collections.get('ticket_adjustments')?.size || 0), 0);
  });

  it('uses conservative remaining capacity when admin edits leave stock drifted', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 6,
        sold_tickets: 4,
        total_tickets: 6,
        last_ticket_sequence: 4,
      },
    });

    const result = await makeHandler(db)(request({ requestId: 'req-drift-capacity' }));
    const competition = db.snapshot('competition', 'c1').data();

    assert.equal(result.addedCount, 2);
    assert.equal(competition.stock_quantity, 4);
    assert.equal(competition.sold_tickets, 6);
    assert.equal(competition.total_tickets, 6);
    assert.equal(competition.status, 'sold_out');

    await assert.rejects(
      makeHandler(db)(request({ quantity: 1, requestId: 'req-drift-capacity-exceeded' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 6);
  });

  it('rejects sold capacity exhaustion even when stock is overstated', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 10,
        sold_tickets: 100,
        total_tickets: 100,
        last_ticket_sequence: 100,
      },
    });

    await assert.rejects(
      makeHandler(db)(request({ quantity: 1, requestId: 'req-sold-at-capacity' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 100);
  });

  it('rejects stock that exceeds configured capacity', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 150,
        sold_tickets: 0,
        total_tickets: 100,
        last_ticket_sequence: 0,
      },
    });

    await assert.rejects(
      makeHandler(db)(request({ requestId: 'req-stock-over-capacity' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 150);
  });

  it('rejects protected draw states, winner references, missing and past draw dates', async () => {
    for (const status of ['draft', 'ready_to_draw', 'drawing', 'winner_announced', 'completed', 'end', 'closed', 'sold_out', 'paused', 'cancelled', 'deleted']) {
      const db = new MemoryDB();
      seed(db, { competition: { status } });
      await assert.rejects(
        makeHandler(db)(request({ requestId: `req-status-${status}` })),
        (error) => error.code === 'failed-precondition'
      );
    }

    const winnerRefDb = new MemoryDB();
    seed(winnerRefDb, { competition: { winner_ref: 'user/u2' } });
    await assert.rejects(
      makeHandler(winnerRefDb)(request({ requestId: 'req-winner-reference' })),
      (error) => error.code === 'failed-precondition'
    );

    const pastDb = new MemoryDB();
    seed(pastDb, { competition: { draw_date: PAST_DRAW } });
    await assert.rejects(
      makeHandler(pastDb)(request({ requestId: 'req-past-draw-date' })),
      (error) => error.code === 'failed-precondition'
    );

    const missingDrawDb = new MemoryDB();
    seed(missingDrawDb, { competition: { draw_date: null } });
    await assert.rejects(
      makeHandler(missingDrawDb)(request({ requestId: 'req-missing-draw-date' })),
      (error) => error.code === 'failed-precondition'
    );

    const malformedDrawDb = new MemoryDB();
    seed(malformedDrawDb, { competition: { draw_date: 'not-a-date' } });
    await assert.rejects(
      makeHandler(malformedDrawDb)(request({ requestId: 'req-malformed-draw-date' })),
      (error) => error.code === 'failed-precondition'
    );
  });

  it('idempotently replays a request without allocating duplicate tickets', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const first = await handler(request());
    const second = await handler(request());

    assert.equal(second.idempotentReplay, true);
    assert.deepEqual(second.ticketIds.sort(), first.ticketIds.sort());
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 94);
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 6);
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 6);
    assert.equal((db.collections.get('ticket_adjustments')?.size || 0), 1);
  });

  it('replays a completed request after the competition enters a blocked state', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const first = await handler(request());
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      status: 'drawing',
    });

    const replay = await handler(request());

    assert.equal(replay.idempotentReplay, true);
    assert.deepEqual(replay.ticketIds.sort(), first.ticketIds.sort());
    assert.equal(db.snapshot('competition', 'c1').data().status, 'drawing');
    assert.equal((db.collections.get('ticket_adjustments')?.size || 0), 1);
  });

  it('rejects request ID reuse with a different reason', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await handler(request());
    await assert.rejects(
      handler(request({ reason: 'different reason' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 94);
  });

  it('rejects request ID reuse for a different quantity or order', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await handler(request());
    await assert.rejects(
      handler(request({ quantity: 3 })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 94);
  });

  it('serializes concurrent increases without duplicate ticket numbers', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const [first, second] = await Promise.all([
      handler(request({ requestId: 'req-concurrent-a' })),
      handler(request({ requestId: 'req-concurrent-b' })),
    ]);

    assert.equal(first.addedCount, 2);
    assert.equal(second.addedCount, 2);
    assert.equal(new Set([...first.ticketNumbers, ...second.ticketNumbers]).size, 4);
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 92);
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 8);
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 8);
  });


  it('serializes concurrent requests competing for the final capacity', async () => {
    const db = new MemoryDB();
    seed(db, {
      competition: {
        stock_quantity: 2,
        sold_tickets: 98,
        total_tickets: 100,
        last_ticket_sequence: 98,
      },
    });
    for (let i = 5; i <= 98; i++) {
      db.setDocument('ticket', `t${i}`, {
        competition_id: db.collection('competition').doc('c1'),
        user_id: db.collection('user').doc('u1'),
        order_id: db.collection('order').doc('o1'),
        ticket_number: i,
        ticket_sequence: `TC${String(i).padStart(3, '0')}`,
        status: 'active',
        is_winner: false,
      });
    }

    const handler = makeHandler(db);
    const results = await Promise.allSettled([
      handler(request({ requestId: 'req-final-capacity-a' })),
      handler(request({ requestId: 'req-final-capacity-b' })),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 0);
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 100);
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 100);
    assert.equal(db.snapshot('competition', 'c1').data().status, 'sold_out');
  });

  it('serializes the same request ID without allocating twice', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const results = await Promise.all([
      handler(request({ requestId: 'req-same-concurrent' })),
      handler(request({ requestId: 'req-same-concurrent' })),
    ]);

    assert.equal(results[0].addedCount, 2);
    assert.equal(results[1].addedCount, 2);
    assert.equal(results.some((result) => result.idempotentReplay === true), true);
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 94);
    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 6);
  });

  it('detects a draw transition that commits after the preflight read', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.beforeTransaction = async () => {
      db.setDocument('competition', 'c1', {
        title: 'Test Competition',
        status: 'drawing',
        draw_date: FUTURE_DRAW,
        stock_quantity: 96,
        sold_tickets: 4,
        total_tickets: 100,
        last_ticket_sequence: 4,
        participants: [refs.userRef],
      });
    };

    await assert.rejects(
      makeHandler(db)(request({ requestId: 'req-draw-race' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().stock_quantity, 96);
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 4);
  });

  it('requires reason, request ID, and valid identifiers', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    for (const overrides of [
      { reason: '   ' },
      { requestId: undefined },
      { requestId: 'short' },
      { userId: undefined },
      { competitionId: undefined },
      { orderId: undefined },
    ]) {
      await assert.rejects(
        handler(request(overrides)),
        (error) => error.code === 'invalid-argument'
      );
    }
  });
});

describe('admin ticket increase with competition restriction', () => {
  function restrict(db, refs) {
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      restricted_participants: [refs.userRef],
    });
  }

  it('rejects a paid-ticket increase for a restricted participant', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    restrict(db, refs);
    const beforeCompetition = { ...db.snapshot('competition', 'c1').data() };

    await assert.rejects(
      makeHandler(db)(request({ origin: 'paid', requestId: 'req-restricted-paid' })),
      (error) =>
        error.code === 'failed-precondition' &&
        /blocked from this competition/.test(error.message)
    );

    assert.equal(db.collectionStore('ticket').size, 4);
    assert.equal(db.snapshot('ticket_adjustments', 'req-restricted-paid').exists, false);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), beforeCompetition);
  });

  it('rejects a bonus-ticket increase for a restricted participant', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    restrict(db, refs);

    await assert.rejects(
      makeHandler(db)(request({ origin: 'bonus', requestId: 'req-restricted-bonus' })),
      (error) =>
        error.code === 'failed-precondition' &&
        /blocked from this competition/.test(error.message)
    );

    assert.equal(db.collectionStore('ticket').size, 4);
    assert.equal(db.snapshot('ticket_adjustments', 'req-restricted-bonus').exists, false);
  });

  it('does not block increases in another competition', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    restrict(db, refs);

    const competitionRef = db.collection('competition').doc('c2');
    db.setDocument('competition', 'c2', {
      title: 'Other Competition',
      status: 'active',
      draw_date: FUTURE_DRAW,
      stock_quantity: 100,
      sold_tickets: 0,
      total_tickets: 100,
      last_ticket_sequence: 0,
      participants: [refs.userRef],
    });
    db.setDocument('order', 'o2', {
      user_ref: refs.userRef,
      competition_id: competitionRef,
      status: 'paid',
      total_ticket: 0,
      paid_ticket: 0,
      free_ticket: 0,
      free_used: 0,
      total_amount: 0,
      currency: 'GBP',
    });

    const result = await makeHandler(db)(
      request({
        competitionId: 'c2',
        orderId: 'o2',
        origin: 'paid',
        requestId: 'req-other-competition',
      })
    );

    assert.equal(result.success, true);
    assert.equal(result.addedCount, 2);
    assert.equal(db.snapshot('competition', 'c2').data().last_ticket_sequence, 2);
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 4);
  });

  it('cannot commit an increase after the restriction wins', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.beforeTransaction = async () => {
      db.setDocument('competition', 'c1', {
        ...db.snapshot('competition', 'c1').data(),
        restricted_participants: [refs.userRef],
      });
    };

    await assert.rejects(
      makeHandler(db)(request({ origin: 'paid', requestId: 'req-race-increase' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore('ticket').size, 4);
    assert.equal(db.snapshot('ticket_adjustments', 'req-race-increase').exists, false);
    assert.equal(db.snapshot('competition', 'c1').data().last_ticket_sequence, 4);
  });
});
