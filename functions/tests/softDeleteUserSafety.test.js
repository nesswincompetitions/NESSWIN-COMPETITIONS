import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
} from './helpers/memoryFirestore.js';
import { createSoftDeleteUserHandler } from '../services/userDeletionService.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);

function makeHandler(db, admin = createMockAdmin()) {
  return {
    admin,
    handler: createSoftDeleteUserHandler({
      db,
      admin,
      HttpsError: MockHttpsError,
    }),
  };
}

function seed(db) {
  const userRef = db.collection('user').doc('u1');
  const activeRef = db.collection('competition').doc('cActive');
  const frozenRef = db.collection('competition').doc('cFrozen');
  const wonRef = db.collection('competition').doc('cWon');

  db.setDocument('user', 'u1', {
    display_name: 'Test User',
    email: 'user@example.com',
    is_active: true,
    free_tickets: 1,
  });
  db.setDocument('competition', 'cActive', {
    status: 'active',
    draw_date: FUTURE_DRAW,
  });
  db.setDocument('competition', 'cFrozen', {
    status: 'drawing',
    draw_date: FUTURE_DRAW,
  });
  db.setDocument('competition', 'cWon', {
    status: 'winner_announced',
    draw_date: FUTURE_DRAW,
    winner_ref: userRef,
    winner_ticket_ref: db.collection('ticket').doc('tWinnerComp'),
  });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    customer_name: 'Test User',
    customer_email: 'user@example.com',
    status: 'paid',
  });

  const ticket = (id, competitionRef, status, isWinner = false, allocationType = undefined) => {
    db.setDocument('ticket', id, {
      user_id: userRef,
      competition_id: competitionRef,
      order_id: db.collection('order').doc('o1'),
      ticket_number: 1,
      ticket_sequence: `T-${id}`,
      status,
      is_winner: isWinner,
      ...(allocationType ? { allocation_type: allocationType } : {}),
    });
  };

  ticket('tSafe', activeRef, 'active', false, 'paid');
  ticket('tLegacyMissing', activeRef, undefined);
  ticket('tCancelled', activeRef, 'cancelled');
  ticket('tAlreadyInvalid', activeRef, 'invalid');
  ticket('tWinner', frozenRef, 'winner', true);
  ticket('tFrozen', frozenRef, 'active');
  ticket('tWinnerComp', wonRef, 'active');

  return { userRef };
}

describe('softDeleteUser ticket safety', () => {
  it('invalidates safe active tickets and preserves winners, frozen states, and historical statuses', async () => {
    const db = new MemoryDB();
    seed(db);
    const { admin, handler } = makeHandler(db);

    const result = await handler({ auth: { uid: 'u1' } });

    assert.equal(result.success, true);
    assert.equal(result.ticketsInvalidated, 2);
    assert.equal(result.ticketsPreserved, 5);
    assert.deepEqual(admin.deletedAuthUsers, ['u1']);

    for (const id of ['tSafe', 'tLegacyMissing']) {
      const ticket = db.snapshot('ticket', id).data();
      assert.equal(ticket.status, 'invalid');
      assert.equal(ticket.invalidation_reason, 'account_deletion');
      assert.equal(ticket.invalidation_source, 'account_deletion');
      assert.equal(ticket.status_before_invalidation, 'active');
      assert.equal(ticket.invalidated_by.path, 'user/u1');
      assert.equal(ticket.invalidated_at.__mockServerTimestamp, true);
    }

    assert.equal(db.snapshot('ticket', 'tWinner').data().status, 'winner');
    assert.equal(db.snapshot('ticket', 'tFrozen').data().status, 'active');
    assert.equal(db.snapshot('ticket', 'tWinnerComp').data().status, 'active');
    assert.equal(db.snapshot('ticket', 'tCancelled').data().status, 'cancelled');
    assert.equal(db.snapshot('ticket', 'tAlreadyInvalid').data().status, 'invalid');

    const audits = Array.from(db.collectionStore('ticket_adjustments').entries());
    assert.equal(audits.length, 2);
    for (const [id, audit] of audits) {
      assert.equal(audit.source, 'account_deletion');
      assert.equal(audit.actor_role, 'user');
      assert.equal(audit.performed_by.path, 'user/u1');
      assert.equal(audit.payment_effect, 'none');
      assert.equal(audit.ticket_origins.length, audit.ticket_ids.length);
      assert.equal(audit.ticket_origins.length, 1);
      assert.deepEqual(audit.origin_breakdown, { [audit.ticket_origins[0]]: 1 });
      assert.equal(audit.request_id, id);
    }
    assert.deepEqual(
      audits.map(([, audit]) => audit.ticket_origins[0]).sort(),
      ['legacy_unknown', 'paid']
    );
    assert.equal(db.snapshot('ticket', 'tSafe').data().allocation_type, 'paid');
    assert.equal(db.snapshot('ticket', 'tLegacyMissing').data().allocation_type, undefined);

    const user = db.snapshot('user', 'u1').data();
    assert.equal(user.is_deleted, true);
    assert.equal(user.is_active, false);
    assert.equal(user.display_name, 'Anonymous');
    assert.equal(user.phone_number, undefined);

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.customer_name, 'Anonymous');
    assert.equal(order.customer_email, 'deleted_u1@nesswin.com');
  });

  it('preserves a winner ticket even when its competition is otherwise active', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('competition', 'cActive', {
      ...db.snapshot('competition', 'cActive').data(),
      winner_ref: db.collection('user').doc('u1'),
    });

    const { handler } = makeHandler(db);
    const result = await handler({ auth: { uid: 'u1' } });

    assert.equal(result.ticketsInvalidated, 0);
    assert.equal(db.snapshot('ticket', 'tSafe').data().status, 'active');
    assert.equal(db.snapshot('ticket', 'tLegacyMissing').data().status, undefined);
  });

  it('keeps the account in a deleting state when the final auth deletion fails', async () => {
    const db = new MemoryDB();
    seed(db);
    const admin = createMockAdmin();
    admin.auth = () => ({
      deleteUser: async () => {
        throw new Error('auth deletion failed');
      },
    });
    const { handler } = makeHandler(db, admin);

    await assert.rejects(
      handler({ auth: { uid: 'u1' } }),
      (error) => error.code === 'internal'
    );

    const user = db.snapshot('user', 'u1').data();
    assert.equal(db.snapshot('ticket', 'tSafe').data().status, 'invalid');
    assert.equal(user.status, 'deleting');
    assert.equal(user.is_deleted, undefined);
    assert.equal(user.is_active, true);
    assert.equal(user.display_name, 'Test User');
    assert.equal(user.email, 'user@example.com');
    assert.equal(db.snapshot('order', 'o1').data().customer_name, 'Anonymous');
  });

  it('resumes safely after auth deletion fails without duplicating ticket audit', async () => {
    const db = new MemoryDB();
    seed(db);
    let deleteAttempts = 0;
    const admin = createMockAdmin();
    admin.auth = () => ({
      deleteUser: async (uid) => {
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          const error = new Error('temporary auth failure');
          error.code = 'auth/network-request-failed';
          throw error;
        }
        admin.deletedAuthUsers.push(uid);
      },
    });
    const { handler } = makeHandler(db, admin);

    await assert.rejects(
      handler({ auth: { uid: 'u1' } }),
      (error) => error.code === 'internal'
    );

    const firstAudit = db.snapshot('ticket', 'tSafe').data().invalidated_at;
    const firstAdjustmentCount = db.collectionStore('ticket_adjustments').size;
    assert.equal(db.snapshot('user', 'u1').data().status, 'deleting');
    assert.equal(db.snapshot('user', 'u1').data().is_active, true);

    const second = await handler({ auth: { uid: 'u1' } });

    assert.equal(second.success, true);
    assert.equal(db.collectionStore('ticket_adjustments').size, firstAdjustmentCount);
    assert.equal(second.ticketsInvalidated, 0);
    assert.equal(deleteAttempts, 2);
    assert.deepEqual(admin.deletedAuthUsers, ['u1']);
    assert.equal(db.snapshot('ticket', 'tSafe').data().invalidated_at, firstAudit);
    assert.equal(db.snapshot('user', 'u1').data().is_active, false);
    assert.equal(db.snapshot('user', 'u1').data().is_deleted, true);
    assert.equal(db.snapshot('user', 'u1').data().status, 'deleted');
  });

  it('handles supported legacy ticket and order user reference formats', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('ticket', 'tLegacyPath', {
      user_id: '/user/u1',
      competition_id: db.collection('competition').doc('cActive'),
      order_id: db.collection('order').doc('o1'),
      ticket_number: 2,
      ticket_sequence: 'T-LegacyPath',
      status: 'active',
      is_winner: false,
    });
    db.setDocument('order', 'oLegacy', {
      user_ref: '/user/u1',
      customer_name: 'Legacy User',
      customer_email: 'legacy@example.com',
      status: 'paid',
    });
    const { handler } = makeHandler(db);

    const result = await handler({ auth: { uid: 'u1' } });

    assert.equal(result.success, true);
    assert.equal(result.ticketsInvalidated, 3);
    assert.equal(db.snapshot('ticket', 'tLegacyPath').data().status, 'invalid');
    assert.equal(
      db.snapshot('ticket_adjustments', 'account_deletion_u1_tLegacyPath').data().source,
      'account_deletion'
    );
    assert.equal(db.snapshot('order', 'oLegacy').data().customer_name, 'Anonymous');
    assert.equal(
      db.snapshot('order', 'oLegacy').data().customer_email,
      'deleted_u1@nesswin.com'
    );
  });

  it('is idempotent when executed again after a completed deletion', async () => {
    const db = new MemoryDB();
    seed(db);
    let deleteAttempts = 0;
    const admin = createMockAdmin();
    admin.auth = () => ({
      deleteUser: async (uid) => {
        deleteAttempts += 1;
        if (deleteAttempts > 1) {
          const error = new Error('auth user not found');
          error.code = 'auth/user-not-found';
          throw error;
        }
        admin.deletedAuthUsers.push(uid);
      },
    });
    const { handler } = makeHandler(db, admin);

    const first = await handler({ auth: { uid: 'u1' } });
    const firstAudit = db.snapshot('ticket', 'tSafe').data().invalidated_at;
    const firstDeletedAt = db.snapshot('user', 'u1').data().deleted_at;
    const firstAdjustmentCount = db.collectionStore('ticket_adjustments').size;

    const second = await handler({ auth: { uid: 'u1' } });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.ticketsInvalidated, 0);
    assert.equal(deleteAttempts, 2);
    assert.equal(db.snapshot('ticket', 'tSafe').data().invalidated_at, firstAudit);
    assert.equal(db.snapshot('user', 'u1').data().deleted_at, firstDeletedAt);
    assert.equal(db.collectionStore('ticket_adjustments').size, firstAdjustmentCount);
    assert.equal(db.snapshot('ticket', 'tSafe').data().status, 'invalid');
  });
});
