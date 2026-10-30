import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createInvalidateUserCompetitionTicketsHandler } from '../services/ticketInvalidationService.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST_DRAW = new Date(Date.now() - 60 * 1000);

function makeHandler(db) {
  return createInvalidateUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: async () => 'admin1',
    HttpsError: MockHttpsError,
  });
}

function seed(db, competition = {}) {
  const userRef = db.collection('user').doc('u1');
  const otherUserRef = db.collection('user').doc('u2');
  const adminRef = db.collection('user').doc('admin1');
  const competitionRef = db.collection('competition').doc('c1');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', 'u1', { free_tickets: 2, total_free_tickets: 5, total_tickets_bought: 4, total_spent: 40 });
  db.setDocument('user', 'u2', { free_tickets: 0 });
  db.setDocument('user', 'admin1', { role: 'admin' });
  db.setDocument('competition', 'c1', {
    title: 'Ticket Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    stock_quantity: 96,
    sold_tickets: 4,
    total_tickets: 100,
    last_ticket_sequence: 4,
    participants: [userRef, otherUserRef],
    ...competition,
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

  const tickets = [
    { id: 't1', user: userRef, order: orderRef, status: 'active', number: 1 },
    { id: 't2', user: userRef, order: orderRef, status: 'active', number: 2 },
    { id: 't3', user: userRef, order: orderRef, status: 'active', number: 3 },
    { id: 't4', user: otherUserRef, order: orderRef, status: 'active', number: 4 },
    { id: 't5', user: userRef, order: orderRef, status: 'invalid', number: 5 },
    { id: 't6', user: userRef, order: orderRef, status: 'cancelled', number: 6 },
    { id: 't7', user: userRef, order: orderRef, status: 'winner', number: 7, isWinner: true },
  ];

  tickets.forEach((ticket) => {
    db.setDocument('ticket', ticket.id, {
      user_id: ticket.user,
      competition_id: competitionRef,
      order_id: ticket.order,
      ticket_number: ticket.number,
      ticket_sequence: `TC00${ticket.number}`,
      status: ticket.status,
      is_winner: Boolean(ticket.isWinner),
    });
  });

  return { userRef, otherUserRef, adminRef, competitionRef, orderRef };
}

function request(overrides = {}) {
  return {
    auth: { uid: 'admin1' },
    data: {
      userId: 'u1',
      competitionId: 'c1',
      reason: 'verified adjustment',
      ticketIds: ['t1', 't2'],
      requestId: 'req-selected-001',
      ...overrides,
    },
  };
}

describe('selected ticket invalidation', () => {
  it('invalidates only the selected active tickets and writes an audit record atomically', async () => {
    const db = new MemoryDB();
    const refs = seed(db);

    const result = await makeHandler(db)(request());

    assert.equal(result.success, true);
    assert.equal(result.invalidatedCount, 2);
    assert.deepEqual(result.ticketIds.sort(), ['t1', 't2']);

    for (const id of ['t1', 't2']) {
      const ticket = db.snapshot('ticket', id).data();
      assert.equal(ticket.status, 'invalid');
      assert.equal(ticket.invalidation_reason, 'verified adjustment');
      assert.equal(ticket.status_before_invalidation, 'active');
      assert.equal(ticket.invalidated_by.path, 'user/admin1');
    }

    assert.equal(db.snapshot('ticket', 't3').data().status, 'active');
    assert.equal(db.snapshot('ticket', 't4').data().status, 'active');
    assert.equal(db.snapshot('ticket', 't5').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't6').data().status, 'cancelled');
    assert.equal(db.snapshot('ticket', 't7').data().status, 'winner');

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.stock_quantity, 96);
    assert.equal(competition.sold_tickets, 4);
    assert.equal(competition.last_ticket_sequence, 4);
    assert.equal(competition.participants.length, 2);

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.stripe_status, 'paid');
    assert.equal(order.stripe_payment_intent_id, 'pi_123');
    assert.equal(order.total_ticket, 4);
    assert.equal(order.total_amount, 40);

    const user = db.snapshot('user', 'u1').data();
    assert.equal(user.free_tickets, 2);
    assert.equal(user.total_free_tickets, 5);
    assert.equal(user.total_tickets_bought, 4);
    assert.equal(user.total_spent, 40);

    const audit = db.snapshot('ticket_adjustments', 'req-selected-001').data();
    assert.equal(audit.operation, 'ticket_invalidation');
    assert.equal(audit.direction, 'decrease');
    assert.equal(audit.quantity, 2);
    assert.equal(audit.payment_effect, 'none');
    assert.deepEqual(audit.ticket_ids.sort(), ['t1', 't2']);
    assert.deepEqual(audit.ticket_numbers.sort(), [1, 2]);
    assert.equal(audit.quantity_scope, 'selected_active_tickets');
    assert.equal(audit.previous_quantity, 2);
    assert.equal(audit.new_quantity, 0);
    assert.equal(audit.active_count_scope, 'selected_tickets');
    assert.equal(audit.active_count_before, null);
    assert.equal(audit.active_count_after, null);
    assert.equal(audit.selected_count_before, 2);
    assert.equal(audit.selected_count_after, 0);
    assert.equal(audit.primary_order_ref.path, refs.orderRef.path);
    assert.equal(audit.performed_by.path, 'user/admin1');
    assert.equal(audit.actor_role, 'admin');
    assert.deepEqual(audit.ticket_origins, ['legacy_unknown', 'legacy_unknown']);
    assert.equal(audit.ticket_origins.length, audit.ticket_ids.length);
    assert.deepEqual(audit.origin_breakdown, { legacy_unknown: 2 });
  });

  it('preserves ticket origin when invalidating an issued ticket', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('ticket', 't1', {
      ...db.snapshot('ticket', 't1').data(),
      allocation_type: 'paid',
    });

    const result = await makeHandler(db)(request({
      ticketIds: ['t1'],
      requestId: 'req-origin-immutable',
    }));

    assert.equal(result.invalidatedCount, 1);
    assert.equal(db.snapshot('ticket', 't1').data().allocation_type, 'paid');
    const audit = db.snapshot('ticket_adjustments', 'req-origin-immutable').data();
    assert.deepEqual(audit.ticket_origins, ['paid']);
    assert.deepEqual(audit.origin_breakdown, { paid: 1 });
  });

  it('rejects duplicate, inactive, and mixed ineligible selections without writes', async () => {
    const cases = [
      { ids: ['t1', 't1'], requestId: 'req-dup-001' },
      { ids: ['t1', 't5'], requestId: 'req-inactive-001' },
      { ids: ['t1', 't6'], requestId: 'req-cancelled-001' },
      { ids: ['t1', 't7'], requestId: 'req-winner-001' },
      { ids: ['t1', 't4'], requestId: 'req-owner-001' },
    ];

    for (const testCase of cases) {
      const db = new MemoryDB();
      seed(db);
      await assert.rejects(
        makeHandler(db)(request({ ticketIds: testCase.ids, requestId: testCase.requestId })),
        (error) => error.code === 'invalid-argument' || error.code === 'failed-precondition'
      );
      assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
      assert.equal(db.snapshot('ticket_adjustments', testCase.requestId).exists, false);
    }
  });

  it('rejects protected states, winner references, past draws, and missing draw dates', async () => {
    for (const status of ['draft', 'ready_to_draw', 'drawing', 'winner_announced', 'completed', 'end', 'closed', 'paused', 'cancelled', 'deleted']) {
      const db = new MemoryDB();
      seed(db, { status });
      await assert.rejects(
        makeHandler(db)(request({ requestId: `req-status-${status}` })),
        (error) => error.code === 'failed-precondition'
      );
      assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    }

    const winnerRefDb = new MemoryDB();
    seed(winnerRefDb, { winner_ref: 'user/u2' });
    await assert.rejects(
      makeHandler(winnerRefDb)(request({ requestId: 'req-winner-ref' })),
      (error) => error.code === 'failed-precondition'
    );

    const pastDb = new MemoryDB();
    seed(pastDb, { draw_date: PAST_DRAW });
    await assert.rejects(
      makeHandler(pastDb)(request({ requestId: 'req-past' })),
      (error) => error.code === 'failed-precondition'
    );

    const missingDrawDb = new MemoryDB();
    seed(missingDrawDb, { draw_date: null });
    await assert.rejects(
      makeHandler(missingDrawDb)(request({ requestId: 'req-missing-draw' })),
      (error) => error.code === 'failed-precondition'
    );

    const malformedDrawDb = new MemoryDB();
    seed(malformedDrawDb, { draw_date: 'not-a-date' });
    await assert.rejects(
      makeHandler(malformedDrawDb)(request({ requestId: 'req-malformed-draw' })),
      (error) => error.code === 'failed-precondition'
    );
  });

  it('does not require inventory counters because invalidation does not use them', async () => {
    for (const competition of [
      { stock_quantity: '96' },
      { sold_tickets: '4' },
      { last_ticket_sequence: -1 },
      { last_ticket_sequence: undefined },
    ]) {
      const db = new MemoryDB();
      seed(db, competition);
      db.collectionStore('ticket').delete('t7');
      const before = { ...db.snapshot('competition', 'c1').data() };
      const result = await makeHandler(db)({
        auth: { uid: 'admin1' },
        data: { userId: 'u1', competitionId: 'c1', reason: 'legacy cleanup' },
      });
      assert.equal(result.invalidatedCount, 3);
      assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
      const after = db.snapshot('competition', 'c1').data();
      assert.equal(after.stock_quantity, before.stock_quantity);
      assert.equal(after.sold_tickets, before.sold_tickets);
      assert.equal(after.last_ticket_sequence, before.last_ticket_sequence);
    }
  });

  it('requires a request ID and idempotently replays the same request', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await assert.rejects(
      handler(request({ requestId: undefined })),
      (error) => error.code === 'invalid-argument'
    );

    const first = await handler(request());
    const second = await handler(request());

    assert.equal(first.invalidatedCount, 2);
    assert.equal(second.invalidatedCount, 2);
    assert.deepEqual(second.ticketIds.sort(), ['t1', 't2']);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
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

    assert.deepEqual(replay.ticketIds.sort(), first.ticketIds.sort());
    assert.equal(replay.invalidatedCount, 2);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
    assert.equal((db.collections.get('ticket_adjustments')?.size || 0), 1);
  });

  it('serializes concurrent duplicate requests without duplicate audit records', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const results = await Promise.all([handler(request()), handler(request())]);

    assert.equal(results[0].invalidatedCount, 2);
    assert.equal(results[1].invalidatedCount, 2);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
    assert.equal((db.collections.get('ticket_adjustments')?.size || 0), 1);
  });

  it('replays the same selection in a different order and rejects different same-quantity selections', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const first = await handler(request({ ticketIds: ['t1', 't2'] }));
    const reordered = await handler(request({ ticketIds: ['t2', 't1'] }));
    assert.deepEqual(reordered.ticketIds.sort(), first.ticketIds.sort());
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't3').data().status, 'active');

    await assert.rejects(
      handler(request({ ticketIds: ['t2', 't3'] })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 't3').data().status, 'active');
    assert.equal(db.snapshot('ticket_adjustments', 'req-selected-001').data().reason, 'verified adjustment');
  });

  it('rejects reuse of a request ID with a different reason', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await handler(request());
    await assert.rejects(
      handler(request({ reason: 'different reason' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
    assert.equal(db.snapshot('ticket_adjustments', 'req-selected-001').data().reason, 'verified adjustment');
  });

  it('rejects reuse of a request ID for a different selection', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await handler(request());
    await assert.rejects(
      handler(request({ ticketIds: ['t3'], requestId: 'req-selected-001' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 't3').data().status, 'active');
  });


  it('rejects unauthorized callers without writes', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = createInvalidateUserCompetitionTicketsHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      assertAdmin: async () => {
        throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
      },
      HttpsError: MockHttpsError,
    });

    await assert.rejects(
      handler(request()),
      (error) => error.code === 'permission-denied'
    );
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.snapshot('ticket_adjustments', 'req-selected-001').exists, false);
  });

  it('detects a draw transition that commits after the preflight read', async () => {
    const db = new MemoryDB();
    seed(db);
    db.beforeTransaction = async () => {
      db.setDocument('competition', 'c1', {
        title: 'Ticket Competition',
        status: 'drawing',
        draw_date: FUTURE_DRAW,
        stock_quantity: 96,
        sold_tickets: 4,
        total_tickets: 100,
        last_ticket_sequence: 4,
        participants: [],
      });
    };

    await assert.rejects(
      makeHandler(db)(request({ requestId: 'req-draw-race' })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.snapshot('ticket_adjustments', 'req-draw-race').exists, false);
  });


  it('fails closed when the draw date is missing even for the legacy all-active path', async () => {
    const db = new MemoryDB();
    seed(db, { draw_date: null });

    await assert.rejects(
      makeHandler(db)({
        auth: { uid: 'admin1' },
        data: { userId: 'u1', competitionId: 'c1', reason: 'legacy cleanup' },
      }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
  });

  it('fails closed when the draw date is malformed for the legacy all-active path', async () => {
    const db = new MemoryDB();
    seed(db, { draw_date: 'not-a-date' });

    await assert.rejects(
      makeHandler(db)({
        auth: { uid: 'admin1' },
        data: { userId: 'u1', competitionId: 'c1', reason: 'legacy cleanup' },
      }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
  });

  it('invalidates missing and empty legacy statuses as active tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.setDocument('ticket', 'legacyMissing', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      order_id: refs.orderRef,
      ticket_number: 8,
      ticket_sequence: 'TC008',
      is_winner: false,
    });
    db.setDocument('ticket', 'legacyEmpty', {
      user_id: refs.userRef,
      competition_id: refs.competitionRef,
      order_id: refs.orderRef,
      ticket_number: 9,
      ticket_sequence: 'TC009',
      status: '',
      is_winner: false,
    });

    const result = await makeHandler(db)(request({
      ticketIds: ['legacyMissing', 'legacyEmpty'],
      requestId: 'req-legacy-status-selected',
    }));

    assert.equal(result.invalidatedCount, 2);
    assert.equal(db.snapshot('ticket', 'legacyMissing').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 'legacyEmpty').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 'legacyMissing').data().status_before_invalidation, 'active');
    assert.equal(db.snapshot('ticket', 'legacyEmpty').data().status_before_invalidation, 'active');
  });

  it('preserves legacy all-active behavior when ticketIds are omitted', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('ticket', 't7', {
      user_id: db.collection('user').doc('u2'),
      competition_id: db.collection('competition').doc('c1'),
      order_id: db.collection('order').doc('o1'),
      ticket_number: 7,
      ticket_sequence: 'TC007',
      status: 'winner',
      is_winner: true,
    });

    const result = await makeHandler(db)({
      auth: { uid: 'admin1' },
      data: { userId: 'u1', competitionId: 'c1', reason: 'legacy cleanup' },
    });

    assert.equal(result.invalidatedCount, 3);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't3').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't5').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't6').data().status, 'cancelled');
    assert.equal(db.snapshot('ticket', 't7').data().status, 'winner');
  });
});
