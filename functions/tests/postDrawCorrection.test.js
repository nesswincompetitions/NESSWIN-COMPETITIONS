import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  createCorrectCompetitionTicketsAfterDrawHandler,
  createInvalidateUserCompetitionTicketsHandler,
} from '../services/ticketInvalidationService.js';
import {
  createDecreaseUserCompetitionTicketsHandler,
  createIncreaseUserCompetitionTicketsHandler,
} from '../services/ticketAdjustmentService.js';
import { selectWinnerTransaction } from '../services/winnerWorkflowService.js';
import {
  ADMIN_AUDIT_COLLECTION,
  AUDIT_ACTIONS,
} from '../services/adminAuditService.js';

const NOW = Date.now();
const FUTURE_DRAW = new Date(NOW + 24 * 60 * 60 * 1000);
const PAST_DRAW = new Date(NOW - 60 * 60 * 1000);
const ADMIN_UID = 'admin1';
const USER_UID = 'u1';
const OTHER_USER_UID = 'u2';
const WINNER_UID = 'winnerUser';
const COMPETITION_ID = 'c1';

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

function seed(db, { status = 'winner_announced', competition = {}, extraTickets = [] } = {}) {
  const userRef = db.collection('user').doc(USER_UID);
  const otherUserRef = db.collection('user').doc(OTHER_USER_UID);
  const winnerUserRef = db.collection('user').doc(WINNER_UID);
  const adminRef = db.collection('user').doc(ADMIN_UID);
  const competitionRef = db.collection('competition').doc(COMPETITION_ID);
  const otherCompetitionRef = db.collection('competition').doc('c2');
  const orderRef = db.collection('order').doc('o1');
  const otherOrderRef = db.collection('order').doc('o2');
  const winnerOrderRef = db.collection('order').doc('oWinner');

  db.setDocument('user', USER_UID, {
    display_name: 'Participant',
    is_active: true,
    free_tickets: 0,
    total_tickets_bought: 2,
    total_spent: 20,
  });
  db.setDocument('user', OTHER_USER_UID, { display_name: 'Other Participant', is_active: true });
  db.setDocument('user', WINNER_UID, { display_name: 'Winner', is_active: true });
  db.setDocument('user', ADMIN_UID, { role: 'admin' });

  const baseCompetition = {
    title: 'Post Draw Competition',
    status,
    draw_date: PAST_DRAW,
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: 96,
    sold_tickets: 4,
    last_ticket_sequence: 4,
    participants: [userRef],
    winner_ref: winnerUserRef,
    winner_ticket_ref: db.collection('ticket').doc('winnerTicket'),
    handover_details: {
      is_contacted: true,
      prize_sent: true,
      handover_completed: status === 'completed',
    },
    restricted_participants: [],
    ...competition,
  };

  db.setDocument('competition', COMPETITION_ID, baseCompetition);
  db.setDocument('competition', 'c2', {
    ...baseCompetition,
    title: 'Other Competition',
    participants: [userRef],
  });

  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    is_winner: false,
    total_ticket: 2,
    paid_ticket: 2,
    total_amount: 20,
    currency: 'GBP',
  });
  db.setDocument('order', 'o2', {
    user_ref: otherUserRef,
    competition_id: competitionRef,
    status: 'paid',
    is_winner: false,
    total_ticket: 1,
    paid_ticket: 1,
    total_amount: 10,
    currency: 'GBP',
  });
  db.setDocument('order', 'oWinner', {
    user_ref: winnerUserRef,
    competition_id: competitionRef,
    status: 'paid',
    is_winner: true,
    total_ticket: 1,
    paid_ticket: 1,
    total_amount: 10,
    currency: 'GBP',
  });

  const defaultTickets = [
    {
      id: 't1',
      data: {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
        ticket_number: 1,
        ticket_sequence: 'C001',
        status: 'active',
        is_winner: false,
        allocation_type: 'paid',
      },
    },
    {
      id: 't2',
      data: {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
        ticket_number: 2,
        ticket_sequence: 'C002',
        status: 'active',
        is_winner: false,
        allocation_type: 'paid',
      },
    },
    {
      id: 'winnerTicket',
      data: {
        competition_id: competitionRef,
        user_id: winnerUserRef,
        order_id: winnerOrderRef,
        ticket_number: 4,
        ticket_sequence: 'C004',
        status: 'winner',
        is_winner: true,
        allocation_type: 'paid',
      },
    },
  ];

  [...defaultTickets, ...extraTickets].forEach(({ id, data }) => {
    db.setDocument('ticket', id, data);
  });

  return {
    userRef,
    otherUserRef,
    winnerUserRef,
    adminRef,
    competitionRef,
    otherCompetitionRef,
    orderRef,
    otherOrderRef,
    winnerOrderRef,
  };
}

function addTicket(db, refs, id, overrides = {}) {
  db.setDocument('ticket', id, {
    competition_id: refs.competitionRef,
    user_id: refs.userRef,
    order_id: refs.orderRef,
    ticket_number: 3,
    ticket_sequence: 'C003',
    status: 'active',
    is_winner: false,
    allocation_type: 'paid',
    ...overrides,
  });
}

function makeCorrectionHandler(db, admin = createMockAdmin()) {
  return createCorrectCompetitionTicketsAfterDrawHandler({
    db,
    admin,
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
  });
}

function makeRemovalHandler(db) {
  return createInvalidateUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
  });
}

function makeIncreaseHandler(db) {
  return createIncreaseUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
  });
}

function makeDecreaseHandler(db) {
  return createDecreaseUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
  });
}

function correctionRequest(overrides = {}) {
  return {
    auth: { uid: ADMIN_UID },
    data: {
      userId: USER_UID,
      competitionId: COMPETITION_ID,
      ticketIds: ['t1'],
      reason: 'Exceptional post-draw correction',
      requestId: 'req-post-draw-001',
      ...overrides,
    },
  };
}

function auditEvents(db) {
  return Array.from(db.collectionStore(ADMIN_AUDIT_COLLECTION).values());
}

function assertNoCorrectionWrites(db, ticketId = 't1', status = 'active') {
  assert.equal(db.snapshot('ticket', ticketId).data().status, status);
  assert.equal(db.collectionStore('ticket_adjustments').size, 0);
  assert.equal(auditEvents(db).length, 0);
}

describe('post-draw correction authorization', () => {
  it('rejects unauthenticated callers without writes', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      makeCorrectionHandler(db)({ data: correctionRequest().data }),
      (error) => error.code === 'unauthenticated'
    );

    assertNoCorrectionWrites(db);
  });

  it('rejects non-admin callers without writes', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      makeCorrectionHandler(db)({
        auth: { uid: USER_UID },
        data: correctionRequest().data,
      }),
      (error) => error.code === 'permission-denied'
    );

    assertNoCorrectionWrites(db);
  });

  it('allows an admin and ignores client-supplied actor identity', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await makeCorrectionHandler(db)(
      correctionRequest({
        actor_uid: 'attacker',
        actor_role: 'superadmin',
      })
    );

    assert.equal(result.success, true);
    assert.equal(result.invalidatedCount, 1);
    assert.equal(result.mode, 'post_draw_correction');
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');

    const event = auditEvents(db)[0];
    assert.equal(event.actor_uid, ADMIN_UID);
    assert.equal(event.actor_role, 'admin');
  });
});

describe('post-draw correction competition state', () => {
  it('allows winner_announced and completed', async () => {
    for (const status of ['winner_announced', 'completed']) {
      const db = new MemoryDB();
      seed(db, { status });

      const result = await makeCorrectionHandler(db)(
        correctionRequest({ requestId: `req-status-${status}` })
      );

      assert.equal(result.success, true, status);
      assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid', status);
    }
  });

  it('rejects every other status without writes', async () => {
    const rejected = [
      'drawing',
      'ready_to_draw',
      'active',
      'sold_out',
      'draft',
      'paused',
      'cancelled',
      'deleted',
      'end',
      'closed',
    ];

    for (const status of rejected) {
      const db = new MemoryDB();
      seed(db, { status });

      await assert.rejects(
        makeCorrectionHandler(db)(
          correctionRequest({ requestId: `req-rejected-${status}` })
        ),
        (error) => error.code === 'failed-precondition',
        status
      );

      assertNoCorrectionWrites(db);
    }
  });

  it('rejects draw_started_at without an allowed status', async () => {
    const db = new MemoryDB();
    seed(db, {
      status: 'active',
      competition: { draw_started_at: new Date(NOW) },
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({ requestId: 'req-stale-draw-start' })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assertNoCorrectionWrites(db);
  });
});

describe('post-draw correction ticket validation', () => {
  it('invalidates explicitly selected active tickets', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await makeCorrectionHandler(db)(
      correctionRequest({ ticketIds: ['t1', 't2'] })
    );

    assert.equal(result.invalidatedCount, 2);
    assert.deepEqual(result.ticketIds.sort(), ['t1', 't2']);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 'winnerTicket').data().status, 'winner');
  });

  it('rejects empty, duplicate, and oversized selections', async () => {
    const emptyDb = new MemoryDB();
    seed(emptyDb);
    await assert.rejects(
      makeCorrectionHandler(emptyDb)(correctionRequest({ ticketIds: [] })),
      (error) => error.code === 'invalid-argument'
    );
    assertNoCorrectionWrites(emptyDb);

    const duplicateDb = new MemoryDB();
    seed(duplicateDb);
    await assert.rejects(
      makeCorrectionHandler(duplicateDb)(
        correctionRequest({ ticketIds: ['t1', 't1'] })
      ),
      (error) => error.code === 'invalid-argument'
    );
    assertNoCorrectionWrites(duplicateDb);

    const oversizedDb = new MemoryDB();
    seed(oversizedDb);
    const oversized = Array.from({ length: 401 }, (_, index) => `ticket-${index}`);
    await assert.rejects(
      makeCorrectionHandler(oversizedDb)(
        correctionRequest({ ticketIds: oversized, requestId: 'req-oversized' })
      ),
      (error) => error.code === 'invalid-argument'
    );
    assertNoCorrectionWrites(oversizedDb);
  });

  it('rejects tickets belonging to another user or competition', async () => {
    const wrongUserDb = new MemoryDB();
    const wrongUserRefs = seed(wrongUserDb);
    addTicket(wrongUserDb, wrongUserRefs, 'otherUserTicket', {
      user_id: wrongUserRefs.otherUserRef,
      order_id: wrongUserRefs.otherOrderRef,
    });
    await assert.rejects(
      makeCorrectionHandler(wrongUserDb)(
        correctionRequest({ ticketIds: ['otherUserTicket'] })
      ),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(
      wrongUserDb.snapshot('ticket', 'otherUserTicket').data().status,
      'active'
    );

    const wrongCompetitionDb = new MemoryDB();
    const wrongCompetitionRefs = seed(wrongCompetitionDb);
    addTicket(wrongCompetitionDb, wrongCompetitionRefs, 'otherCompetitionTicket', {
      competition_id: wrongCompetitionRefs.otherCompetitionRef,
    });
    await assert.rejects(
      makeCorrectionHandler(wrongCompetitionDb)(
        correctionRequest({ ticketIds: ['otherCompetitionTicket'] })
      ),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(
      wrongCompetitionDb.snapshot('ticket', 'otherCompetitionTicket').data().status,
      'active'
    );
  });

  it('rejects inactive, winner-flagged, winner-status, and winning-order tickets', async () => {
    const cases = [
      {
        name: 'inactive',
        ticket: { status: 'invalid' },
      },
      {
        name: 'is-winner',
        ticket: { is_winner: true },
      },
      {
        name: 'winner-status',
        ticket: { status: 'winner' },
      },
      {
        name: 'winning-order',
        useWinnerOrder: true,
      },
    ];

    for (const testCase of cases) {
      const db = new MemoryDB();
      const refs = seed(db);
      addTicket(db, refs, 'targetTicket', {
        ...(testCase.useWinnerOrder ? { order_id: refs.winnerOrderRef } : {}),
        ...(testCase.ticket || {}),
      });

      await assert.rejects(
        makeCorrectionHandler(db)(
          correctionRequest({
            ticketIds: ['targetTicket'],
            requestId: `req-${testCase.name}`,
          })
        ),
        (error) => error.code === 'failed-precondition',
        testCase.name
      );

      assert.equal(
        db.snapshot('ticket', 'targetTicket').data().status,
        testCase.ticket?.status || 'active',
        testCase.name
      );
      assert.equal(db.collectionStore('ticket_adjustments').size, 0, testCase.name);
      assert.equal(auditEvents(db).length, 0, testCase.name);
    }
  });

  it('rejects the published winning ticket reference', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['winnerTicket'],
          requestId: 'req-winner-ticket',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 'winnerTicket').data().status, 'winner');
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
  });

  it('rejects a mixed valid and invalid selection without any writes', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    addTicket(db, refs, 'winningOrderTicket', {
      order_id: refs.winnerOrderRef,
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['t1', 'winningOrderTicket'],
          requestId: 'req-mixed-invalid',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.snapshot('ticket', 'winningOrderTicket').data().status, 'active');
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
  });
});

describe('post-draw correction order reference compatibility', () => {
  it('rejects a canonical order_id that points to a winning order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    addTicket(db, refs, 'canonicalWinningOrderTicket', {
      order_id: refs.winnerOrderRef,
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['canonicalWinningOrderTicket'],
          requestId: 'req-canonical-winning-order',
        })
      ),
      (error) =>
        error.code === 'failed-precondition' && /winning order/.test(error.message)
    );

    assertNoCorrectionWrites(db, 'canonicalWinningOrderTicket');
  });

  it('rejects a legacy order_ref that points to a winning order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    addTicket(db, refs, 'legacyWinningOrderTicket', {
      order_id: null,
      order_ref: refs.winnerOrderRef,
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['legacyWinningOrderTicket'],
          requestId: 'req-legacy-winning-order',
        })
      ),
      (error) =>
        error.code === 'failed-precondition' && /winning order/.test(error.message)
    );

    assertNoCorrectionWrites(db, 'legacyWinningOrderTicket');
  });

  it('allows a legacy order_ref that points to a non-winning order', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    addTicket(db, refs, 'legacyNonWinningOrderTicket', {
      order_id: null,
      order_ref: refs.orderRef,
    });

    const result = await makeCorrectionHandler(db)(
      correctionRequest({
        ticketIds: ['legacyNonWinningOrderTicket'],
        requestId: 'req-legacy-non-winning-order',
      })
    );

    assert.equal(result.success, true);
    assert.equal(result.invalidatedCount, 1);
    assert.equal(
      db.snapshot('ticket', 'legacyNonWinningOrderTicket').data().status,
      'invalid'
    );
    const adjustment = db.snapshot(
      'ticket_adjustments',
      'req-legacy-non-winning-order'
    ).data();
    assert.equal(adjustment.source, 'admin_post_draw_correction');
    assert.equal(adjustment.primary_order_ref.path, refs.orderRef.path);
    assert.equal(adjustment.result.mode, 'post_draw_correction');
  });

  it('rejects a mixed selection with a legacy winning-order ticket without partial writes', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    addTicket(db, refs, 'legacyWinningOrderTicket', {
      order_id: null,
      order_ref: refs.winnerOrderRef,
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['t1', 'legacyWinningOrderTicket'],
          requestId: 'req-mixed-legacy-winning-order',
        })
      ),
      (error) =>
        error.code === 'failed-precondition' && /winning order/.test(error.message)
    );

    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(
      db.snapshot('ticket', 'legacyWinningOrderTicket').data().status,
      'active'
    );
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
  });

  it('keeps canonical order_id behaviour unchanged', async () => {
    const db = new MemoryDB();
    const refs = seed(db);

    const result = await makeCorrectionHandler(db)(
      correctionRequest({
        ticketIds: ['t1'],
        requestId: 'req-canonical-unchanged',
      })
    );

    assert.equal(result.success, true);
    assert.equal(result.mode, 'post_draw_correction');
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    const adjustment = db.snapshot(
      'ticket_adjustments',
      'req-canonical-unchanged'
    ).data();
    assert.equal(adjustment.primary_order_ref.path, refs.orderRef.path);
    assert.equal(adjustment.result.mode, 'post_draw_correction');
  });

  it('rejects an order reference that cannot be resolved', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    addTicket(db, refs, 'malformedOrderReferenceTicket', {
      order_id: null,
      order_ref: {},
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['malformedOrderReferenceTicket'],
          requestId: 'req-malformed-order-reference',
        })
      ),
      (error) =>
        error.code === 'failed-precondition' &&
        /cannot be resolved/.test(error.message)
    );

    assertNoCorrectionWrites(db, 'malformedOrderReferenceTicket');
  });
});

describe('post-draw correction validation', () => {
  it('rejects a missing ticket ID without writes', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['missingTicket'],
          requestId: 'req-missing-ticket',
        })
      ),
      (error) =>
        error.code === 'failed-precondition' && /no longer exists/.test(error.message)
    );

    assertNoCorrectionWrites(db);
  });

  it('rejects a blank reason without writes', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          reason: '   ',
          requestId: 'req-blank-reason',
        })
      ),
      (error) => error.code === 'invalid-argument'
    );

    assertNoCorrectionWrites(db);
  });

  it('rejects a blank request ID without writes', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          requestId: '   ',
        })
      ),
      (error) => error.code === 'invalid-argument'
    );

    assertNoCorrectionWrites(db);
  });
});

describe('post-draw correction integrity', () => {
  it('preserves ticket identity and unrelated records', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('chats', 'winnerChat', {
      competition_ref: db.collection('competition').doc(COMPETITION_ID),
      chat_type: 'winner_chat',
      status: 'active',
    });
    db.setDocument('chats/winnerChat/messages', 'm1', {
      message: 'Congratulations!',
    });
    db.setDocument('ff_user_push_notifications', 'winner-congrats-c1', {
      notification_title: 'Congratulations, you won!',
    });
    db.setDocument('ff_push_notifications', 'winner-result-c1', {
      notification_title: 'Winner announced',
    });

    const competitionBefore = { ...db.snapshot('competition', COMPETITION_ID).data() };
    const orderBefore = { ...db.snapshot('order', 'o1').data() };
    const userBefore = { ...db.snapshot('user', USER_UID).data() };
    const chatBefore = { ...db.snapshot('chats', 'winnerChat').data() };
    const messageBefore = { ...db.snapshot('chats/winnerChat/messages', 'm1').data() };
    const userNotificationBefore = {
      ...db.snapshot('ff_user_push_notifications', 'winner-congrats-c1').data(),
    };
    const broadcastBefore = {
      ...db.snapshot('ff_push_notifications', 'winner-result-c1').data(),
    };
    const ticketBefore = { ...db.snapshot('ticket', 't1').data() };

    await makeCorrectionHandler(db)(
      correctionRequest({ ticketIds: ['t1', 't2'], requestId: 'req-integrity' })
    );

    assert.deepEqual(
      db.snapshot('competition', COMPETITION_ID).data(),
      competitionBefore
    );
    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
    assert.deepEqual(db.snapshot('user', USER_UID).data(), userBefore);
    assert.deepEqual(db.snapshot('chats', 'winnerChat').data(), chatBefore);
    assert.deepEqual(
      db.snapshot('chats/winnerChat/messages', 'm1').data(),
      messageBefore
    );
    assert.deepEqual(
      db.snapshot('ff_user_push_notifications', 'winner-congrats-c1').data(),
      userNotificationBefore
    );
    assert.deepEqual(
      db.snapshot('ff_push_notifications', 'winner-result-c1').data(),
      broadcastBefore
    );

    const ticketAfter = db.snapshot('ticket', 't1').data();
    assert.equal(ticketAfter.ticket_number, ticketBefore.ticket_number);
    assert.equal(ticketAfter.ticket_sequence, ticketBefore.ticket_sequence);
    assert.equal(ticketAfter.allocation_type, ticketBefore.allocation_type);
    assert.equal(ticketAfter.order_id.path, ticketBefore.order_id.path);
    assert.equal(ticketAfter.status, 'invalid');
    assert.equal(db.snapshot('ticket', 'winnerTicket').data().status, 'winner');
  });

  it('leaves ordinary post-draw removal, increase, and decrease blocked', async () => {
    const removalDb = new MemoryDB();
    seed(removalDb);
    await assert.rejects(
      makeRemovalHandler(removalDb)({
        auth: { uid: ADMIN_UID },
        data: {
          userId: USER_UID,
          competitionId: COMPETITION_ID,
          reason: 'Ordinary post-draw removal',
          requestId: 'req-ordinary-removal',
        },
      }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(removalDb.snapshot('ticket', 't1').data().status, 'active');

    const increaseDb = new MemoryDB();
    seed(increaseDb);
    await assert.rejects(
      makeIncreaseHandler(increaseDb)({
        auth: { uid: ADMIN_UID },
        data: {
          userId: USER_UID,
          competitionId: COMPETITION_ID,
          orderId: 'o1',
          origin: 'paid',
          quantity: 1,
          reason: 'Ordinary post-draw increase',
          requestId: 'req-ordinary-increase',
        },
      }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(increaseDb.snapshot('ticket', 't1').data().status, 'active');

    const decreaseDb = new MemoryDB();
    seed(decreaseDb);
    await assert.rejects(
      makeDecreaseHandler(decreaseDb)({
        auth: { uid: ADMIN_UID },
        data: {
          userId: USER_UID,
          competitionId: COMPETITION_ID,
          orderId: 'o1',
          origin: 'paid',
          quantity: 1,
          reason: 'Ordinary post-draw decrease',
          requestId: 'req-ordinary-decrease',
        },
      }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(decreaseDb.snapshot('ticket', 't1').data().status, 'active');
  });
});

describe('post-draw correction audit and idempotency', () => {
  it('writes complete detailed and central audit records', async () => {
    const db = new MemoryDB();
    seed(db);

    await makeCorrectionHandler(db)(
      correctionRequest({
        ticketIds: ['t1', 't2'],
        reason: 'Ticket allocation was duplicated',
        requestId: 'req-audit-complete',
      })
    );

    const adjustment = db.snapshot('ticket_adjustments', 'req-audit-complete').data();
    assert.equal(adjustment.operation, 'ticket_invalidation');
    assert.equal(adjustment.source, 'admin_post_draw_correction');
    assert.equal(adjustment.direction, 'decrease');
    assert.equal(adjustment.quantity, 2);
    assert.deepEqual(adjustment.ticket_ids.sort(), ['t1', 't2']);
    assert.equal(adjustment.reason, 'Ticket allocation was duplicated');
    assert.equal(adjustment.performed_by.path, `user/${ADMIN_UID}`);
    assert.equal(adjustment.actor_role, 'admin');
    assert.equal(adjustment.request_id, 'req-audit-complete');
    assert.equal(adjustment.payment_effect, 'none');
    assert.equal(adjustment.result.mode, 'post_draw_correction');
    assert.equal(adjustment.result.ticketStatusBefore, 'active');
    assert.equal(adjustment.result.ticketStatusAfter, 'invalid');

    const events = auditEvents(db);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.action, AUDIT_ACTIONS.TICKET_INVALIDATED);
    assert.equal(event.entity_type, 'ticket_adjustment');
    assert.equal(event.entity_id, 'req-audit-complete');
    assert.equal(event.actor_type, 'admin');
    assert.equal(event.actor_uid, ADMIN_UID);
    assert.equal(event.actor_role, 'admin');
    assert.equal(event.reason, 'Ticket allocation was duplicated');
    assert.equal(event.source, 'admin_post_draw_correction');
    assert.equal(event.correlation_id, 'req-audit-complete');
    assert.equal(event.related.adjustment_id, 'req-audit-complete');
    assert.equal(event.related.user_id, USER_UID);
    assert.equal(event.related.competition_id, COMPETITION_ID);
    assert.equal(event.after.quantity, 2);
    assert.equal(event.before.direction, 'decrease');
  });

  it('rolls back ticket updates when the central audit write fails', async () => {
    const db = new MemoryDB();
    seed(db);
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
      makeCorrectionHandler(db, failingAdmin)(
        correctionRequest({ requestId: 'req-audit-failure' })
      ),
      /audit timestamp failure/
    );

    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
  });

  it('replays the same request without duplicate writes', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeCorrectionHandler(db);
    const request = correctionRequest({ requestId: 'req-replay' });

    const first = await handler(request);
    const second = await handler(request);

    assert.equal(first.invalidatedCount, 1);
    assert.equal(second.invalidatedCount, 1);
    assert.equal(second.idempotentReplay, true);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
  });

  it('rejects mismatched request-ID reuse', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeCorrectionHandler(db);

    await handler(correctionRequest({ requestId: 'req-mismatch' }));

    await assert.rejects(
      handler(
        correctionRequest({
          requestId: 'req-mismatch',
          ticketIds: ['t2'],
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
    assert.equal(db.snapshot('ticket', 't2').data().status, 'active');
  });

  it('rejects participant-removal chunk-zero request-ID collisions', async () => {
    const db = new MemoryDB();
    seed(db, {
      status: 'active',
      competition: {
        draw_date: FUTURE_DRAW,
        winner_ref: null,
        winner_ticket_ref: null,
        handover_details: {},
      },
    });
    const requestId = 'req-cross-participant';

    await makeRemovalHandler(db)({
      auth: { uid: ADMIN_UID },
      data: {
        userId: USER_UID,
        competitionId: COMPETITION_ID,
        reason: 'Participant removal before draw',
        requestId,
      },
    });

    db.setDocument('competition', COMPETITION_ID, {
      ...db.snapshot('competition', COMPETITION_ID).data(),
      status: 'winner_announced',
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({ requestId, ticketIds: ['t1'] })
      ),
      (error) => error.code === 'failed-precondition'
    );
  });

  it('rejects a request ID already used by another unsuffixed adjustment', async () => {
    const db = new MemoryDB();
    seed(db, {
      status: 'active',
      competition: {
        draw_date: FUTURE_DRAW,
        winner_ref: null,
        winner_ticket_ref: null,
        handover_details: {},
      },
    });
    const requestId = 'req-cross-selected';

    await makeRemovalHandler(db)({
      auth: { uid: ADMIN_UID },
      data: {
        userId: USER_UID,
        competitionId: COMPETITION_ID,
        ticketIds: ['t2'],
        reason: 'Selected invalidation before draw',
        requestId,
      },
    });

    db.setDocument('competition', COMPETITION_ID, {
      ...db.snapshot('competition', COMPETITION_ID).data(),
      status: 'winner_announced',
    });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({ requestId, ticketIds: ['t1'] })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
  });

  it('serializes concurrent identical operations without duplicate changes', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeCorrectionHandler(db);
    const request = correctionRequest({ requestId: 'req-concurrent' });

    const results = await Promise.allSettled([handler(request), handler(request)]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    assert.equal(db.collectionStore('ticket_adjustments').size, 1);
    assert.equal(auditEvents(db).length, 1);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
  });
});

describe('post-draw correction draw race', () => {
  it('does not allow winner selection to select an invalidated ticket', async () => {
    const db = new MemoryDB();
    seed(db, {
      status: 'drawing',
      competition: {
        winner_ref: null,
        winner_ticket_ref: null,
        handover_details: {},
      },
    });
    db.setDocument('ticket', 't1', {
      ...db.snapshot('ticket', 't1').data(),
      status: 'invalid',
    });

    await assert.rejects(
      db.runTransaction(async (transaction) =>
        selectWinnerTransaction(transaction, {
          competitionRef: db.collection('competition').doc(COMPETITION_ID),
          competitionId: COMPETITION_ID,
          ticketSequence: 'C001',
          adminRef: db.collection('user').doc(ADMIN_UID),
          database: db,
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('competition', COMPETITION_ID).data().winner_ref, null);
  });

  it('does not allow correction to invalidate a published winning ticket', async () => {
    const db = new MemoryDB();
    seed(db, { status: 'winner_announced' });

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['winnerTicket'],
          requestId: 'req-race-winner',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('ticket', 'winnerTicket').data().status, 'winner');
    assert.equal(db.snapshot('ticket', 'winnerTicket').data().is_winner, true);
    assert.equal(db.snapshot('order', 'oWinner').data().is_winner, true);
  });

  it('retries and rejects when a selected order becomes a winning order after it was read', async () => {
    const db = new MemoryDB();
    seed(db);
    let injected = false;
    db.afterTransactionRead = async (ref) => {
      if (ref.path === 'order/o1' && !injected) {
        injected = true;
        db.setDocument('order', 'o1', {
          ...db.snapshot('order', 'o1').data(),
          is_winner: true,
        });
      }
    };

    await assert.rejects(
      makeCorrectionHandler(db)(
        correctionRequest({
          ticketIds: ['t1'],
          requestId: 'req-race-order-winner',
        })
      ),
      (error) =>
        error.code === 'failed-precondition' && /winning order/.test(error.message)
    );

    assert.equal(injected, true);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.equal(auditEvents(db).length, 0);
  });
});
