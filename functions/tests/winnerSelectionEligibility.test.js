import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDB } from './helpers/memoryFirestore.js';
import { admin } from '../config/firebaseAdmin.js';
import { selectWinnerTransaction } from '../services/winnerWorkflowService.js';

const COMPETITION_ID = 'c1';
const USER_ID = 'u1';
const ADMIN_ID = 'admin1';
const referenceDb = admin.firestore();

function seedWorld({
  competition = {},
  user = {},
  order = {},
  ticket = {},
} = {}) {
  const db = new MemoryDB();
  const competitionRef = db.collection('competition').doc(COMPETITION_ID);
  const userRef = referenceDb.collection('user').doc(USER_ID);
  const orderRef = referenceDb.collection('order').doc('o1');
  const adminRef = db.collection('user').doc(ADMIN_ID);

  db.setDocument('user', ADMIN_ID, { role: 'admin', is_active: true });
  db.setDocument('competition', COMPETITION_ID, {
    title: 'Eligibility Competition',
    status: 'drawing',
    image: [],
    ...competition,
  });

  if (user !== null) {
    db.setDocument('user', USER_ID, { is_active: true, ...user });
  }

  if (order !== null) {
    db.setDocument('order', 'o1', {
      competition_id: competitionRef,
      user_ref: userRef,
      status: 'paid',
      ...order,
    });
  }

  if (ticket !== null) {
    db.setDocument('ticket', 't1', {
      competition_id: competitionRef,
      user_id: userRef,
      order_id: orderRef,
      ticket_number: 1,
      ticket_sequence: 'C1O001',
      status: 'active',
      is_winner: false,
      ...ticket,
    });
  }

  return { db, competitionRef, userRef, orderRef, adminRef };
}

function selectWinner(db, { competitionId = COMPETITION_ID, sequence = 'C1O001' } = {}) {
  return db.runTransaction((transaction) =>
    selectWinnerTransaction(transaction, {
      competitionRef: db.collection('competition').doc(competitionId),
      competitionId,
      ticketSequence: sequence,
      adminRef: db.collection('user').doc(ADMIN_ID),
      database: db,
    })
  );
}

function assertRejectedWith(promise, pattern, code = 'failed-precondition') {
  return assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    assert.match(error.message, pattern);
    return true;
  });
}

function assertNoWinnerWritten(db) {
  const competition = db.snapshot('competition', COMPETITION_ID).data();
  assert.equal(competition.winner_ref, undefined);
  assert.equal(competition.winner_ticket_ref, undefined);
  assert.equal(competition.status, 'drawing');

  const ticket = db.snapshot('ticket', 't1').data();
  assert.equal(ticket.is_winner, false);
}

describe('winner selection eligibility', () => {
  it('selects a valid active ticket owned by an eligible user', async () => {
    const { db } = seedWorld();

    const result = await selectWinner(db);

    assert.equal(result.winnerUserId, USER_ID);
    assert.equal(result.winnerTicketId, 't1');

    const competition = db.snapshot('competition', COMPETITION_ID).data();
    const ticket = db.snapshot('ticket', 't1').data();
    const order = db.snapshot('order', 'o1').data();

    assert.equal(competition.status, 'winner_announced');
    assert.equal(competition.winner_ref.path, `user/${USER_ID}`);
    assert.equal(competition.winner_ticket_ref.path, 'ticket/t1');
    assert.equal(ticket.status, 'winner');
    assert.equal(ticket.is_winner, true);
    assert.equal(order.is_winner, true);
  });

  it('resolves legacy string user and order references', async () => {
    const { db } = seedWorld({
      ticket: { user_id: '/user/u1', user_ref: null, order_id: 'order/o1' },
    });

    const result = await selectWinner(db);

    assert.equal(result.winnerUserId, USER_ID);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'winner');
  });

  it('supports historically used ticket user reference formats', async () => {
    const formats = [
      () => ({ user_id: 'u1', user_ref: null, user: null }),
      () => ({ user_id: 'user/u1', user_ref: null, user: null }),
      () => ({ user_id: '/user/u1', user_ref: null, user: null }),
      (world) => ({ user_id: null, user_ref: world.userRef, user: null }),
      (world) => ({ user_id: null, user_ref: null, user: world.userRef }),
      (world) => ({ user_id: world.userRef, user_ref: null, user: null }),
    ];

    for (const buildTicket of formats) {
      const world = seedWorld();
      world.db.setDocument('ticket', 't1', {
        ...world.db.snapshot('ticket', 't1').data(),
        ...buildTicket(world),
      });

      const result = await selectWinner(world.db);
      assert.equal(result.winnerUserId, USER_ID);
    }
  });

  it('supports historically used ticket order reference formats', async () => {
    const formats = [
      () => ({ order_id: 'o1', order_ref: null }),
      () => ({ order_id: 'order/o1', order_ref: null }),
      () => ({ order_id: '/order/o1', order_ref: null }),
      (world) => ({ order_id: world.orderRef, order_ref: null }),
      (world) => ({ order_id: null, order_ref: world.orderRef }),
    ];

    for (const buildTicket of formats) {
      const world = seedWorld();
      world.db.setDocument('ticket', 't1', {
        ...world.db.snapshot('ticket', 't1').data(),
        ...buildTicket(world),
      });

      const result = await selectWinner(world.db);
      assert.equal(result.winnerTicketId, 't1');
    }
  });

  it('supports historically used competition reference formats', async () => {
    for (const competitionId of [
      COMPETITION_ID,
      `competition/${COMPETITION_ID}`,
      `/competition/${COMPETITION_ID}`,
    ]) {
      const { db } = seedWorld({ ticket: { competition_id: competitionId } });
      const result = await selectWinner(db);
      assert.equal(result.competitionId, COMPETITION_ID);
      assert.equal(result.winnerTicketId, 't1');
    }
  });

  it('keeps the duplicate-sequence integrity check across reference formats', async () => {
    const { db, competitionRef } = seedWorld({
      ticket: { competition_id: COMPETITION_ID },
    });
    db.setDocument('ticket', 't2', {
      ...db.snapshot('ticket', 't1').data(),
      competition_id: competitionRef,
    });

    await assertRejectedWith(selectWinner(db), /Multiple tickets/i);
    assertNoWinnerWritten(db);
    assert.equal(db.snapshot('ticket', 't2').data().is_winner, false);
  });

  it('allows a legacy user document without eligibility flags', async () => {
    const { db } = seedWorld();
    db.setDocument('user', USER_ID, { display_name: 'Legacy User' });

    const result = await selectWinner(db);
    assert.equal(result.winnerUserId, USER_ID);
  });

  it('supports legacy active ticket status representations', async () => {
    for (const status of [undefined, '', 'active', 'ACTIVE']) {
      const { db } = seedWorld({ ticket: { status } });
      const result = await selectWinner(db);
      assert.equal(result.winnerUserId, USER_ID);
    }
  });

  it('supports legacy paid order status casing', async () => {
    for (const status of ['paid', 'Paid', 'PAID']) {
      const { db } = seedWorld({ order: { status } });
      const result = await selectWinner(db);
      assert.equal(result.winnerUserId, USER_ID);
    }
  });

  it('supports historically used participant restriction representations', async () => {
    const formats = [
      () => USER_ID,
      () => `/user/${USER_ID}`,
      () => `user/${USER_ID}`,
      (world) => world.userRef,
    ];

    for (const buildRestrictedValue of formats) {
      const world = seedWorld();
      world.db.setDocument('competition', COMPETITION_ID, {
        ...world.db.snapshot('competition', COMPETITION_ID).data(),
        restricted_participants: [buildRestrictedValue(world)],
      });

      await assertRejectedWith(
        selectWinner(world.db),
        /removed from this competition/i
      );
      assertNoWinnerWritten(world.db);
    }
  });

  it('allows a pre-ticket-management ticket with legacy references and missing status', async () => {
    const { db } = seedWorld({
      competition: {},
      user: { is_active: undefined },
      order: { status: 'Paid' },
      ticket: {
        competition_id: `competition/${COMPETITION_ID}`,
        user_id: `/user/${USER_ID}`,
        user_ref: null,
        user: null,
        order_id: 'order/o1',
        order_ref: null,
        status: undefined,
        allocation_type: undefined,
      },
    });

    const result = await selectWinner(db);

    assert.equal(result.winnerUserId, USER_ID);
    assert.equal(result.winnerTicketSequence, 'C1O001');
    assert.equal(db.snapshot('ticket', 't1').data().status, 'winner');
  });

  it('rejects a plain user reference-like object', async () => {
    const world = seedWorld();
    world.db.setDocument('ticket', 't1', {
      ...world.db.snapshot('ticket', 't1').data(),
      user_id: { path: 'user/u1', id: 'u1' },
      user_ref: null,
      user: null,
    });

    await assertRejectedWith(selectWinner(world.db), /valid user reference/i);
    assertNoWinnerWritten(world.db);
  });

  it('rejects a plain order reference-like object', async () => {
    const world = seedWorld();
    world.db.setDocument('ticket', 't1', {
      ...world.db.snapshot('ticket', 't1').data(),
      order_id: { path: 'order/o1', id: 'o1' },
      order_ref: null,
    });

    await assertRejectedWith(selectWinner(world.db), /valid order reference/i);
    assertNoWinnerWritten(world.db);
  });

  it('rejects reference-like objects with missing or malformed properties', async () => {
    const malformed = [
      { path: 'user/u1' },
      { id: 'u1' },
      { path: 'user/u1', id: 1 },
      { path: null, id: 'u1' },
    ];

    for (const userReference of malformed) {
      const world = seedWorld();
      world.db.setDocument('ticket', 't1', {
        ...world.db.snapshot('ticket', 't1').data(),
        user_id: userReference,
        user_ref: null,
        user: null,
      });

      await assertRejectedWith(selectWinner(world.db), /valid user reference/i);
      assertNoWinnerWritten(world.db);
    }
  });

  it('accepts genuine Firestore DocumentReferences', async () => {
    const world = seedWorld();

    assert.equal(world.userRef instanceof admin.firestore.DocumentReference, true);
    assert.equal(world.orderRef instanceof admin.firestore.DocumentReference, true);

    const result = await selectWinner(world.db);
    assert.equal(result.winnerUserId, USER_ID);
    assert.equal(result.winnerTicketId, 't1');
  });

  it('rejects malformed user references through controlled validation', async () => {
    const malformed = [
      (world) => world.orderRef,
      () => ({ path: 'user/u1', id: 'u1' }),
      () => ({ path: 'order/o1', id: 'o1' }),
      () => ({ path: 'user/u1/extra', id: 'extra' }),
      () => ({ path: 'user/', id: '' }),
      () => ({ path: 'user/   ', id: '   ' }),
      () => ({ path: 'user/u1' }),
      () => ({ id: 'u1' }),
      () => ({ path: 'user/u1', id: 1 }),
      () => 'order/o1',
      () => 'users/u1',
      () => 'user/u1/extra',
      () => 'user/',
      () => 'user/   ',
      () => '/u1',
      () => '//user/u1',
      () => 'user//u1',
      () => '',
      () => '   ',
      () => '/',
    ];

    for (const buildUserReference of malformed) {
      const world = seedWorld();
      world.db.setDocument('ticket', 't1', {
        ...world.db.snapshot('ticket', 't1').data(),
        user_id: buildUserReference(world),
        user_ref: null,
        user: null,
      });

      await assertRejectedWith(selectWinner(world.db), /valid user reference/i);
      assertNoWinnerWritten(world.db);
    }
  });

  it('rejects malformed order references through controlled validation', async () => {
    const malformed = [
      (world) => world.userRef,
      () => ({ path: 'order/o1', id: 'o1' }),
      () => ({ path: 'user/u1', id: 'u1' }),
      () => ({ path: 'order/o1/extra', id: 'extra' }),
      () => ({ path: 'order/', id: '' }),
      () => ({ path: 'order/   ', id: '   ' }),
      () => ({ path: 'order/o1' }),
      () => ({ id: 'o1' }),
      () => ({ path: 'order/o1', id: 1 }),
      () => 'user/u1',
      () => 'orders/o1',
      () => 'order/o1/extra',
      () => 'order/',
      () => 'order/   ',
      () => '/o1',
      () => '//order/o1',
      () => 'order//o1',
      () => '',
      () => '   ',
      () => '/',
    ];

    for (const buildOrderReference of malformed) {
      const world = seedWorld();
      world.db.setDocument('ticket', 't1', {
        ...world.db.snapshot('ticket', 't1').data(),
        order_id: buildOrderReference(world),
        order_ref: null,
      });

      await assertRejectedWith(selectWinner(world.db), /valid order reference/i);
      assertNoWinnerWritten(world.db);
    }
  });

  it('rejects invalidated and cancelled tickets', async () => {
    for (const status of ['invalid', 'cancelled', ' INVALID ', 'CANCELLED']) {
      const { db } = seedWorld({ ticket: { status } });
      await assertRejectedWith(selectWinner(db), /invalid/i);
      assertNoWinnerWritten(db);
    }
  });

  it('rejects an active ticket belonging to a removed participant', async () => {
    const { db } = seedWorld({
      competition: { restricted_participants: [`user/${USER_ID}`] },
    });

    await assertRejectedWith(selectWinner(db), /removed from this competition/i);
    assertNoWinnerWritten(db);
  });

  it('rejects a ticket owned by a suspended user', async () => {
    const { db } = seedWorld({ user: { is_active: false } });

    await assertRejectedWith(selectWinner(db), /not eligible to win/i);
    assertNoWinnerWritten(db);
  });

  it('rejects a ticket owned by a deleted or deleting user', async () => {
    for (const user of [
      { is_deleted: true },
      { status: 'deleting' },
      { status: 'deleted', is_deleted: true, is_active: false },
    ]) {
      const { db } = seedWorld({ user });
      await assertRejectedWith(selectWinner(db), /not eligible to win/i);
      assertNoWinnerWritten(db);
    }
  });

  it('rejects a ticket without a valid user reference', async () => {
    const { db } = seedWorld({
      ticket: { user_id: null, user_ref: null, user: null },
    });

    await assertRejectedWith(selectWinner(db), /valid user reference/i);
    assertNoWinnerWritten(db);
  });

  it('rejects a ticket whose user document does not exist', async () => {
    const { db } = seedWorld({ user: null });

    await assertRejectedWith(selectWinner(db), /user was not found/i, 'not-found');
    assertNoWinnerWritten(db);
  });

  it('rejects a ticket from another competition', async () => {
    const { db, competitionRef } = seedWorld();
    const otherCompetitionRef = db.collection('competition').doc('c2');
    db.setDocument('competition', 'c2', { status: 'drawing' });
    db.setDocument('ticket', 't1', {
      ...db.snapshot('ticket', 't1').data(),
      competition_id: otherCompetitionRef,
    });

    await assertRejectedWith(selectWinner(db, { competitionId: COMPETITION_ID }), /No ticket matches/i, 'not-found');
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().winner_ref,
      undefined
    );
    assert.equal(db.snapshot('competition', 'c2').data().winner_ref, undefined);
    assert.notEqual(competitionRef.path, otherCompetitionRef.path);
  });

  it('rejects an unpaid or otherwise ineligible order', async () => {
    for (const order of [
      { status: 'pending' },
      { status: 'failed' },
      { status: 'Refunded' },
      { status: undefined },
    ]) {
      const { db } = seedWorld({ order });
      await assertRejectedWith(selectWinner(db), /order must be paid/i);
      assertNoWinnerWritten(db);
    }
  });

  it('does not replace an already announced winner', async () => {
    const announced = {
      competition: {
        status: 'winner_announced',
        winner_ref: `user/${USER_ID}`,
        winner_ticket_ref: 'ticket/t1',
      },
    };
    const { db } = seedWorld(announced);
    await assertRejectedWith(selectWinner(db), /winner has already been selected/i);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().winner_ref,
      `user/${USER_ID}`
    );

    const ticketOnly = seedWorld({
      competition: { winner_ticket_ref: 'ticket/t1' },
    });
    await assertRejectedWith(
      selectWinner(ticketOnly.db),
      /winner has already been selected/i
    );
    assert.equal(
      ticketOnly.db.snapshot('competition', COMPETITION_ID).data().winner_ticket_ref,
      'ticket/t1'
    );
  });
});

describe('winner selection concurrency guards', () => {
  it('retries and rejects when the ticket is invalidated after it was read', async () => {
    const { db } = seedWorld();
    let injected = false;
    db.afterTransactionRead = async (ref) => {
      if (ref.path === 'ticket/t1' && !injected) {
        injected = true;
        db.setDocument('ticket', 't1', {
          ...db.snapshot('ticket', 't1').data(),
          status: 'invalid',
        });
      }
    };

    await assertRejectedWith(selectWinner(db), /invalid/i);
    assert.equal(injected, true);
    assertNoWinnerWritten(db);
  });

  it('retries and rejects when participant removal commits after the competition read', async () => {
    const { db } = seedWorld();
    let injected = false;
    db.afterTransactionRead = async (ref) => {
      if (ref.path === `competition/${COMPETITION_ID}` && !injected) {
        injected = true;
        db.setDocument('competition', COMPETITION_ID, {
          ...db.snapshot('competition', COMPETITION_ID).data(),
          restricted_participants: [`user/${USER_ID}`],
        });
      }
    };

    await assertRejectedWith(selectWinner(db), /removed from this competition/i);
    assert.equal(injected, true);
    assertNoWinnerWritten(db);
  });

  it('retries and rejects when the user is suspended after being read', async () => {
    const { db } = seedWorld();
    let injected = false;
    db.afterTransactionRead = async (ref) => {
      if (ref.path === `user/${USER_ID}` && !injected) {
        injected = true;
        db.setDocument('user', USER_ID, {
          ...db.snapshot('user', USER_ID).data(),
          is_active: false,
        });
      }
    };

    await assertRejectedWith(selectWinner(db), /not eligible to win/i);
    assert.equal(injected, true);
    assertNoWinnerWritten(db);
  });
});
