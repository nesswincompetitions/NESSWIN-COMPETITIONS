import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MemoryDocRef,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createGrantAdminBonusHandler } from '../controllers/adminController.js';
import { assertReferralRedeemable } from '../services/referralEligibility.js';

const REQUEST_ID = 'grant_request_001';

function seed(db, overrides = {}) {
  db.setDocument('user', 'u1', {
    free_tickets: 2,
    total_free_tickets: 5,
    role: 'user',
    ...(overrides.user || {}),
  });
  db.setDocument('user', 'u2', {
    free_tickets: 0,
    total_free_tickets: 0,
    role: 'user',
    ...(overrides.secondUser || {}),
  });
  db.setDocument('user', 'admin1', { role: 'admin' });
}

function makeHandler(db, { adminUid = 'admin1' } = {}) {
  const assertAdmin = async (request) => {
    const uid = request?.auth?.uid;
    if (!uid) {
      throw new MockHttpsError('unauthenticated', 'You must be logged in.');
    }
    const snap = await db.collection('user').doc(uid).get();
    if (!snap.exists || snap.data()?.role !== 'admin') {
      throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
    }
    if (uid !== adminUid) {
      throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
    }
    return uid;
  };

  return createGrantAdminBonusHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin,
    HttpsError: MockHttpsError,
  });
}

function request(overrides = {}, requestOverrides = {}) {
  return {
    auth: { uid: 'admin1' },
    ...requestOverrides,
    data: {
      userId: 'u1',
      quantity: 3,
      reason: 'goodwill allocation',
      requestId: REQUEST_ID,
      ...overrides,
    },
  };
}

function referralDocs(db) {
  return [...db.collectionStore('referrals').entries()].map(([id, data]) => ({
    id,
    data: { ...data },
  }));
}

function auditEvents(db) {
  return [...db.collectionStore('admin_audit_events').values()]
    .map((data) => ({ ...data }))
    .sort(
      (left, right) =>
        Number(left.after?.chunk_index ?? 0) - Number(right.after?.chunk_index ?? 0),
    );
}

function chunkDocId(chunkIndex, requestId = REQUEST_ID) {
  return `admin_bonus_grant_${requestId}_chunk_${chunkIndex}`;
}

function grantRequestId(index) {
  return `grant_request_${String(index).padStart(3, '0')}`;
}

describe('grantAdminBonus idempotency', () => {
  it('requires an admin caller and writes no credits for non-admins', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await assert.rejects(
      handler(request({}, { auth: { uid: 'u1' } })),
      (error) =>
        error instanceof MockHttpsError && error.code === 'permission-denied',
    );
    await assert.rejects(
      handler(request({}, { auth: null })),
      (error) =>
        error instanceof MockHttpsError && error.code === 'unauthenticated',
    );

    assert.equal(db.collections.has('referrals'), false);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 2);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 5);
  });

  it('rejects missing, malformed, and short request IDs', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    for (const requestId of ['', 'short', 'bad request id', 'x'.repeat(129)]) {
      await assert.rejects(
        handler(request({ requestId })),
        (error) =>
          error instanceof MockHttpsError && error.code === 'invalid-argument',
      );
    }

    assert.equal(db.collections.has('referrals'), false);
  });

  it('keeps callers that omit requestId working without replay idempotency', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const first = await handler(request({ requestId: undefined }));
    const second = await handler(request({ requestId: undefined }));

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, false);
    assert.equal(referralDocs(db).length, 6);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 8);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 11);
  });

  it('validates quantity and preserves the 5000 maximum', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    for (const quantity of [0, -1, 1.5, 5001]) {
      await assert.rejects(
        handler(request({ quantity, requestId: grantRequestId(quantity) })),
        (error) =>
          error instanceof MockHttpsError && error.code === 'invalid-argument',
      );
    }

    const result = await handler(
      request({ quantity: 5000, requestId: grantRequestId('max') }),
    );

    assert.equal(result.success, true);
    assert.equal(result.complete, true);
    assert.equal(result.grantedQuantity, 5000);
    assert.equal(referralDocs(db).length, 5000);
    assert.equal(db.collectionStore('free_ticket_log').size, 13);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 5002);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 5005);
  });

  it('rejects non-string and oversized reasons without writes', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    for (const reason of [123, {}, [], 'x'.repeat(2001)]) {
      await assert.rejects(
        handler(request({ reason, requestId: grantRequestId('reason-invalid') })),
        (error) =>
          error instanceof MockHttpsError && error.code === 'invalid-argument',
      );
    }

    assert.equal(db.collections.has('referrals'), false);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 2);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 5);

    const acceptedReason = 'x'.repeat(2000);
    const accepted = await handler(
      request({ quantity: 2, reason: acceptedReason, requestId: grantRequestId('reason-max') }),
    );

    assert.equal(accepted.success, true);
    const log = db.snapshot(
      'free_ticket_log',
      chunkDocId(0, grantRequestId('reason-max')),
    ).data();
    assert.equal(log.grant_reason, acceptedReason);
    assert.equal(log.admin_note, acceptedReason);
    assert.equal(auditEvents(db)[0].reason, acceptedReason);
  });

  it('normalizes unexpected errors outside chunk processing through toHttpsError', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);
    const originalGet = MemoryDocRef.prototype.get;

    MemoryDocRef.prototype.get = async function getWithFailure() {
      if (this.path === 'user/u1') {
        throw new Error('simulated initial user read failure');
      }
      return originalGet.call(this);
    };

    try {
      await assert.rejects(
        handler(request()),
        (error) =>
          error?.code === 'internal' &&
          /simulated initial user read failure/.test(error.message),
      );
    } finally {
      MemoryDocRef.prototype.get = originalGet;
    }

    assert.equal(db.collections.has('referrals'), false);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 2);
  });

  it('replays the same request and payload without granting twice', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const first = await handler(request());
    const second = await handler(request());

    assert.equal(first.success, true);
    assert.equal(first.complete, true);
    assert.equal(first.idempotentReplay, false);
    assert.equal(second.success, true);
    assert.equal(second.complete, true);
    assert.equal(second.idempotentReplay, true);

    assert.equal(referralDocs(db).length, 3);
    assert.equal(db.collectionStore('free_ticket_log').size, 1);
    assert.equal(db.collectionStore('admin_audit_events').size, 1);
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 1);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 5);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 8);
  });

  it('rejects the same request ID with a different user, quantity, or reason', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await handler(request({ quantity: 3 }));
    const beforeReferrals = referralDocs(db).length;
    const beforeUser = { ...db.snapshot('user', 'u1').data() };

    const attempts = [
      request({ userId: 'u2', quantity: 3 }),
      request({ quantity: 4 }),
      request({ quantity: 3, reason: 'different reason' }),
    ];

    for (const attempt of attempts) {
      await assert.rejects(
        handler(attempt),
        (error) =>
          error instanceof MockHttpsError && error.code === 'failed-precondition',
      );
    }

    assert.equal(referralDocs(db).length, beforeReferrals);
    assert.deepEqual(db.snapshot('user', 'u1').data(), beforeUser);
    assert.equal(db.snapshot('user', 'u2').data().free_tickets, 0);
  });

  it('serializes concurrent calls with the same request ID', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);
    const payload = request({
      quantity: 500,
      requestId: grantRequestId('concurrent-same'),
    });

    const results = await Promise.all([handler(payload), handler(payload)]);

    assert.equal(results.every((result) => result.success && result.complete), true);
    assert.equal(referralDocs(db).length, 500);
    assert.equal(db.collectionStore('free_ticket_log').size, 2);
    assert.equal(db.collectionStore('admin_audit_events').size, 2);
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 1);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 502);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 505);
  });

  it('treats concurrent calls with different request IDs as separate grants', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const results = await Promise.all([
      handler(request({ quantity: 2, requestId: grantRequestId('concurrent-a') })),
      handler(request({ quantity: 4, requestId: grantRequestId('concurrent-b') })),
    ]);

    assert.equal(results.every((result) => result.success && result.complete), true);
    assert.equal(referralDocs(db).length, 6);
    assert.equal(db.collectionStore('free_ticket_log').size, 2);
    assert.equal(db.collectionStore('admin_audit_events').size, 2);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 8);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 11);
  });

  it('resumes after a committed chunk without regranting it', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);
    const partialRequestId = grantRequestId('partial');
    const payload = request({
      quantity: 900,
      requestId: partialRequestId,
    });

    const failAtChunk = async (callIndex) => {
      if (callIndex === 2) {
        throw new Error('simulated chunk failure');
      }
      db.beforeTransaction = failAtChunk;
    };
    db.beforeTransaction = failAtChunk;

    const partial = await handler(payload);

    assert.equal(partial.success, false);
    assert.equal(partial.complete, false);
    assert.equal(partial.grantedQuantity, 400);
    assert.equal(partial.remainingQuantity, 500);
    assert.equal(partial.retryable, true);
    assert.equal(referralDocs(db).length, 400);
    assert.equal(
      db.snapshot('free_ticket_log', chunkDocId(0, partialRequestId)).exists,
      true,
    );
    assert.equal(
      db.snapshot('free_ticket_log', chunkDocId(1, partialRequestId)).exists,
      false,
    );
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 0);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 402);

    const resumed = await handler(payload);

    assert.equal(resumed.success, true);
    assert.equal(resumed.complete, true);
    assert.equal(resumed.grantedQuantity, 900);
    assert.equal(resumed.remainingQuantity, 0);
    assert.equal(resumed.idempotentReplay, false);
    assert.equal(referralDocs(db).length, 900);
    assert.equal(db.collectionStore('free_ticket_log').size, 3);
    assert.equal(db.collectionStore('admin_audit_events').size, 3);
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 1);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 902);
    assert.equal(db.snapshot('user', 'u1').data().total_free_tickets, 905);

    const replayed = await handler(payload);

    assert.equal(replayed.success, true);
    assert.equal(replayed.complete, true);
    assert.equal(replayed.idempotentReplay, true);
    assert.equal(referralDocs(db).length, 900);
    assert.equal(db.collectionStore('admin_audit_events').size, 3);
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 1);
  });

  it('reports multiple committed chunks accurately before resuming', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);
    const requestId = grantRequestId('partial-multi');
    const payload = request({ quantity: 1300, requestId });

    const failAtChunk = async (callIndex) => {
      if (callIndex === 3) {
        throw new Error('simulated later chunk failure');
      }
      db.beforeTransaction = failAtChunk;
    };
    db.beforeTransaction = failAtChunk;

    const partial = await handler(payload);

    assert.equal(partial.success, false);
    assert.equal(partial.complete, false);
    assert.equal(partial.grantedQuantity, 800);
    assert.equal(partial.remainingQuantity, 500);
    assert.equal(referralDocs(db).length, 800);
    assert.equal(db.collectionStore('free_ticket_log').size, 2);
    assert.equal(db.collectionStore('admin_audit_events').size, 2);
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 0);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 802);

    const resumed = await handler(payload);

    assert.equal(resumed.success, true);
    assert.equal(resumed.complete, true);
    assert.equal(resumed.grantedQuantity, 1300);
    assert.equal(referralDocs(db).length, 1300);
    assert.equal(db.collectionStore('free_ticket_log').size, 4);
    assert.equal(db.collectionStore('admin_audit_events').size, 4);
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 1);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 1302);
  });

  it('writes the expected referral, log, notification, and audit records', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);
    const requestId = grantRequestId('records');
    const payload = request({
      quantity: 600,
      reason: 'VIP compensation',
      requestId,
    });

    const result = await handler(payload);

    assert.equal(result.success, true);
    assert.equal(result.complete, true);

    const referrals = referralDocs(db);
    assert.equal(referrals.length, 600);
    referrals.forEach(({ data }) => {
      assert.equal(data.referral_code, 'ADMIN_BONUS');
      assert.equal(data.reward_type, 'admin_bonus');
      assert.equal(data.reward_value, 1);
      assert.equal(data.reward_issued, false);
      assert.equal(data.referrer_id.path, 'user/u1');
      assert.equal(data.referred_user_id.path, 'user/admin1');
      assert.equal(data.grant_request_id, requestId);
      assert.equal(data.grant_user_id, 'u1');
      assert.equal(data.grant_requested_quantity, 600);
      assert.equal(
        Object.prototype.hasOwnProperty.call(data, 'grant_reason'),
        false,
      );
      assert.equal(data.granted_by.path, 'user/admin1');
      assert.equal(data.created_at.__mockServerTimestamp, true);
    });
    assert.deepEqual(
      [...new Set(referrals.map(({ data }) => data.grant_chunk_index))].sort(),
      [0, 1],
    );

    const firstLog = db.snapshot('free_ticket_log', chunkDocId(0, requestId)).data();
    const secondLog = db.snapshot('free_ticket_log', chunkDocId(1, requestId)).data();
    assert.equal(firstLog.user_id.path, 'user/u1');
    assert.equal(firstLog.quantity, 400);
    assert.equal(firstLog.grant_quantity, 400);
    assert.equal(firstLog.reason, 'VIP compensation');
    assert.equal(firstLog.admin_note, 'VIP compensation');
    assert.equal(firstLog.reward_type, 'admin_bonus');
    assert.equal(firstLog.competition_id, null);
    assert.equal(firstLog.reward_issued, false);
    assert.equal(firstLog.type, 'grant');
    assert.equal(firstLog.grant_request_id, requestId);
    assert.equal(firstLog.grant_requested_quantity, 600);
    assert.equal(firstLog.grant_chunk_index, 0);
    assert.equal(firstLog.grant_chunk_count, 2);
    assert.equal(firstLog.granted_by.path, 'user/admin1');
    assert.equal(secondLog.quantity, 200);
    assert.equal(secondLog.grant_quantity, 200);
    assert.equal(secondLog.grant_chunk_index, 1);

    const notifications = [...db.collectionStore('ff_user_push_notifications').values()];
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].user_refs, 'user/u1');
    assert.equal(notifications[0].type, 'free_ticket_earned');
    assert.equal(notifications[0].category, 'rewards');
    assert.deepEqual(JSON.parse(notifications[0].parameter_data), {
      quantity: 600,
      reason: 'admin_bonus',
      admin_note: 'VIP compensation',
    });

    const events = auditEvents(db);
    assert.equal(events.length, 2);
    assert.equal(events[0].action, 'bonus.granted');
    assert.equal(events[0].entity_type, 'bonus_credit');
    assert.equal(events[0].entity_id, 'u1');
    assert.equal(events[0].actor_type, 'admin');
    assert.equal(events[0].actor_uid, 'admin1');
    assert.equal(events[0].correlation_id, requestId);
    assert.equal(events[0].reason, 'VIP compensation');
    assert.equal(events[0].source, 'admin_bonus_grant');
    assert.equal(events[0].related.user_id, 'u1');
    assert.equal(events[0].before.free_tickets, 2);
    assert.equal(events[0].after.free_tickets, 402);
    assert.equal(events[0].after.requested_quantity, 600);
    assert.equal(events[0].after.granted_quantity, 400);
    assert.equal(events[0].after.chunk_index, 0);
    assert.equal(events[0].after.chunk_count, 2);
    assert.equal(events[0].after.grant_status, 'chunk_committed');
    assert.equal(events[1].before.free_tickets, 402);
    assert.equal(events[1].after.free_tickets, 602);
    assert.equal(events[1].after.granted_quantity, 200);
    assert.equal(events[1].after.chunk_index, 1);
    assert.equal(events[1].after.grant_status, 'complete');
  });

  it('does not write audit success for a failed first chunk', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    db.beforeTransaction = async () => {
      throw new Error('simulated first-chunk failure');
    };

    const result = await handler(request({ quantity: 600 }));

    assert.equal(result.success, false);
    assert.equal(result.complete, false);
    assert.equal(result.grantedQuantity, 0);
    assert.equal(result.remainingQuantity, 600);
    assert.equal(referralDocs(db).length, 0);
    assert.equal(db.collectionStore('free_ticket_log').size, 0);
    assert.equal(db.collectionStore('admin_audit_events').size, 0);
    assert.equal(db.collectionStore('ff_user_push_notifications').size, 0);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 2);
  });

  it('keeps legacy admin bonus credits redeemable and ignores unrelated collections', async () => {
    const db = new MemoryDB();
    seed(db);
    const userRef = db.collection('user').doc('u1');
    db.setDocument('referrals', 'legacy_bonus', {
      referrer_id: userRef,
      referred_user_id: db.collection('user').doc('admin1'),
      referral_code: 'ADMIN_BONUS',
      reward_type: 'admin_bonus',
      reward_value: 1,
      reward_issued: false,
    });

    const legacyBefore = { ...db.snapshot('referrals', 'legacy_bonus').data() };
    assert.doesNotThrow(() =>
      assertReferralRedeemable(
        db.snapshot('referrals', 'legacy_bonus').data(),
        'legacy_bonus',
        userRef.path,
      ),
    );

    const handler = makeHandler(db);
    await handler(request({ quantity: 2 }));

    assert.deepEqual(db.snapshot('referrals', 'legacy_bonus').data(), legacyBefore);
    assert.equal(db.collections.has('order'), false);
    assert.equal(db.collections.has('ticket'), false);
    assert.equal(db.collections.has('competition'), false);
  });
});
