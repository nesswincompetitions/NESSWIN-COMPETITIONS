import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  createDecreaseUserCompetitionTicketsHandler,
  createIncreaseUserCompetitionTicketsHandler,
} from '../services/ticketAdjustmentService.js';
import { createInvalidateUserCompetitionTicketsHandler } from '../services/ticketInvalidationService.js';
import {
  ADMIN_AUDIT_COLLECTION,
  AUDIT_ACTIONS,
} from '../services/adminAuditService.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST_DRAW = new Date(Date.now() - 60 * 1000);

function makeIncreaseHandler(db, admin = createMockAdmin()) {
  return createIncreaseUserCompetitionTicketsHandler({
    db,
    admin,
    logger: createMockLogger(),
    assertAdmin: async () => 'admin1',
    HttpsError: MockHttpsError,
  });
}

function makeDecreaseHandler(db, admin = createMockAdmin()) {
  return createDecreaseUserCompetitionTicketsHandler({
    db,
    admin,
    logger: createMockLogger(),
    assertAdmin: async () => 'admin1',
    HttpsError: MockHttpsError,
  });
}

function makeInvalidationHandler(db, admin = createMockAdmin()) {
  return createInvalidateUserCompetitionTicketsHandler({
    db,
    admin,
    logger: createMockLogger(),
    assertAdmin: async () => 'admin1',
    HttpsError: MockHttpsError,
  });
}

function auditEvents(db) {
  return Array.from(db.collectionStore(ADMIN_AUDIT_COLLECTION).entries()).map(
    ([id, data]) => ({ id, ...data })
  );
}

function seedOrderScenario(db, ticketOrigins, overrides = {}) {
  const userRef = db.collection('user').doc('u1');
  const adminRef = db.collection('user').doc('admin1');
  const competitionRef = db.collection('competition').doc('c1');
  const orderRef = db.collection('order').doc('o1');
  const paidCount = ticketOrigins.filter((origin) => origin === 'paid').length;
  const bonusCount = ticketOrigins.filter((origin) => origin === 'admin_bonus').length;

  db.setDocument('user', 'u1', {
    free_tickets: 2,
    total_free_tickets: 5,
    total_tickets_bought: ticketOrigins.length,
    total_spent: 40,
  });
  db.setDocument('user', 'admin1', { role: 'admin' });
  db.setDocument('competition', 'c1', {
    title: 'Completeness Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    stock_quantity: 100 - ticketOrigins.length,
    sold_tickets: ticketOrigins.length,
    total_tickets: 100,
    last_ticket_sequence: ticketOrigins.length,
    participants: [userRef],
    ...(overrides.competition || {}),
  });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    stripe_status: 'paid',
    stripe_payment_intent_id: 'pi_123',
    total_ticket: ticketOrigins.length,
    paid_ticket: paidCount,
    free_ticket: bonusCount,
    free_used: 0,
    subtotal: 40,
    discount_amount: 0,
    total_amount: 40,
    currency: 'GBP',
    is_winner: false,
    ...(overrides.order || {}),
  });

  ticketOrigins.forEach((origin, index) => {
    const number = index + 1;
    db.setDocument('ticket', `t${number}`, {
      competition_id: competitionRef,
      user_id: userRef,
      order_id: orderRef,
      ticket_number: number,
      ticket_sequence: `CMP${String(number).padStart(3, '0')}`,
      status: 'active',
      is_winner: false,
      allocation_type: origin,
    });
  });

  return { userRef, adminRef, competitionRef, orderRef };
}

function seedParticipantRemoval(db, activeCount) {
  const userRef = db.collection('user').doc('u1');
  const adminRef = db.collection('user').doc('admin1');
  const competitionRef = db.collection('competition').doc('c1');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', 'u1', {
    free_tickets: 2,
    total_free_tickets: 5,
    total_tickets_bought: activeCount,
    total_spent: activeCount * 10,
  });
  db.setDocument('user', 'admin1', { role: 'admin' });
  db.setDocument('competition', 'c1', {
    title: 'Large Participant Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    stock_quantity: 5000 - activeCount,
    sold_tickets: activeCount,
    total_tickets: 5000,
    last_ticket_sequence: activeCount + 2,
    participants: [userRef],
  });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    stripe_status: 'paid',
    stripe_payment_intent_id: 'pi_large',
    total_ticket: activeCount,
    paid_ticket: activeCount,
    free_ticket: 0,
    free_used: 0,
    total_amount: activeCount * 10,
    currency: 'GBP',
    is_winner: false,
  });

  for (let index = 1; index <= activeCount; index++) {
    db.setDocument('ticket', `t${index}`, {
      competition_id: competitionRef,
      user_id: userRef,
      order_id: orderRef,
      ticket_number: index,
      ticket_sequence: `BIG${String(index).padStart(5, '0')}`,
      status: 'active',
      is_winner: false,
      allocation_type: index % 2 === 0 ? 'admin_bonus' : 'paid',
    });
  }

  db.setDocument('ticket', 'old-invalid', {
    competition_id: competitionRef,
    user_id: userRef,
    order_id: orderRef,
    ticket_number: activeCount + 1,
    ticket_sequence: 'OLDINV',
    status: 'invalid',
    is_winner: false,
    invalidated_at: 'original-invalidated-at',
    invalidated_by: adminRef,
    invalidation_reason: 'original reason',
    status_before_invalidation: 'active',
    allocation_type: 'paid',
  });
  db.setDocument('ticket', 'old-cancelled', {
    competition_id: competitionRef,
    user_id: userRef,
    order_id: orderRef,
    ticket_number: activeCount + 2,
    ticket_sequence: 'OLDCAN',
    status: 'cancelled',
    is_winner: false,
    allocation_type: 'paid',
  });

  return { userRef, adminRef, competitionRef, orderRef };
}

function seedNoopParticipantRemoval(db) {
  const userRef = db.collection('user').doc('u1');
  const adminRef = db.collection('user').doc('admin1');
  const competitionRef = db.collection('competition').doc('c1');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', 'u1', {
    free_tickets: 2,
    total_free_tickets: 5,
    total_tickets_bought: 2,
    total_spent: 20,
  });
  db.setDocument('user', 'admin1', { role: 'admin' });
  db.setDocument('competition', 'c1', {
    title: 'Noop Participant Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    stock_quantity: 98,
    sold_tickets: 2,
    total_tickets: 100,
    last_ticket_sequence: 2,
    participants: [userRef],
  });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    stripe_status: 'paid',
    total_ticket: 2,
    paid_ticket: 2,
    total_amount: 20,
    currency: 'GBP',
  });
  db.setDocument('ticket', 'old-invalid', {
    competition_id: competitionRef,
    user_id: userRef,
    order_id: orderRef,
    ticket_number: 1,
    ticket_sequence: 'NOOP1',
    status: 'invalid',
    is_winner: false,
    allocation_type: 'paid',
    invalidation_reason: 'original reason',
  });
  db.setDocument('ticket', 'old-cancelled', {
    competition_id: competitionRef,
    user_id: userRef,
    order_id: orderRef,
    ticket_number: 2,
    ticket_sequence: 'NOOP2',
    status: 'cancelled',
    is_winner: false,
    allocation_type: 'paid',
  });
  db.setDocument('referrals', 'r1', {
    referrer_id: userRef,
    reward_type: 'admin_bonus',
    reward_issued: false,
    reward_revoked: false,
  });
  db.setDocument('free_ticket_log', 'l1', {
    user_id: userRef,
    quantity: 1,
    reward_type: 'pack_bonus',
  });

  return { userRef, adminRef, competitionRef, orderRef };
}

async function runWithCollisionBarrier(db, requestId, first, second) {
  const collisionPaths = new Set([
    `ticket_adjustments/${requestId}`,
    `ticket_adjustments/${requestId}:chunk:0`,
  ]);
  const transactionsSeen = new Set();
  let releaseBarrier;
  const barrier = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  const timeout = setTimeout(() => releaseBarrier(), 100);

  db.afterTransactionRead = async (ref, transaction) => {
    if (!ref?.path || !collisionPaths.has(ref.path)) return;
    transactionsSeen.add(transaction);
    if (transactionsSeen.size >= 2) releaseBarrier();
    await barrier;
  };

  try {
    const results = await Promise.allSettled([first(), second()]);
    return { results, transactionCount: transactionsSeen.size };
  } finally {
    clearTimeout(timeout);
    db.afterTransactionRead = null;
  }
}

describe('paid and bonus ticket increases', () => {
  it('increases paid tickets with paid provenance and writes a central audit event', async () => {
    const db = new MemoryDB();
    const refs = seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid']);

    const result = await makeIncreaseHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        orderId: 'o1',
        origin: 'paid',
        quantity: 2,
        reason: 'goodwill paid allocation',
        requestId: 'req-paid-increase',
        actor_uid: 'attacker',
        actor_role: 'superadmin',
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.addedCount, 2);
    assert.equal(result.requestedOrigin, 'paid');
    assert.equal(result.paymentEffect, 'none');

    const addedTickets = result.ticketIds.map((id) => db.snapshot('ticket', id).data());
    assert.deepEqual(addedTickets.map((ticket) => ticket.allocation_type), ['paid', 'paid']);
    assert.deepEqual(addedTickets.map((ticket) => ticket.ticket_number), [5, 6]);
    assert.deepEqual(addedTickets.map((ticket) => ticket.ticket_sequence), [
      'CC005',
      'CC006',
    ]);

    const adjustment = db.snapshot('ticket_adjustments', 'req-paid-increase').data();
    assert.equal(adjustment.operation, 'ticket_increase');
    assert.equal(adjustment.requested_origin, 'paid');
    assert.deepEqual(adjustment.ticket_origins, ['paid', 'paid']);
    assert.deepEqual(adjustment.origin_breakdown, { paid: 2 });
    assert.equal(adjustment.payment_effect, 'none');

    const events = auditEvents(db);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.action, AUDIT_ACTIONS.TICKET_QUANTITY_INCREASED);
    assert.equal(event.entity_type, 'ticket_adjustment');
    assert.equal(event.entity_id, 'req-paid-increase');
    assert.equal(event.actor_type, 'admin');
    assert.equal(event.actor_uid, 'admin1');
    assert.equal(event.actor_role, 'admin');
    assert.equal(event.correlation_id, 'req-paid-increase');
    assert.equal(event.source, 'admin_order_increase');
    assert.equal(event.related.adjustment_id, 'req-paid-increase');
    assert.equal(event.related.user_id, 'u1');
    assert.equal(event.related.competition_id, 'c1');
    assert.equal(event.related.order_id, 'o1');
    assert.equal('ticket_ids' in event.related, false);
    assert.equal(event.after.quantity, 2);
    assert.equal(event.after.requested_origin, 'paid');
    assert.equal(event.before.direction, 'increase');

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.total_ticket, 4);
    assert.equal(order.paid_ticket, 4);
    assert.equal(order.total_amount, 40);
    assert.equal(order.stripe_status, 'paid');
    const user = db.snapshot('user', 'u1').data();
    assert.equal(user.total_tickets_bought, 4);
    assert.equal(user.total_spent, 40);
    assert.equal(db.collections.has('referrals'), false);
    assert.equal(db.collections.has('free_ticket_log'), false);
    assert.equal(refs.orderRef.path, 'order/o1');
  });

  it('increases bonus tickets with admin_bonus provenance and no payment side effects', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid', 'admin_bonus', 'admin_bonus']);

    const result = await makeIncreaseHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        orderId: 'o1',
        origin: 'bonus',
        quantity: 2,
        reason: 'bonus allocation',
        requestId: 'req-bonus-increase',
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.requestedOrigin, 'admin_bonus');
    assert.equal(result.paymentEffect, 'none');

    const addedTickets = result.ticketIds.map((id) => db.snapshot('ticket', id).data());
    assert.deepEqual(addedTickets.map((ticket) => ticket.allocation_type), [
      'admin_bonus',
      'admin_bonus',
    ]);

    const adjustment = db.snapshot('ticket_adjustments', 'req-bonus-increase').data();
    assert.equal(adjustment.requested_origin, 'admin_bonus');
    assert.deepEqual(adjustment.ticket_origins, ['admin_bonus', 'admin_bonus']);
    assert.deepEqual(adjustment.origin_breakdown, { admin_bonus: 2 });

    const events = auditEvents(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].after.requested_origin, 'admin_bonus');
    assert.equal(events[0].action, AUDIT_ACTIONS.TICKET_QUANTITY_INCREASED);

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.total_ticket, 4);
    assert.equal(order.paid_ticket, 2);
    assert.equal(order.free_ticket, 2);
    assert.equal(order.total_amount, 40);
    assert.equal(db.collections.has('referrals'), false);
    assert.equal(db.collections.has('free_ticket_log'), false);
  });

  it('rejects request ID reuse across paid and bonus increases', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid']);
    const handler = makeIncreaseHandler(db);

    await handler({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        orderId: 'o1',
        origin: 'paid',
        quantity: 1,
        reason: 'paid increase',
        requestId: 'req-origin-reuse',
      },
    });

    await assert.rejects(
      handler({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          orderId: 'o1',
          origin: 'bonus',
          quantity: 1,
          reason: 'paid increase',
          requestId: 'req-origin-reuse',
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(auditEvents(db).length, 1);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
  });

  it('applies draw and inventory restrictions to paid and bonus increases', async () => {
    for (const origin of ['paid', 'bonus']) {
      for (const competition of [
        { draw_date: PAST_DRAW },
        {
          stock_quantity: 0,
          sold_tickets: 4,
          total_tickets: 4,
          last_ticket_sequence: 4,
        },
      ]) {
        const db = new MemoryDB();
        seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid'], { competition });

        await assert.rejects(
          makeIncreaseHandler(db)({
            auth: { uid: 'admin1' },
            data: {
              userId: 'u1',
              competitionId: 'c1',
              orderId: 'o1',
              origin,
              quantity: 1,
              reason: 'restriction check',
              requestId: `req-restriction-${origin}-${Object.keys(competition)[0]}`,
            },
          }),
          (error) => error.code === 'failed-precondition'
        );

        assert.equal(db.collectionStore('ticket_adjustments').size, 0);
        assert.equal(auditEvents(db).length, 0);
      }
    }
  });

  it('replays the same paid increase without duplicate audit events', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid']);
    const handler = makeIncreaseHandler(db);
    const request = {
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        orderId: 'o1',
        origin: 'paid',
        quantity: 1,
        reason: 'paid increase',
        requestId: 'req-paid-replay',
      },
    };

    const first = await handler(request);
    const second = await handler(request);

    assert.equal(first.addedCount, 1);
    assert.equal(second.idempotentReplay, true);
    assert.equal(second.addedCount, 1);
    assert.equal(auditEvents(db).length, 1);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
  });
});

describe('ticket decrease audit integration', () => {
  it('writes a central audit event referencing the detailed ticket_adjustments record', async () => {
    const db = new MemoryDB();
    const refs = seedOrderScenario(db, [
      'paid',
      'paid',
      'paid',
      'paid',
      'admin_bonus',
      'admin_bonus',
    ]);
    const orderBefore = { ...db.snapshot('order', 'o1').data() };
    const competitionBefore = { ...db.snapshot('competition', 'c1').data() };
    const userBefore = { ...db.snapshot('user', 'u1').data() };

    const result = await makeDecreaseHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        orderId: 'o1',
        origin: 'paid',
        quantity: 2,
        reason: 'paid correction',
        requestId: 'req-decrease-audit',
      },
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.ticketIds, ['t3', 't4']);
    assert.equal(result.paymentEffect, 'none');

    const adjustment = db.snapshot('ticket_adjustments', 'req-decrease-audit').data();
    assert.equal(adjustment.operation, 'ticket_decrease');
    assert.deepEqual(adjustment.ticket_ids, ['t3', 't4']);
    assert.equal(adjustment.payment_effect, 'none');

    const events = auditEvents(db);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.action, AUDIT_ACTIONS.TICKET_QUANTITY_DECREASED);
    assert.equal(event.entity_id, 'req-decrease-audit');
    assert.equal(event.actor_uid, 'admin1');
    assert.equal(event.actor_role, 'admin');
    assert.equal(event.correlation_id, 'req-decrease-audit');
    assert.equal(event.related.adjustment_id, 'req-decrease-audit');
    assert.equal(event.related.order_id, 'o1');
    assert.equal('ticket_ids' in event.related, false);
    assert.equal(event.after.requested_origin, 'paid');

    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), competitionBefore);
    assert.deepEqual(db.snapshot('user', 'u1').data(), userBefore);
    assert.equal(db.snapshot('ticket', 't3').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't4').data().status, 'invalid');
    assert.equal(refs.competitionRef.path, 'competition/c1');
  });
});

describe('request ID collision protection', () => {
  it('rejects participant removal when the request ID belongs to another operation', async () => {
    for (const operation of ['increase', 'decrease', 'selected']) {
      const db = new MemoryDB();
      seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid']);
      const requestId = `req-cross-participant-${operation}`;

      if (operation === 'increase') {
        await makeIncreaseHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            orderId: 'o1',
            origin: 'paid',
            quantity: 1,
            reason: 'cross operation',
            requestId,
          },
        });
      } else if (operation === 'decrease') {
        await makeDecreaseHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            orderId: 'o1',
            origin: 'paid',
            quantity: 1,
            reason: 'cross operation',
            requestId,
          },
        });
      } else {
        await makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            ticketIds: ['t1'],
            reason: 'cross operation',
            requestId,
          },
        });
      }

      const adjustmentsBefore = db.collectionStore('ticket_adjustments').size;
      const auditBefore = auditEvents(db).length;

      await assert.rejects(
        makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            reason: 'participant removal',
            requestId,
          },
        }),
        (error) => error.code === 'failed-precondition'
      );

      assert.equal(db.collectionStore('ticket_adjustments').size, adjustmentsBefore);
      assert.equal(auditEvents(db).length, auditBefore);
      assert.equal(db.snapshot('ticket', 't2').data().status, 'active');
    }
  });

  it('rejects increase, decrease, and selected invalidation when the request ID belongs to participant removal', async () => {
    for (const operation of ['increase', 'decrease', 'selected']) {
      const db = new MemoryDB();
      seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid']);
      const requestId = `req-cross-other-${operation}`;

      const removal = await makeInvalidationHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          reason: 'participant removal',
          requestId,
        },
      });
      assert.equal(removal.complete, true);

      const adjustmentsBefore = db.collectionStore('ticket_adjustments').size;
      const auditBefore = auditEvents(db).length;
      const ticketsBefore = db.collectionStore('ticket').size;

      if (operation === 'increase') {
        await assert.rejects(
          makeIncreaseHandler(db)({
            auth: { uid: 'admin1' },
            data: {
              userId: 'u1',
              competitionId: 'c1',
              orderId: 'o1',
              origin: 'paid',
              quantity: 1,
              reason: 'cross operation',
              requestId,
            },
          }),
          (error) => error.code === 'failed-precondition'
        );
      } else if (operation === 'decrease') {
        await assert.rejects(
          makeDecreaseHandler(db)({
            auth: { uid: 'admin1' },
            data: {
              userId: 'u1',
              competitionId: 'c1',
              orderId: 'o1',
              origin: 'paid',
              quantity: 1,
              reason: 'cross operation',
              requestId,
            },
          }),
          (error) => error.code === 'failed-precondition'
        );
      } else {
        await assert.rejects(
          makeInvalidationHandler(db)({
            auth: { uid: 'admin1' },
            data: {
              userId: 'u1',
              competitionId: 'c1',
              ticketIds: ['t1'],
              reason: 'cross operation',
              requestId,
            },
          }),
          (error) => error.code === 'failed-precondition'
        );
      }

      assert.equal(db.collectionStore('ticket_adjustments').size, adjustmentsBefore);
      assert.equal(auditEvents(db).length, auditBefore);
      assert.equal(db.collectionStore('ticket').size, ticketsBefore);
    }
  });

  it('rejects participant removal request ID reuse across users, competitions, and reasons', async () => {
    const db = new MemoryDB();
    seedParticipantRemoval(db, 3);
    db.setDocument('user', 'u2', { free_tickets: 0 });
    db.setDocument('competition', 'c2', {
      title: 'Other Competition',
      status: 'active',
      draw_date: FUTURE_DRAW,
      stock_quantity: 10,
      sold_tickets: 0,
      total_tickets: 10,
      last_ticket_sequence: 0,
      participants: [],
    });
    const requestId = 'req-participant-identity';
    const handler = makeInvalidationHandler(db);

    await handler({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'reason one',
        requestId,
      },
    });

    await assert.rejects(
      handler({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          reason: 'reason two',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    await assert.rejects(
      handler({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u2',
          competitionId: 'c1',
          reason: 'reason one',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    await assert.rejects(
      handler({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c2',
          reason: 'reason one',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
  });
});

describe('no-op participant removal request ID reservation', () => {
  it('reserves the request ID with zero-quantity adjustment and audit records', async () => {
    const db = new MemoryDB();
    const refs = seedNoopParticipantRemoval(db);
    const invalidBefore = { ...db.snapshot('ticket', 'old-invalid').data() };
    const cancelledBefore = { ...db.snapshot('ticket', 'old-cancelled').data() };
    const orderBefore = { ...db.snapshot('order', 'o1').data() };
    const competitionBefore = { ...db.snapshot('competition', 'c1').data() };
    const userBefore = { ...db.snapshot('user', 'u1').data() };
    const referralBefore = { ...db.snapshot('referrals', 'r1').data() };
    const logBefore = { ...db.snapshot('free_ticket_log', 'l1').data() };

    const result = await makeInvalidationHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'no eligible tickets',
        requestId: 'req-noop-reserve',
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.complete, true);
    assert.equal(result.noop, true);
    assert.equal(result.mode, 'participant_removal');
    assert.equal(result.operationId, 'req-noop-reserve');
    assert.equal(result.invalidatedCount, 0);
    assert.equal(result.processedCount, 0);
    assert.equal(result.remainingCount, 0);
    assert.equal(result.totalEligibleCount, 0);
    assert.equal(result.paymentEffect, 'none');

    const adjustment = db.snapshot('ticket_adjustments', 'req-noop-reserve').data();
    assert.equal(adjustment.operation, 'ticket_invalidation');
    assert.equal(adjustment.source, 'admin_all_active_tickets');
    assert.equal(adjustment.request_id, 'req-noop-reserve');
    assert.equal(adjustment.quantity, 0);
    assert.deepEqual(adjustment.ticket_ids, []);
    assert.equal(adjustment.payment_effect, 'none');
    assert.equal(adjustment.result.noop, true);
    assert.equal(adjustment.result.mode, 'participant_removal');
    assert.equal(adjustment.actor_role, 'admin');
    assert.equal(adjustment.performed_by.path, 'user/admin1');
    assert.ok(adjustment.created_at);

    const events = auditEvents(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, AUDIT_ACTIONS.TICKET_INVALIDATED);
    assert.equal(events[0].entity_id, 'req-noop-reserve');
    assert.equal(events[0].correlation_id, 'req-noop-reserve');
    assert.equal(events[0].related.adjustment_id, 'req-noop-reserve');
    assert.equal(events[0].after.quantity, 0);
    assert.equal(events[0].actor_uid, 'admin1');
    assert.equal(events[0].actor_role, 'admin');

    assert.deepEqual(db.snapshot('ticket', 'old-invalid').data(), invalidBefore);
    assert.deepEqual(db.snapshot('ticket', 'old-cancelled').data(), cancelledBefore);
    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), competitionBefore);
    assert.deepEqual(db.snapshot('user', 'u1').data(), userBefore);
    assert.deepEqual(db.snapshot('referrals', 'r1').data(), referralBefore);
    assert.deepEqual(db.snapshot('free_ticket_log', 'l1').data(), logBefore);
    assert.equal(refs.competitionRef.path, 'competition/c1');
  });

  it('replays the no-op without duplicate adjustment or audit records', async () => {
    const db = new MemoryDB();
    seedNoopParticipantRemoval(db);
    const handler = makeInvalidationHandler(db);
    const request = {
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'no eligible tickets',
        requestId: 'req-noop-replay',
      },
    };

    const first = await handler(request);
    const second = await handler(request);

    assert.equal(first.noop, true);
    assert.equal(second.noop, true);
    assert.equal(second.processedCount, 0);
    assert.equal(second.invalidatedCount, 0);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
  });

  it('rejects reuse of the no-op request ID by increase, decrease, and selected invalidation', async () => {
    const db = new MemoryDB();
    seedNoopParticipantRemoval(db);
    const requestId = 'req-noop-reuse';

    await makeInvalidationHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'no eligible tickets',
        requestId,
      },
    });

    const adjustmentsBefore = db.collectionStore('ticket_adjustments').size;
    const auditBefore = auditEvents(db).length;

    await assert.rejects(
      makeIncreaseHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          orderId: 'o1',
          origin: 'paid',
          quantity: 1,
          reason: 'increase',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );
    await assert.rejects(
      makeDecreaseHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          orderId: 'o1',
          origin: 'paid',
          quantity: 1,
          reason: 'decrease',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );
    await assert.rejects(
      makeInvalidationHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          ticketIds: ['old-invalid'],
          reason: 'selected',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore('ticket_adjustments').size, adjustmentsBefore);
    assert.equal(auditEvents(db).length, auditBefore);
  });

  it('rejects a new no-op reservation after the draw has started', async () => {
    const db = new MemoryDB();
    seedNoopParticipantRemoval(db);
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      draw_started_at: new Date(),
    });
    const requestId = 'req-noop-draw-started';

    await assert.rejects(
      makeInvalidationHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          reason: 'no eligible tickets',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket_adjustments', requestId).exists, false);
    assert.equal(auditEvents(db).length, 0);
  });

  it('rejects a new no-op reservation in protected or final competition states', async () => {
    for (const status of ['drawing', 'winner_announced', 'completed']) {
      const db = new MemoryDB();
      seedNoopParticipantRemoval(db);
      db.setDocument('competition', 'c1', {
        ...db.snapshot('competition', 'c1').data(),
        status,
      });
      const requestId = `req-noop-status-${status}`;

      await assert.rejects(
        makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            reason: 'no eligible tickets',
            requestId,
          },
        }),
        (error) => error.code === 'failed-precondition'
      );

      assert.equal(db.snapshot('ticket_adjustments', requestId).exists, false);
      assert.equal(auditEvents(db).length, 0);
    }
  });

  it('rejects a new no-op reservation when the participant has a winning ticket', async () => {
    const db = new MemoryDB();
    const refs = seedNoopParticipantRemoval(db);
    db.setDocument('ticket', 'winner-ticket', {
      competition_id: refs.competitionRef,
      user_id: refs.userRef,
      order_id: refs.orderRef,
      ticket_number: 3,
      ticket_sequence: 'NOOPWIN',
      status: 'winner',
      is_winner: true,
      allocation_type: 'paid',
    });
    const requestId = 'req-noop-winner';

    await assert.rejects(
      makeInvalidationHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          reason: 'no eligible tickets',
          requestId,
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket_adjustments', requestId).exists, false);
    assert.equal(auditEvents(db).length, 0);
    assert.equal(db.snapshot('ticket', 'winner-ticket').data().status, 'winner');
  });

  it('replays a matching no-op after the competition becomes protected', async () => {
    const db = new MemoryDB();
    seedNoopParticipantRemoval(db);
    const handler = makeInvalidationHandler(db);
    const request = {
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'no eligible tickets',
        requestId: 'req-noop-protected-replay',
      },
    };

    const first = await handler(request);
    assert.equal(first.noop, true);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);

    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      status: 'drawing',
      draw_started_at: new Date(),
    });

    const replay = await handler(request);
    assert.equal(replay.noop, true);
    assert.equal(replay.success, true);
    assert.equal(replay.complete, true);
    assert.equal(replay.processedCount, 0);
    assert.equal(replay.invalidatedCount, 0);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
  });
});

describe('transactional request ID collision races', () => {
  it('commits at most one of increase and participant removal for the same request ID', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid']);
    const requestId = 'req-race-increase-removal';

    const { results, transactionCount } = await runWithCollisionBarrier(
      db,
      requestId,
      () =>
        makeIncreaseHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            orderId: 'o1',
            origin: 'paid',
            quantity: 1,
            reason: 'increase',
            requestId,
          },
        }),
      () =>
        makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            reason: 'removal',
            requestId,
          },
        })
    );

    assert.ok(transactionCount >= 2);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'failed-precondition');

    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    if (winnerIndex === 0) {
      assert.ok(db.snapshot('ticket_adjustments', requestId).exists);
      assert.equal(
        db.snapshot('ticket_adjustments', `${requestId}:chunk:0`).exists,
        false
      );
      assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 5);
      assert.equal(db.collectionStore('ticket').size, 5);
      assert.equal(auditEvents(db).length, 1);
    } else {
      assert.equal(db.snapshot('ticket_adjustments', requestId).exists, false);
      assert.ok(
        db.snapshot('ticket_adjustments', `${requestId}:chunk:0`).exists
      );
      assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 4);
      assert.equal(db.collectionStore('ticket').size, 4);
      for (let index = 1; index <= 4; index++) {
        assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'invalid');
      }
      assert.equal(auditEvents(db).length, 1);
    }
  });

  it('commits at most one of decrease and participant removal for the same request ID', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid']);
    const requestId = 'req-race-decrease-removal';

    const { results, transactionCount } = await runWithCollisionBarrier(
      db,
      requestId,
      () =>
        makeDecreaseHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            orderId: 'o1',
            origin: 'paid',
            quantity: 1,
            reason: 'decrease',
            requestId,
          },
        }),
      () =>
        makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            reason: 'removal',
            requestId,
          },
        })
    );

    assert.ok(transactionCount >= 2);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'failed-precondition');

    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    if (winnerIndex === 0) {
      assert.ok(db.snapshot('ticket_adjustments', requestId).exists);
      assert.equal(
        db.snapshot('ticket_adjustments', `${requestId}:chunk:0`).exists,
        false
      );
      assert.equal(db.snapshot('ticket', 't4').data().status, 'invalid');
      assert.equal(db.snapshot('ticket', 't3').data().status, 'active');
      assert.equal(auditEvents(db).length, 1);
    } else {
      assert.equal(db.snapshot('ticket_adjustments', requestId).exists, false);
      assert.ok(
        db.snapshot('ticket_adjustments', `${requestId}:chunk:0`).exists
      );
      for (let index = 1; index <= 4; index++) {
        assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'invalid');
      }
      assert.equal(auditEvents(db).length, 1);
    }
  });

  it('commits at most one of selected invalidation and participant removal for the same request ID', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid']);
    const requestId = 'req-race-selected-removal';

    const { results, transactionCount } = await runWithCollisionBarrier(
      db,
      requestId,
      () =>
        makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            ticketIds: ['t1'],
            reason: 'selected',
            requestId,
          },
        }),
      () =>
        makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            reason: 'removal',
            requestId,
          },
        })
    );

    assert.ok(transactionCount >= 2);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'failed-precondition');

    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    if (winnerIndex === 0) {
      assert.ok(db.snapshot('ticket_adjustments', requestId).exists);
      assert.equal(
        db.snapshot('ticket_adjustments', `${requestId}:chunk:0`).exists,
        false
      );
      assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
      assert.equal(db.snapshot('ticket', 't2').data().status, 'active');
      assert.equal(auditEvents(db).length, 1);
    } else {
      assert.equal(db.snapshot('ticket_adjustments', requestId).exists, false);
      assert.ok(
        db.snapshot('ticket_adjustments', `${requestId}:chunk:0`).exists
      );
      for (let index = 1; index <= 4; index++) {
        assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'invalid');
      }
      assert.equal(auditEvents(db).length, 1);
    }
  });

  it('commits at most one of no-op participant removal and increase for the same request ID', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid', 'paid', 'paid']);
    db.setDocument('user', 'u2', { free_tickets: 0 });
    db.setDocument('competition', 'c2', {
      title: 'Noop Other Competition',
      status: 'active',
      draw_date: FUTURE_DRAW,
      stock_quantity: 10,
      sold_tickets: 0,
      total_tickets: 10,
      last_ticket_sequence: 0,
      participants: [],
    });
    const requestId = 'req-race-noop-increase';

    const { results, transactionCount } = await runWithCollisionBarrier(
      db,
      requestId,
      () =>
        makeIncreaseHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u1',
            competitionId: 'c1',
            orderId: 'o1',
            origin: 'paid',
            quantity: 1,
            reason: 'increase',
            requestId,
          },
        }),
      () =>
        makeInvalidationHandler(db)({
          auth: { uid: 'admin1' },
          data: {
            userId: 'u2',
            competitionId: 'c2',
            reason: 'no eligible tickets',
            requestId,
          },
        })
    );

    assert.ok(transactionCount >= 2);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'failed-precondition');

    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    if (winnerIndex === 0) {
      const adjustment = db.snapshot('ticket_adjustments', requestId).data();
      assert.equal(adjustment.operation, 'ticket_increase');
      assert.equal(db.collectionStore('ticket').size, 5);
      assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 5);
    } else {
      const adjustment = db.snapshot('ticket_adjustments', requestId).data();
      assert.equal(adjustment.result.noop, true);
      assert.equal(adjustment.result.mode, 'participant_removal');
      assert.equal(db.collectionStore('ticket').size, 4);
      assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 4);
    }
    assert.equal(auditEvents(db).length, 1);
  });
});

describe('participant removal beyond the single-transaction limit', () => {
  it('invalidates more than 400 eligible tickets in safe chunks and records audit per chunk', async () => {
    const db = new MemoryDB();
    const refs = seedParticipantRemoval(db, 450);
    const orderBefore = { ...db.snapshot('order', 'o1').data() };
    const competitionBefore = { ...db.snapshot('competition', 'c1').data() };
    const invalidBefore = { ...db.snapshot('ticket', 'old-invalid').data() };
    const cancelledBefore = { ...db.snapshot('ticket', 'old-cancelled').data() };

    const result = await makeInvalidationHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'participant removal',
        requestId: 'req-large-participant',
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.complete, true);
    assert.equal(result.hasMore, false);
    assert.equal(result.mode, 'participant_removal');
    assert.equal(result.invalidatedCount, 450);
    assert.equal(result.processedCount, 450);
    assert.equal(result.remainingCount, 0);
    assert.equal(result.chunksProcessed, 2);
    assert.equal(result.paymentEffect, 'none');

    for (let index = 1; index <= 450; index++) {
      assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'invalid');
    }
    assert.deepEqual(db.snapshot('ticket', 'old-invalid').data(), invalidBefore);
    assert.deepEqual(db.snapshot('ticket', 'old-cancelled').data(), cancelledBefore);
    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), competitionBefore);

    const chunk0 = db.snapshot(
      'ticket_adjustments',
      'req-large-participant:chunk:0'
    ).data();
    const chunk1 = db.snapshot(
      'ticket_adjustments',
      'req-large-participant:chunk:1'
    ).data();
    assert.equal(chunk0.operation, 'ticket_invalidation');
    assert.equal(chunk0.source, 'admin_all_active_tickets');
    assert.equal(chunk0.request_id, 'req-large-participant');
    assert.equal(chunk0.quantity, 400);
    assert.equal(chunk0.ticket_ids.length, 400);
    assert.equal(chunk0.ticket_origins.length, 400);
    assert.equal(chunk1.quantity, 50);
    assert.equal(chunk1.ticket_ids.length, 50);

    const events = auditEvents(db);
    assert.equal(events.length, 2);
    const eventByEntity = new Map(events.map((event) => [event.entity_id, event]));
    for (const chunkId of [
      'req-large-participant:chunk:0',
      'req-large-participant:chunk:1',
    ]) {
      const event = eventByEntity.get(chunkId);
      assert.ok(event, chunkId);
      assert.equal(event.action, AUDIT_ACTIONS.TICKET_INVALIDATED);
      assert.equal(event.actor_uid, 'admin1');
      assert.equal(event.actor_role, 'admin');
      assert.equal(event.correlation_id, 'req-large-participant');
      assert.equal(event.related.adjustment_id, chunkId);
      assert.equal(event.related.user_id, 'u1');
      assert.equal(event.related.competition_id, 'c1');
      assert.equal('ticket_ids' in event.related, false);
    }

    const replay = await makeInvalidationHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'participant removal',
        requestId: 'req-large-participant',
      },
    });

    assert.equal(replay.success, true);
    assert.equal(replay.complete, true);
    assert.equal(replay.invalidatedCount, 0);
    assert.equal(replay.processedCount, 450);
    assert.equal(replay.remainingCount, 0);
    assert.equal(db.collectionStore('ticket_adjustments').size, 2);
    assert.equal(auditEvents(db).length, 2);

    await assert.rejects(
      makeInvalidationHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          reason: 'different reason',
          requestId: 'req-large-participant',
        },
      }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.collectionStore('ticket_adjustments').size, 2);
    assert.equal(auditEvents(db).length, 2);
    assert.equal(refs.userRef.path, 'user/u1');
  });

  it('replays a completed participant removal after the competition becomes blocked', async () => {
    const db = new MemoryDB();
    seedParticipantRemoval(db, 5);
    const handler = makeInvalidationHandler(db);
    const request = {
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'participant removal',
        requestId: 'req-participant-blocked-replay',
      },
    };

    const first = await handler(request);
    assert.equal(first.complete, true);
    assert.equal(first.processedCount, 5);

    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      status: 'drawing',
      draw_started_at: new Date(),
    });

    const replay = await handler(request);
    assert.equal(replay.success, true);
    assert.equal(replay.complete, true);
    assert.equal(replay.invalidatedCount, 0);
    assert.equal(replay.processedCount, 5);
    assert.equal(replay.remainingCount, 0);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
  });

  it('reports permanent blocking after a partial participant removal without rollback', async () => {
    const db = new MemoryDB();
    seedParticipantRemoval(db, 450);

    const blockOnSecondChunk = async (callIndex) => {
      if (callIndex === 1) {
        db.beforeTransaction = blockOnSecondChunk;
        return;
      }
      if (callIndex === 2) {
        db.setDocument('competition', 'c1', {
          ...db.snapshot('competition', 'c1').data(),
          status: 'drawing',
          draw_started_at: new Date(),
        });
      }
    };
    db.beforeTransaction = blockOnSecondChunk;

    const request = {
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'participant removal',
        requestId: 'req-partial-blocked',
      },
    };

    const first = await makeInvalidationHandler(db)(request);

    assert.equal(first.success, false);
    assert.equal(first.complete, false);
    assert.equal(first.hasMore, true);
    assert.equal(first.retryable, false);
    assert.equal(first.blocked, true);
    assert.equal(first.operationId, 'req-partial-blocked');
    assert.equal(first.invalidatedCount, 400);
    assert.equal(first.processedCount, 400);
    assert.equal(first.remainingCount, 50);
    assert.equal(first.chunksProcessed, 1);

    for (let index = 1; index <= 400; index++) {
      assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'invalid');
    }
    for (let index = 401; index <= 450; index++) {
      assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'active');
    }
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);

    const retry = await makeInvalidationHandler(db)(request);

    assert.equal(retry.success, false);
    assert.equal(retry.complete, false);
    assert.equal(retry.hasMore, true);
    assert.equal(retry.retryable, false);
    assert.equal(retry.blocked, true);
    assert.equal(retry.operationId, 'req-partial-blocked');
    assert.equal(retry.invalidatedCount, 0);
    assert.equal(retry.processedCount, 400);
    assert.equal(retry.remainingCount, 50);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
  });

  it('resumes safely after a later chunk fails', async () => {
    const db = new MemoryDB();
    seedParticipantRemoval(db, 450);

    let transactionCalls = 0;
    const failOnSecondChunk = async () => {
      transactionCalls += 1;
      if (transactionCalls === 2) {
        throw new Error('simulated chunk failure');
      }
      db.beforeTransaction = failOnSecondChunk;
    };
    db.beforeTransaction = failOnSecondChunk;

    const first = await makeInvalidationHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'participant removal',
        requestId: 'req-large-retry',
      },
    });

    assert.equal(first.success, false);
    assert.equal(first.complete, false);
    assert.equal(first.hasMore, true);
    assert.equal(first.retryable, true);
    assert.equal(first.invalidatedCount, 400);
    assert.equal(first.processedCount, 400);
    assert.equal(first.remainingCount, 50);
    assert.equal(first.chunksProcessed, 1);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
    for (let index = 1; index <= 400; index++) {
      assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'invalid');
    }
    for (let index = 401; index <= 450; index++) {
      assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'active');
    }

    const second = await makeInvalidationHandler(db)({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        reason: 'participant removal',
        requestId: 'req-large-retry',
      },
    });

    assert.equal(second.success, true);
    assert.equal(second.complete, true);
    assert.equal(second.hasMore, false);
    assert.equal(second.invalidatedCount, 50);
    assert.equal(second.processedCount, 450);
    assert.equal(second.remainingCount, 0);
    assert.equal(second.chunksProcessed, 1);
    for (let index = 1; index <= 450; index++) {
      assert.equal(db.snapshot('ticket', `t${index}`).data().status, 'invalid');
    }
    assert.equal(db.collectionStore('ticket_adjustments').size, 2);
    assert.equal(auditEvents(db).length, 2);
  });

  it('rejects winner tickets before any participant removal chunk is written', async () => {
    const db = new MemoryDB();
    const refs = seedParticipantRemoval(db, 10);
    db.setDocument('ticket', 'winner-ticket', {
      competition_id: refs.competitionRef,
      user_id: refs.userRef,
      order_id: refs.orderRef,
      ticket_number: 11,
      ticket_sequence: 'WINNER1',
      status: 'winner',
      is_winner: true,
      allocation_type: 'paid',
    });

    await assert.rejects(
      makeInvalidationHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          reason: 'participant removal',
          requestId: 'req-winner-participant',
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
  });

  it('rejects a participant removal after the draw has started', async () => {
    const db = new MemoryDB();
    const refs = seedParticipantRemoval(db, 10);
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      draw_started_at: new Date(),
    });

    await assert.rejects(
      makeInvalidationHandler(db)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          reason: 'participant removal',
          requestId: 'req-draw-participant',
        },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
    assert.equal(refs.orderRef.path, 'order/o1');
  });
});

describe('central audit persistence failure', () => {
  it('aborts the business transaction when the audit timestamp cannot be written', async () => {
    const db = new MemoryDB();
    seedOrderScenario(db, ['paid', 'paid']);
    let timestampCalls = 0;
    const failingAdmin = {
      firestore: {
        FieldValue: {
          serverTimestamp: () => {
            timestampCalls += 1;
            if (timestampCalls === 2) {
              throw new Error('audit timestamp failure');
            }
            return { __mockServerTimestamp: true };
          },
          increment: (value) => ({ __mockIncrement: value }),
          arrayUnion: (...values) => ({ __mockArrayUnion: values }),
          delete: () => ({ __mockDelete: true }),
        },
      },
    };

    await assert.rejects(
      makeIncreaseHandler(db, failingAdmin)({
        auth: { uid: 'admin1' },
        data: {
          userId: 'u1',
          competitionId: 'c1',
          orderId: 'o1',
          origin: 'paid',
          quantity: 1,
          reason: 'audit failure check',
          requestId: 'req-audit-failure',
        },
      }),
      /audit timestamp failure/
    );

    assert.equal(db.snapshot('competition', 'c1').data().sold_tickets, 2);
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
  });
});
