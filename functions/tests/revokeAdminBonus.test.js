/**
 * Focused regression tests for revokeAdminBonus.
 *
 * These tests exercise the real revocation handler and the real redemption
 * guard. Firebase is replaced with an in-memory Firestore model that implements
 * optimistic transaction conflict detection/retry. This is not the Firebase
 * Emulator; concurrency is simulated, not verified against live Firestore.
 *
 * Run: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRevokeAdminBonusHandler } from '../services/adminBonusRevocationService.js';
import { assertReferralRedeemable } from '../services/referralEligibility.js';

class MockHttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const FieldValue = {
  serverTimestamp: () => ({ __mockServerTimestamp: true }),
  increment: (n) => ({ __mockIncrement: n }),
};

function splitPath(path) {
  const index = path.indexOf('/');
  return [path.slice(0, index), path.slice(index + 1)];
}

function makeSnapshot(ref, data) {
  return {
    id: ref.id,
    ref,
    exists: data !== null && data !== undefined,
    data: () => data,
  };
}

class MemoryDocRef {
  constructor(db, collectionName, id) {
    this.db = db;
    this.collectionName = collectionName;
    this.id = id;
    this.path = `${collectionName}/${id}`;
  }

  async get() {
    return this.db.snapshot(this.collectionName, this.id);
  }
}

class MemoryCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  doc(id) {
    return new MemoryDocRef(this.db, this.name, id);
  }
}

class MemoryTransaction {
  constructor(db) {
    this.db = db;
    this.reads = new Map();
    this.writes = [];
  }

  async get(ref) {
    // Force interleaving between concurrently started transactions.
    await Promise.resolve();
    const [collectionName, id] = splitPath(ref.path);
    const data = this.db.collectionStore(collectionName).get(id) ?? null;
    this.reads.set(ref.path, this.db.version(ref.path));
    return makeSnapshot(ref, data);
  }

  update(ref, data) {
    this.writes.push({ path: ref.path, data });
  }

  set(ref, data) {
    this.writes.push({ path: ref.path, data });
  }
}

class MemoryDB {
  constructor(initial = {}) {
    this.collections = new Map();
    this.versions = new Map();
    this.txCalls = 0;
    this.failOnCall = null;
    this.beforeTransaction = null;

    for (const [name, docs] of Object.entries(initial)) {
      const collection = new Map();
      for (const [id, data] of Object.entries(docs)) {
        collection.set(id, { ...data });
      }
      this.collections.set(name, collection);
    }
  }

  collectionStore(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name);
  }

  version(path) {
    return this.versions.get(path) ?? 0;
  }

  bumpVersion(path) {
    this.versions.set(path, this.version(path) + 1);
  }

  collection(name) {
    return new MemoryCollection(this, name);
  }

  snapshot(collectionName, id) {
    const ref = new MemoryDocRef(this, collectionName, id);
    return makeSnapshot(ref, this.collectionStore(collectionName).get(id) ?? null);
  }

  async runTransaction(fn) {
    const callIndex = ++this.txCalls;

    if (this.beforeTransaction) {
      const hook = this.beforeTransaction;
      this.beforeTransaction = null;
      await hook(callIndex);
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const transaction = new MemoryTransaction(this);
      const result = await fn(transaction);

      const forcedFailure = this.failOnCall?.(callIndex);
      if (forcedFailure) throw forcedFailure;

      const conflicted = [...transaction.reads].some(
        ([path, version]) => this.version(path) !== version
      );
      if (conflicted) continue;

      for (const write of transaction.writes) {
        this.applyWrite(write.path, write.data);
      }
      return result;
    }

    throw new Error('transaction retry limit exceeded');
  }

  applyWrite(path, data) {
    const [collectionName, id] = splitPath(path);
    const collection = this.collectionStore(collectionName);
    const current = collection.get(id) ?? {};
    const next = { ...current };

    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__mockIncrement' in value) {
        next[key] = Number(current[key] ?? 0) + value.__mockIncrement;
      } else if (value && typeof value === 'object' && '__mockServerTimestamp' in value) {
        next[key] = new Date('2026-01-01T00:00:00.000Z');
      } else {
        next[key] = value;
      }
    }

    collection.set(id, next);
    this.bumpVersion(path);
  }
}

function makeDb({ free_tickets = 10, total_free_tickets = 10, credits = [], users = {} } = {}) {
  const referrals = {};
  for (const credit of credits) {
    referrals[credit.id] = {
      referrer_id: { path: `user/${credit.owner || 'targetUser'}` },
      reward_type: credit.reward_type || 'admin_bonus',
      reward_value: credit.reward_value ?? 1,
      reward_issued: !!credit.issued,
      reward_revoked: !!credit.revoked,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      ...(credit.extra || {}),
    };
  }

  return new MemoryDB({
    user: {
      targetUser: { free_tickets, total_free_tickets, role: 'user' },
      admin1: { role: 'admin' },
      nonadmin: { role: 'user' },
      ...users,
    },
    referrals,
  });
}

function makeHandler(db) {
  const logs = [];
  const logger = {
    info: (...args) => logs.push(['info', ...args]),
    warn: (...args) => logs.push(['warn', ...args]),
    error: (...args) => logs.push(['error', ...args]),
  };

  const assertAdmin = async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new MockHttpsError('unauthenticated', 'You must be logged in.');
    }
    const snap = await db.collection('user').doc(uid).get();
    if (!snap.exists || snap.data().role !== 'admin') {
      throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
    }
    return uid;
  };

  const handler = createRevokeAdminBonusHandler({
    db,
    admin: { firestore: { FieldValue } },
    logger,
    assertAdmin,
    HttpsError: MockHttpsError,
  });

  return { handler, logs };
}

function request(creditIds, overrides = {}) {
  return {
    auth: { uid: overrides.uid ?? 'admin1' },
    data: {
      userId: overrides.userId ?? 'targetUser',
      creditIds,
      reason: overrides.reason ?? 'cleanup',
    },
  };
}

function freeTickets(db, userId = 'targetUser') {
  return db.collectionStore('user').get(userId).free_tickets;
}

function stored(db, collectionName, id) {
  return db.collectionStore(collectionName).get(id);
}

function totalFreeTickets(db, userId = 'targetUser') {
  return db.collectionStore('user').get(userId).total_free_tickets;
}

function assertNoNotificationOrLedgerWrites(db) {
  assert.equal(db.collections.has('ff_user_push_notifications'), false);
  assert.equal(db.collections.has('ff_push_notifications'), false);
  assert.equal(db.collections.has('free_ticket_log'), false);
}

function makeCredits(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `c${String(index).padStart(3, '0')}` }));
}

async function redeemCredit(db, creditId, userId = 'targetUser') {
  return db.runTransaction(async (transaction) => {
    const creditRef = db.collection('referrals').doc(creditId);
    const creditSnap = await transaction.get(creditRef);
    assertReferralRedeemable(creditSnap.data(), creditId, `user/${userId}`);

    const userRef = db.collection('user').doc(userId);
    const userSnap = await transaction.get(userRef);
    if (userSnap.data().free_tickets < 1) {
      throw new Error('Insufficient free tickets.');
    }

    transaction.update(creditRef, {
      reward_issued: true,
      reward_issued_at: FieldValue.serverTimestamp(),
    });
    transaction.update(userRef, {
      free_tickets: FieldValue.increment(-1),
    });

    return { redeemed: true };
  });
}

describe('revokeAdminBonus regression', () => {
  it('1. authorized admin revokes unused admin_bonus credits and preserves issuance metadata', async () => {
    const db = makeDb({ free_tickets: 10, credits: [{ id: 'c1' }, { id: 'c2' }] });
    const { handler } = makeHandler(db);
    const before = { ...stored(db, 'referrals', 'c1') };

    const result = await handler(request(['c1', 'c2']));

    assert.equal(result.success, true);
    assert.equal(result.complete, true);
    assert.equal(result.outcome, 'complete');
    assert.equal(result.revokedCount, 2);
    assert.equal(result.remainingCount, 0);
    assert.equal(stored(db, 'referrals', 'c1').reward_revoked, true);
    assert.equal(stored(db, 'referrals', 'c1').revoke_reason, 'cleanup');
    assert.equal(stored(db, 'referrals', 'c1').revoked_by.path, 'user/admin1');
    assert.ok(stored(db, 'referrals', 'c1').revoked_at instanceof Date);
    assert.equal(stored(db, 'referrals', 'c1').referrer_id.path, before.referrer_id.path);
    assert.equal(stored(db, 'referrals', 'c1').reward_type, before.reward_type);
    assert.equal(stored(db, 'referrals', 'c1').reward_value, before.reward_value);
    assert.equal(stored(db, 'referrals', 'c1').reward_issued, false);
    assert.equal(freeTickets(db), 8);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('2. unauthorized callers are rejected without writes', async () => {
    const db = makeDb({ credits: [{ id: 'c1' }] });
    const { handler } = makeHandler(db);

    await assert.rejects(
      () => handler({ auth: null, data: { userId: 'targetUser', creditIds: ['c1'], reason: 'x' } }),
      (error) => error.code === 'unauthenticated'
    );
    await assert.rejects(
      () => handler(request(['c1'], { uid: 'nonadmin' })),
      (error) => error.code === 'permission-denied'
    );

    assert.equal(stored(db, 'referrals', 'c1').reward_revoked, false);
    assert.equal(freeTickets(db), 10);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('3. missing or blank reasons are rejected', async () => {
    const db = makeDb({ credits: [{ id: 'c1' }] });
    const { handler } = makeHandler(db);

    await assert.rejects(
      () => handler(request(['c1'], { reason: '' })),
      (error) => error.code === 'invalid-argument'
    );
    await assert.rejects(
      () => handler(request(['c1'], { reason: '   ' })),
      (error) => error.code === 'invalid-argument'
    );

    assert.equal(stored(db, 'referrals', 'c1').reward_revoked, false);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('4. wrong-owner, non-admin-bonus and missing credits are rejected before mutation', async () => {
    const db = makeDb({
      credits: [
        { id: 'wrongOwner', owner: 'otherUser' },
        { id: 'referralBonus', reward_type: 'referral' },
      ],
      users: { otherUser: { free_tickets: 0, total_free_tickets: 0, role: 'user' } },
    });
    const { handler } = makeHandler(db);

    await assert.rejects(
      () => handler(request(['wrongOwner'])),
      (error) => error.code === 'failed-precondition'
    );
    await assert.rejects(
      () => handler(request(['referralBonus'])),
      (error) => error.code === 'failed-precondition'
    );
    await assert.rejects(
      () => handler(request(['missingCredit'])),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(stored(db, 'referrals', 'wrongOwner').reward_revoked, false);
    assert.equal(stored(db, 'referrals', 'referralBonus').reward_revoked, false);
    assert.equal(freeTickets(db), 10);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('5. redeemed credits remain unchanged and are not revoked', async () => {
    const db = makeDb({
      free_tickets: 10,
      credits: [{ id: 'redeemed', issued: true }, { id: 'unused' }],
    });
    const { handler } = makeHandler(db);

    const result = await handler(request(['redeemed', 'unused']));

    assert.equal(result.revokedCount, 1);
    assert.equal(result.skippedRedeemed, 1);
    assert.equal(result.complete, true);
    assert.notEqual(stored(db, 'referrals', 'redeemed').reward_revoked, true);
    assert.equal(stored(db, 'referrals', 'redeemed').reward_issued, true);
    assert.equal(stored(db, 'referrals', 'unused').reward_revoked, true);
    assert.equal(freeTickets(db), 9);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('6. previously revoked credits are not decremented again', async () => {
    const db = makeDb({
      free_tickets: 10,
      credits: [{ id: 'alreadyRevoked', revoked: true }, { id: 'unused' }],
    });
    const { handler } = makeHandler(db);

    const first = await handler(request(['alreadyRevoked', 'unused']));
    assert.equal(first.revokedCount, 1);
    assert.equal(first.skippedRevoked, 1);
    assert.equal(freeTickets(db), 9);

    const second = await handler(request(['alreadyRevoked']));
    assert.equal(second.revokedCount, 0);
    assert.equal(second.complete, true);
    assert.equal(second.skippedRevoked, 1);
    assert.equal(freeTickets(db), 9);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('7. free_tickets is decremented by the actual newly revoked count', async () => {
    const db = makeDb({ free_tickets: 5, credits: makeCredits(3) });
    const { handler } = makeHandler(db);

    const result = await handler(request(['c000', 'c001']));

    assert.equal(result.revokedCount, 2);
    assert.equal(freeTickets(db), 3);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('8. total_free_tickets remains unchanged', async () => {
    const db = makeDb({ free_tickets: 10, total_free_tickets: 20, credits: [{ id: 'c1' }] });
    const { handler } = makeHandler(db);

    await handler(request(['c1']));

    assert.equal(totalFreeTickets(db), 20);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('9. revoked credits cannot be redeemed', () => {
    assert.throws(
      () => assertReferralRedeemable(
        { reward_issued: false, reward_revoked: true, referrer_id: { path: 'user/targetUser' } },
        'c1',
        'user/targetUser'
      ),
      /revoked/
    );
    assert.throws(
      () => assertReferralRedeemable(
        { reward_issued: true, reward_revoked: false, referrer_id: { path: 'user/targetUser' } },
        'c1',
        'user/targetUser'
      ),
      /already redeemed/
    );
    assert.throws(
      () => assertReferralRedeemable(
        { reward_issued: false, reward_revoked: false, referrer_id: { path: 'user/other' } },
        'c1',
        'user/targetUser'
      ),
      /does not belong/
    );
    assert.throws(
      () => assertReferralRedeemable(
        { reward_issued: 'true', reward_revoked: false, referrer_id: { path: 'user/targetUser' } },
        'c1',
        'user/targetUser'
      ),
      /malformed issuance\/revocation flags/
    );
    assert.throws(
      () => assertReferralRedeemable(
        { reward_issued: false, reward_revoked: 'true', referrer_id: { path: 'user/targetUser' } },
        'c1',
        'user/targetUser'
      ),
      /malformed issuance\/revocation flags/
    );
  });

  it('10. duplicate IDs and repeated requests do not double-count', async () => {
    const db = makeDb({ free_tickets: 10, credits: [{ id: 'c1' }] });
    const { handler } = makeHandler(db);

    const first = await handler(request(['c1', 'c1', ' c1 ']));
    assert.equal(first.revokedCount, 1);
    assert.equal(freeTickets(db), 9);

    const second = await handler(request(['c1']));
    assert.equal(second.revokedCount, 0);
    assert.equal(freeTickets(db), 9);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('11. concurrent overlapping revocations do not double-decrement', async () => {
    const db = makeDb({ free_tickets: 10, credits: [{ id: 'c1' }] });
    const { handler } = makeHandler(db);

    const [first, second] = await Promise.all([
      handler(request(['c1'])),
      handler(request(['c1'])),
    ]);

    assert.equal(first.revokedCount + second.revokedCount, 1);
    assert.equal(stored(db, 'referrals', 'c1').reward_revoked, true);
    assert.equal(freeTickets(db), 9);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('12. redemption committed first leaves the issued credit and balance untouched by revocation', async () => {
    const db = makeDb({ free_tickets: 10, credits: [{ id: 'c1' }] });
    const { handler } = makeHandler(db);

    await redeemCredit(db, 'c1');
    const revokeResult = await handler(request(['c1']));

    const credit = stored(db, 'referrals', 'c1');
    assert.equal(credit.reward_issued, true);
    assert.notEqual(credit.reward_revoked, true);
    assert.equal(revokeResult.revokedCount, 0);
    assert.equal(revokeResult.skippedRedeemed, 1);
    assert.equal(freeTickets(db), 9);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('13. revocation committed first rejects redemption and preserves the revoked state', async () => {
    const db = makeDb({ free_tickets: 10, credits: [{ id: 'c1' }] });
    const { handler } = makeHandler(db);

    const revokeResult = await handler(request(['c1']));
    await assert.rejects(() => redeemCredit(db, 'c1'), /revoked/);

    const credit = stored(db, 'referrals', 'c1');
    assert.equal(revokeResult.revokedCount, 1);
    assert.equal(credit.reward_revoked, true);
    assert.notEqual(credit.reward_issued, true);
    assert.equal(freeTickets(db), 9);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('14. partial success and retry report accurate counts without double-decrement', async () => {
    const credits = makeCredits(300);
    const ids = credits.map((credit) => credit.id);
    const db = makeDb({ free_tickets: 300, credits });
    const { handler } = makeHandler(db);
    db.failOnCall = (callIndex) => (callIndex === 2 ? new Error('simulated commit failure') : null);

    const partial = await handler(request(ids));
    assert.equal(partial.success, false);
    assert.equal(partial.complete, false);
    assert.equal(partial.outcome, 'partial');
    assert.equal(partial.revokedCount, 250);
    assert.equal(partial.remainingCount, 50);
    assert.equal(partial.retryable, true);
    assert.deepEqual(partial.retryableCreditIds, ids.slice(250));
    assert.equal(freeTickets(db), 50);

    db.failOnCall = null;
    const retried = await handler(request(ids));
    assert.equal(retried.success, true);
    assert.equal(retried.complete, true);
    assert.equal(retried.outcome, 'complete');
    assert.equal(retried.revokedCount, 50);
    assert.equal(retried.remainingCount, 0);
    assert.equal(retried.skippedRevoked, 250);
    assert.equal(freeTickets(db), 0);
    assert.equal(totalFreeTickets(db), 10);
    assert.equal(ids.filter((id) => stored(db, 'referrals', id).reward_revoked === true).length, 300);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('15. balance drift stops unsafe revocation and is surfaced without retry', async () => {
    const zeroCommitDb = makeDb({ free_tickets: 1, credits: makeCredits(3) });
    const zeroCommit = makeHandler(zeroCommitDb);
    const blocked = await zeroCommit.handler(request(['c000', 'c001', 'c002']));

    assert.equal(blocked.success, false);
    assert.equal(blocked.complete, false);
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.revokedCount, 0);
    assert.equal(blocked.remainingCount, 3);
    assert.equal(blocked.drift, true);
    assert.equal(blocked.driftObservedBalance, 1);
    assert.equal(blocked.retryable, false);
    assert.match(blocked.message, /reconciliation/);
    assert.equal(freeTickets(zeroCommitDb), 1);
    assertNoNotificationOrLedgerWrites(zeroCommitDb);

    const partialDb = makeDb({ free_tickets: 250, credits: makeCredits(300) });
    const partial = makeHandler(partialDb);
    const partialResult = await partial.handler(
      request(makeCredits(300).map((credit) => credit.id))
    );

    assert.equal(partialResult.success, false);
    assert.equal(partialResult.complete, false);
    assert.equal(partialResult.outcome, 'partial');
    assert.equal(partialResult.revokedCount, 250);
    assert.equal(partialResult.remainingCount, 50);
    assert.equal(partialResult.drift, true);
    assert.equal(partialResult.retryable, false);
    assert.equal(freeTickets(partialDb), 0);
    assertNoNotificationOrLedgerWrites(partialDb);

    const invalidDb = makeDb({ free_tickets: '10', credits: [{ id: 'c1' }] });
    const invalid = makeHandler(invalidDb);
    const invalidResult = await invalid.handler(request(['c1']));

    assert.equal(invalidResult.success, false);
    assert.equal(invalidResult.outcome, 'blocked');
    assert.equal(invalidResult.balanceInvalid, true);
    assert.equal(invalidResult.revokedCount, 0);
    assert.equal(invalidResult.retryable, false);
    assert.equal(freeTickets(invalidDb), '10');
    assertNoNotificationOrLedgerWrites(invalidDb);
  });

  it('16. performs zero notification writes on success, error, partial and retry paths', async () => {
    const db = makeDb({ free_tickets: 300, credits: makeCredits(300) });
    const { handler } = makeHandler(db);

    await assert.rejects(
      () => handler(request(['c000'], { uid: 'nonadmin' })),
      (error) => error.code === 'permission-denied'
    );
    await assert.rejects(
      () => handler(request(['c000'], { reason: '   ' })),
      (error) => error.code === 'invalid-argument'
    );
    assertNoNotificationOrLedgerWrites(db);

    db.failOnCall = (callIndex) => (callIndex === 2 ? new Error('simulated commit failure') : null);
    const partial = await handler(request(makeCredits(300).map((credit) => credit.id)));
    assert.equal(partial.complete, false);
    assert.equal(partial.success, false);
    assert.equal(partial.outcome, 'partial');
    assertNoNotificationOrLedgerWrites(db);

    db.failOnCall = null;
    const retried = await handler(request(makeCredits(300).map((credit) => credit.id)));
    assert.equal(retried.complete, true);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('17. a credit state change aborts the chunk and is excluded from the retry set', async () => {
    const db = makeDb({ free_tickets: 10, credits: makeCredits(3) });
    const { handler } = makeHandler(db);

    db.beforeTransaction = () => {
      const collection = db.collectionStore('referrals');
      collection.set('c001', { ...collection.get('c001'), reward_type: 'referral' });
    };

    const first = await handler(request(['c000', 'c001', 'c002']));
    assert.equal(first.success, false);
    assert.equal(first.complete, false);
    assert.equal(first.outcome, 'blocked');
    assert.equal(first.revokedCount, 0);
    assert.equal(first.stateChangeCount, 1);
    assert.equal(first.remainingCount, 2);
    assert.equal(first.retryable, true);
    assert.deepEqual(first.retryableCreditIds, ['c000', 'c002']);
    assert.equal(first.stateChanges[0].id, 'c001');
    assert.equal(freeTickets(db), 10);
    assert.notEqual(stored(db, 'referrals', 'c001').reward_revoked, true);

    const retried = await handler(request(['c000', 'c002']));
    assert.equal(retried.success, true);
    assert.equal(retried.complete, true);
    assert.equal(retried.revokedCount, 2);
    assert.equal(freeTickets(db), 8);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('18. unsupported reward values are rejected before mutation', async () => {
    const db = makeDb({ credits: [{ id: 'bad', reward_value: 2 }, { id: 'good' }] });
    const { handler } = makeHandler(db);

    await assert.rejects(
      () => handler(request(['bad', 'good'])),
      (error) => error.code === 'failed-precondition' && /reward_value/.test(error.message)
    );

    assert.notEqual(stored(db, 'referrals', 'bad').reward_revoked, true);
    assert.notEqual(stored(db, 'referrals', 'good').reward_revoked, true);
    assert.equal(freeTickets(db), 10);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('19. malformed issuance or revocation flags are rejected without mutation or retry candidates', async () => {
    const db = makeDb({
      free_tickets: 10,
      credits: [
        { id: 'malformedIssued', extra: { reward_issued: 'true' } },
        { id: 'malformedRevoked', extra: { reward_revoked: 'true' } },
        { id: 'validUnused' },
      ],
    });
    const { handler } = makeHandler(db);

    await assert.rejects(
      () => handler(request(['malformedIssued', 'malformedRevoked', 'validUnused'])),
      (error) => error.code === 'failed-precondition' && /malformed issuance\/revocation flags/.test(error.message)
    );

    assert.notEqual(stored(db, 'referrals', 'malformedIssued').reward_revoked, true);
    assert.notEqual(stored(db, 'referrals', 'malformedRevoked').reward_revoked, true);
    assert.notEqual(stored(db, 'referrals', 'validUnused').reward_revoked, true);
    assert.equal(freeTickets(db), 10);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('20. an omitted reward_revoked flag remains compatible with active repository grants', async () => {
    const db = makeDb({ credits: [{ id: 'active', extra: { reward_revoked: undefined } }] });
    const { handler } = makeHandler(db);
    delete stored(db, 'referrals', 'active').reward_revoked;

    const result = await handler(request(['active']));

    assert.equal(result.complete, true);
    assert.equal(result.revokedCount, 1);
    assert.equal(freeTickets(db), 9);
    assertNoNotificationOrLedgerWrites(db);
  });

  it('21. a missing reward_issued flag is conservatively rejected without mutation', async () => {
    const db = makeDb({ credits: [{ id: 'legacyUnknown', extra: { reward_issued: undefined } }] });
    const { handler } = makeHandler(db);
    delete stored(db, 'referrals', 'legacyUnknown').reward_issued;

    await assert.rejects(
      () => handler(request(['legacyUnknown'])),
      (error) => error.code === 'failed-precondition' && /malformed issuance\/revocation flags/.test(error.message)
    );

    assert.notEqual(stored(db, 'referrals', 'legacyUnknown').reward_revoked, true);
    assert.equal(freeTickets(db), 10);
    assertNoNotificationOrLedgerWrites(db);
  });
});
