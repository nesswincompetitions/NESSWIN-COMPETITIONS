import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  ADMIN_AUDIT_COLLECTION,
  AUDIT_ACTIONS,
  buildTicketAdjustmentAuditEvent,
  createAdminAuditActor,
  createAdminAuditService,
  createListAdminAuditEventsHandler,
  createSystemAuditActor,
  sanitizeAuditSnapshot,
} from '../services/adminAuditService.js';
import { createIncreaseUserCompetitionTicketsHandler } from '../services/ticketAdjustmentService.js';

function createSequencedAdmin() {
  let tick = 0;
  return {
    firestore: {
      FieldValue: {
        serverTimestamp: () => ++tick,
      },
    },
  };
}

function createRecordingLogger() {
  const entries = { info: [], warn: [], error: [] };
  return {
    entries,
    info: (...args) => entries.info.push(args),
    warn: (...args) => entries.warn.push(args),
    error: (...args) => entries.error.push(args),
  };
}

function makeService(db, { admin = createSequencedAdmin(), logger = createRecordingLogger() } = {}) {
  return createAdminAuditService({
    db,
    admin,
    logger,
    HttpsError: MockHttpsError,
  });
}

function makeReadHandler(db, assertAdmin = async () => 'admin1') {
  return createListAdminAuditEventsHandler({
    db,
    assertAdmin,
    HttpsError: MockHttpsError,
  });
}

function baseEvent(overrides = {}) {
  return {
    action: AUDIT_ACTIONS.COMPETITION_UPDATED,
    entity_type: 'competition',
    entity_id: 'c1',
    summary: 'Updated competition c1',
    reason: 'correcting a typo',
    before: { status: 'draft', stock_quantity: 10 },
    after: { status: 'active', stock_quantity: 10 },
    related: { competition_id: 'c1', user_id: 'u1' },
    source: 'competitionMutationService.save',
    correlation_id: 'req-1',
    ...overrides,
  };
}

function seedAuditEvents(db, count = 5) {
  for (let i = 1; i <= count; i++) {
    db.setDocument(ADMIN_AUDIT_COLLECTION, `e${i}`, {
      event_id: `e${i}`,
      action: AUDIT_ACTIONS.COMPETITION_UPDATED,
      entity_type: 'competition',
      entity_id: `c${i}`,
      actor_type: 'admin',
      actor_uid: 'admin1',
      actor_role: 'admin',
      summary: `event ${i}`,
      reason: null,
      before: null,
      after: null,
      related: null,
      source: 'test',
      correlation_id: null,
      created_at: i,
      stripe_payment_intent_id: `pi_${i}`,
      internal_secret: 'must-not-leak',
    });
  }
}

describe('central admin audit service', () => {
  it('creates an audit event with trusted attribution, server timestamp, and redacted snapshots', async () => {
    const db = new MemoryDB();
    const service = makeService(db);

    const eventId = await service.recordEvent(
      baseEvent({
        before: {
          status: 'draft',
          stock_quantity: 10,
          customer_email: 'user@example.com',
          billing_details: { email: 'user@example.com' },
          password: 'not-allowed',
          display_name: 'A User',
          nested: { status: 'draft' },
        },
        after: {
          status: 'active',
          ticket_number: 1,
          stripe_payment_intent_id: 'pi_123',
        },
        actor_uid: 'attacker',
        actor_role: 'superadmin',
        actor_type: 'admin',
      }),
      { actor: createAdminAuditActor('admin1') }
    );

    assert.ok(eventId);
    const stored = db.snapshot(ADMIN_AUDIT_COLLECTION, eventId).data();
    assert.equal(stored.event_id, eventId);
    assert.equal(stored.action, AUDIT_ACTIONS.COMPETITION_UPDATED);
    assert.equal(stored.entity_type, 'competition');
    assert.equal(stored.entity_id, 'c1');
    assert.equal(stored.actor_type, 'admin');
    assert.equal(stored.actor_uid, 'admin1');
    assert.equal(stored.actor_role, 'admin');
    assert.equal(stored.created_at, 1);
    assert.equal(stored.reason, 'correcting a typo');
    assert.equal(stored.correlation_id, 'req-1');
    assert.deepEqual(stored.related, { competition_id: 'c1', user_id: 'u1' });
    assert.deepEqual(stored.before, { status: 'draft', stock_quantity: 10 });
    assert.deepEqual(stored.after, { status: 'active', ticket_number: 1 });
    assert.equal('customer_email' in stored.before, false);
    assert.equal('billing_details' in stored.before, false);
    assert.equal('password' in stored.before, false);
    assert.equal('display_name' in stored.before, false);
    assert.equal('nested' in stored.before, false);
    assert.equal('stripe_payment_intent_id' in stored.after, false);
  });

  it('attributes system/backend events from trusted context', async () => {
    const db = new MemoryDB();
    const service = makeService(db);

    const eventId = await service.recordEvent(
      baseEvent({
        action: AUDIT_ACTIONS.USER_DELETED,
        entity_type: 'user',
        entity_id: 'u1',
        summary: 'Account deletion completed',
        related: { user_id: 'u1' },
        source: 'userDeletionService',
      }),
      { actor: createSystemAuditActor() }
    );

    const stored = db.snapshot(ADMIN_AUDIT_COLLECTION, eventId).data();
    assert.equal(stored.actor_type, 'system');
    assert.equal(stored.actor_uid, null);
    assert.equal(stored.actor_role, 'system');
  });

  it('rejects invalid event data without persisting anything', async () => {
    const db = new MemoryDB();
    const service = makeService(db);

    const invalidCases = [
      ['unsupported action', { action: 'competition.hacked' }],
      ['unsupported entity type', { entity_type: 'unknown' }],
      ['missing entity id', { entity_id: '   ' }],
      ['missing summary', { summary: '   ' }],
      ['oversized reason', { reason: 'x'.repeat(2001) }],
      ['non-object before snapshot', { before: 'not-an-object' }],
      ['duplicate ticket ids', { related: { ticket_ids: ['t1', 't1'] } }],
      ['missing source', { source: '' }],
      ['invalid correlation id', { correlation_id: 42 }],
    ];

    for (const [label, overrides] of invalidCases) {
      await assert.rejects(
        service.recordEvent(baseEvent(overrides), { actor: createAdminAuditActor('admin1') }),
        (error) => error instanceof MockHttpsError && error.code === 'invalid-argument',
        label
      );
    }

    await assert.rejects(
      service.recordEvent(baseEvent(), {}),
      (error) => error instanceof MockHttpsError && error.code === 'invalid-argument'
    );
    await assert.rejects(
      service.recordEvent(baseEvent(), { actor: { type: 'admin', uid: 'admin1' } }),
      (error) => error instanceof MockHttpsError && error.code === 'invalid-argument'
    );
    await assert.rejects(
      service.recordEvent(baseEvent(), { actor: { type: 'robot', uid: 'admin1', role: 'admin' } }),
      (error) => error instanceof MockHttpsError && error.code === 'invalid-argument'
    );

    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 0);
  });

  it('exposes no update/delete interface and appends distinct events', async () => {
    const db = new MemoryDB();
    const service = makeService(db);

    assert.equal(typeof service.updateEvent, 'undefined');
    assert.equal(typeof service.deleteEvent, 'undefined');

    const source = fs.readFileSync(
      fileURLToPath(new URL('../services/adminAuditService.js', import.meta.url)),
      'utf8'
    );
    assert.equal(source.includes('.update('), false);
    assert.equal(source.includes('.delete('), false);

    const first = await service.recordEvent(baseEvent(), {
      actor: createAdminAuditActor('admin1'),
    });
    const second = await service.recordEvent(baseEvent(), {
      actor: createAdminAuditActor('admin1'),
    });

    assert.notEqual(first, second);
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 2);
  });

  it('filters sensitive, nested, and non-allowlisted snapshot fields', () => {
    assert.deepEqual(
      sanitizeAuditSnapshot({
        status: 'active',
        total_amount: 10,
        currency: 'GBP',
        customer_email: 'user@example.com',
        billing_details: { email: 'user@example.com' },
        stripe_payment_intent_id: 'pi_123',
        password: 'secret',
        display_name: 'A User',
        nested: { status: 'active' },
      }),
      { status: 'active', total_amount: 10, currency: 'GBP' }
    );
  });

  it('writes the audit event atomically inside an existing transaction', async () => {
    const db = new MemoryDB();
    const service = makeService(db);

    await db.runTransaction(async (transaction) => {
      transaction.set(db.collection('competition').doc('c1'), { status: 'active' });
      service.recordEventInTransaction(transaction, baseEvent(), {
        actor: createAdminAuditActor('admin1'),
      });
    });

    assert.equal(db.snapshot('competition', 'c1').data().status, 'active');
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 1);
  });

  it('rolls back the audit event when the surrounding transaction fails', async () => {
    const db = new MemoryDB();
    const service = makeService(db);

    await assert.rejects(
      db.runTransaction(async (transaction) => {
        transaction.set(db.collection('competition').doc('c1'), { status: 'active' });
        service.recordEventInTransaction(transaction, baseEvent(), {
          actor: createAdminAuditActor('admin1'),
        });
        throw new Error('business failure');
      }),
      /business failure/
    );

    assert.equal(db.collectionStore('competition').size, 0);
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 0);
  });

  it('prevents the business write when audit validation fails in the transaction', async () => {
    const db = new MemoryDB();
    const service = makeService(db);

    await assert.rejects(
      db.runTransaction(async (transaction) => {
        transaction.set(db.collection('competition').doc('c1'), { status: 'active' });
        service.recordEventInTransaction(
          transaction,
          baseEvent({ action: 'competition.hacked' }),
          { actor: createAdminAuditActor('admin1') }
        );
      }),
      (error) => error instanceof MockHttpsError && error.code === 'invalid-argument'
    );

    assert.equal(db.collectionStore('competition').size, 0);
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 0);
  });

  it('logs and rejects when audit persistence fails', async () => {
    const logger = createRecordingLogger();
    const failingRef = {
      id: 'audit_failure',
      set: async () => {
        throw new Error('write failed');
      },
    };
    const db = {
      collection: () => ({
        doc: () => failingRef,
      }),
    };
    const service = createAdminAuditService({
      db,
      admin: createSequencedAdmin(),
      logger,
      HttpsError: MockHttpsError,
    });

    await assert.rejects(
      service.recordEvent(baseEvent(), { actor: createAdminAuditActor('admin1') }),
      /write failed/
    );

    assert.equal(logger.entries.error.length, 1);
    assert.equal(logger.entries.error[0][0], '[adminAudit] Failed to persist audit event');
    assert.equal(logger.entries.error[0][1].action, AUDIT_ACTIONS.COMPETITION_UPDATED);
    assert.equal(logger.entries.error[0][1].entity_id, 'c1');
  });

  it('references an existing ticket_adjustments record without duplicating ticket ids', () => {
    const event = buildTicketAdjustmentAuditEvent({
      adjustmentId: 'req-decrease-001',
      requestId: 'req-decrease-001',
      operation: 'ticket_decrease',
      userId: 'u1',
      competitionId: 'c1',
      orderId: 'o1',
      quantity: 2,
      direction: 'decrease',
      reason: 'customer correction',
    });

    assert.equal(event.action, AUDIT_ACTIONS.TICKET_QUANTITY_DECREASED);
    assert.equal(event.entity_type, 'ticket_adjustment');
    assert.equal(event.entity_id, 'req-decrease-001');
    assert.equal(event.related.adjustment_id, 'req-decrease-001');
    assert.equal('ticket_ids' in event.related, false);
    assert.equal(event.correlation_id, 'req-decrease-001');
  });

  it('leaves ticket_adjustments authoritative without auto-duplicating central events', async () => {
    const db = new MemoryDB();
    const userRef = db.collection('user').doc('u1');
    const competitionRef = db.collection('competition').doc('c1');
    const orderRef = db.collection('order').doc('o1');

    db.setDocument('user', 'u1', { free_tickets: 0 });
    db.setDocument('user', 'admin1', { role: 'admin' });
    db.setDocument('competition', 'c1', {
      title: 'Audit Test Competition',
      status: 'active',
      draw_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      stock_quantity: 99,
      sold_tickets: 1,
      total_tickets: 100,
      last_ticket_sequence: 1,
      participants: [userRef],
    });
    db.setDocument('order', 'o1', {
      user_ref: userRef,
      competition_id: competitionRef,
      status: 'paid',
      stripe_status: 'paid',
      total_ticket: 1,
      paid_ticket: 1,
      free_ticket: 0,
      free_used: 0,
      total_amount: 10,
      currency: 'GBP',
    });
    db.setDocument('ticket', 't1', {
      competition_id: competitionRef,
      user_id: userRef,
      order_id: orderRef,
      ticket_number: 1,
      ticket_sequence: 'TST001',
      status: 'active',
      is_winner: false,
      allocation_type: 'paid',
    });

    const handler = createIncreaseUserCompetitionTicketsHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      assertAdmin: async () => 'admin1',
      HttpsError: MockHttpsError,
    });

    const result = await handler({
      auth: { uid: 'admin1' },
      data: {
        userId: 'u1',
        competitionId: 'c1',
        orderId: 'o1',
        quantity: 1,
        reason: 'audit compatibility check',
        requestId: 'req-audit-compat-1',
      },
    });

    assert.equal(result.success, true);
    const adjustment = db.snapshot('ticket_adjustments', 'req-audit-compat-1').data();
    assert.equal(adjustment.operation, 'ticket_increase');
    assert.equal(adjustment.actor_role, 'admin');
    assert.equal(adjustment.request_id, 'req-audit-compat-1');
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 0);
  });
});

describe('admin audit read boundary', () => {
  it('rejects unauthenticated and non-admin callers before validation', async () => {
    const db = new MemoryDB();
    seedAuditEvents(db, 1);

    const unauthenticatedHandler = makeReadHandler(db, async () => {
      throw new MockHttpsError('unauthenticated', 'You must be logged in.');
    });
    await assert.rejects(
      unauthenticatedHandler({ auth: null, data: { limit: 0 } }),
      (error) => error.code === 'unauthenticated'
    );

    const nonAdminHandler = makeReadHandler(db, async () => {
      throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
    });
    await assert.rejects(
      nonAdminHandler({ auth: { uid: 'user1' }, data: { limit: 0 } }),
      (error) => error.code === 'permission-denied'
    );
  });

  it('returns only approved fields and paginates in stable descending order', async () => {
    const db = new MemoryDB();
    seedAuditEvents(db, 5);
    const handler = makeReadHandler(db);

    const firstPage = await handler({ auth: { uid: 'admin1' }, data: { limit: 2 } });
    assert.deepEqual(firstPage.events.map((event) => event.event_id), ['e5', 'e4']);
    assert.equal(firstPage.hasMore, true);
    assert.equal(firstPage.nextCursor, 'e4');
    assert.equal('stripe_payment_intent_id' in firstPage.events[0], false);
    assert.equal('internal_secret' in firstPage.events[0], false);

    const secondPage = await handler({
      auth: { uid: 'admin1' },
      data: { limit: 2, cursor: firstPage.nextCursor },
    });
    assert.deepEqual(secondPage.events.map((event) => event.event_id), ['e3', 'e2']);
    assert.equal(secondPage.hasMore, true);
    assert.equal(secondPage.nextCursor, 'e2');

    const thirdPage = await handler({
      auth: { uid: 'admin1' },
      data: { limit: 2, cursor: secondPage.nextCursor },
    });
    assert.deepEqual(thirdPage.events.map((event) => event.event_id), ['e1']);
    assert.equal(thirdPage.hasMore, false);
    assert.equal(thirdPage.nextCursor, null);

    const allIds = [
      ...firstPage.events,
      ...secondPage.events,
      ...thirdPage.events,
    ].map((event) => event.event_id);
    assert.equal(new Set(allIds).size, 5);
  });

  it('applies the default bounded page size', async () => {
    const db = new MemoryDB();
    seedAuditEvents(db, 30);
    const handler = makeReadHandler(db);

    const page = await handler({ auth: { uid: 'admin1' }, data: {} });
    assert.equal(page.events.length, 25);
    assert.equal(page.hasMore, true);
    assert.equal(page.nextCursor, 'e6');
  });

  it('rejects invalid limits and invalid cursors', async () => {
    const db = new MemoryDB();
    seedAuditEvents(db, 1);
    const handler = makeReadHandler(db);

    for (const limit of [0, 101, 2.5, 'abc', true, null]) {
      if (limit === null) continue;
      await assert.rejects(
        handler({ auth: { uid: 'admin1' }, data: { limit } }),
        (error) => error.code === 'invalid-argument',
        `limit ${String(limit)}`
      );
    }

    await assert.rejects(
      handler({ auth: { uid: 'admin1' }, data: { cursor: 'missing-event' } }),
      (error) => error.code === 'invalid-argument'
    );
  });
});
