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
  MANUAL_REFRESH_COOLDOWN_MS,
  REFRESH_LOCK_TTL_MS,
  createDashboardMetricsService,
} from '../services/dashboardMetricsService.js';

const LOCK_COLLECTION = 'system_metrics';
const LOCK_ID = 'dashboard_refresh_lock';

function createHarness(overrides = {}) {
  const db = new MemoryDB();
  let currentNow = 1_000_000;
  let ownerCounter = 0;

  const service = createDashboardMetricsService({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    HttpsError: MockHttpsError,
    now: () => currentNow,
    ownerId: () => `owner-${++ownerCounter}`,
    recalculateMetrics: async () => ({ total_revenue: 100 }),
    ...overrides,
  });

  return {
    db,
    service,
    now: () => currentNow,
    setNow: value => {
      currentNow = value;
    },
    advance: ms => {
      currentNow += ms;
    },
    lock: () => db.snapshot(LOCK_COLLECTION, LOCK_ID),
    setLock: data => db.setDocument(LOCK_COLLECTION, LOCK_ID, data),
  };
}

function adminAssert(request) {
  if (!request.auth?.uid) {
    throw new MockHttpsError('unauthenticated', 'You must be logged in.');
  }
  if (request.auth.uid !== 'admin-1') {
    throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
  }
  return request.auth.uid;
}

describe('dashboard manual refresh authorization', () => {
  it('rejects unauthenticated callers before recalculation', async () => {
    let calls = 0;
    const harness = createHarness({
      recalculateMetrics: async () => {
        calls += 1;
        return {};
      },
    });

    await assert.rejects(
      harness.service.refreshDashboardMetrics({
        request: { auth: null },
        assertAdmin: adminAssert,
      }),
      error => error.code === 'unauthenticated',
    );
    assert.equal(calls, 0);
  });

  it('rejects authenticated non-admin callers before recalculation', async () => {
    let calls = 0;
    const harness = createHarness({
      recalculateMetrics: async () => {
        calls += 1;
        return {};
      },
    });

    await assert.rejects(
      harness.service.refreshDashboardMetrics({
        request: { auth: { uid: 'user-1' } },
        assertAdmin: adminAssert,
      }),
      error => error.code === 'permission-denied',
    );
    assert.equal(calls, 0);
  });

  it('runs the shared recalculation for an authorized admin and returns success metadata', async () => {
    let calls = 0;
    const harness = createHarness({
      recalculateMetrics: async () => {
        calls += 1;
        return { total_revenue: 123 };
      },
    });

    const result = await harness.service.refreshDashboardMetrics({
      request: { auth: { uid: 'admin-1' } },
      assertAdmin: adminAssert,
    });

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      success: true,
      refreshedAt: 1_000_000,
    });
    assert.equal(harness.lock().data().owner, null);
    assert.equal(harness.lock().data().last_manual_success_at_millis, 1_000_000);
  });
});

describe('dashboard refresh concurrency', () => {
  it('rejects a concurrent manual refresh with a retryable resource-exhausted error', async () => {
    let releaseRecalculation;
    let signalStarted;
    const started = new Promise(resolve => {
      signalStarted = resolve;
    });
    const harness = createHarness({
      recalculateMetrics: async () => {
        signalStarted();
        await new Promise(resolve => {
          releaseRecalculation = resolve;
        });
        return { total_revenue: 1 };
      },
    });

    const first = harness.service.runFullRecalculation({
      source: 'manual',
      manual: true,
      lockMode: 'throw',
    });
    await started;

    await assert.rejects(
      harness.service.runFullRecalculation({
        source: 'manual',
        manual: true,
        lockMode: 'throw',
      }),
      error => error.code === 'resource-exhausted',
    );

    releaseRecalculation();
    await first;
  });

  it('serializes concurrent scheduled recalculations so only one runs at a time', async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    let releaseFirst;
    let signalFirstStarted;
    const firstStarted = new Promise(resolve => {
      signalFirstStarted = resolve;
    });

    const harness = createHarness({
      recalculateMetrics: async () => {
        calls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (calls === 1) {
          signalFirstStarted();
          await new Promise(resolve => {
            releaseFirst = resolve;
          });
        }
        active -= 1;
        return {};
      },
    });

    const first = harness.service.runFullRecalculation({ source: 'schedule', lockMode: 'wait' });
    await firstStarted;
    const second = harness.service.runFullRecalculation({ source: 'schedule', lockMode: 'wait' });

    releaseFirst();
    await Promise.all([first, second]);

    assert.equal(maxActive, 1);
  });

  it('takes over an expired lock', async () => {
    const harness = createHarness();
    harness.setLock({
      owner: 'stale-owner',
      expires_at_millis: harness.now() - 1,
      last_manual_attempt_at_millis: 0,
    });

    await harness.service.runFullRecalculation({
      source: 'manual',
      manual: true,
      lockMode: 'throw',
    });

    assert.equal(harness.lock().data().owner, null);
  });

  it('does not release a lock owned by another execution', async () => {
    let harness;
    harness = createHarness({
      recalculateMetrics: async () => {
        harness.setLock({
          owner: 'other-execution',
          fence: 2,
          expires_at_millis: harness.now() + 60_000,
        });
        return {};
      },
    });

    await assert.rejects(
      harness.service.runFullRecalculation({ source: 'event' }),
      error => error.code === 'aborted',
    );

    assert.equal(harness.lock().data().owner, 'other-execution');
    assert.equal(harness.lock().data().fence, 2);
  });

  it('releases the lock after a failed recalculation and propagates the error', async () => {
    let calls = 0;
    const harness = createHarness({
      recalculateMetrics: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('aggregation failed');
        }
        return {};
      },
    });

    await assert.rejects(
      harness.service.runFullRecalculation({ source: 'manual', manual: true, lockMode: 'throw' }),
      /aggregation failed/,
    );
    assert.equal(harness.lock().data().owner, null);

    harness.advance(MANUAL_REFRESH_COOLDOWN_MS);
    await harness.service.runFullRecalculation({
      source: 'manual',
      manual: true,
      lockMode: 'throw',
    });
    assert.equal(calls, 2);
  });

  it('prevents rapid repeated manual refreshes during the cooldown window', async () => {
    let calls = 0;
    const harness = createHarness({
      recalculateMetrics: async () => {
        calls += 1;
        return {};
      },
    });

    await harness.service.runFullRecalculation({
      source: 'manual',
      manual: true,
      lockMode: 'throw',
    });

    await assert.rejects(
      harness.service.runFullRecalculation({
        source: 'manual',
        manual: true,
        lockMode: 'throw',
      }),
      error => error.code === 'resource-exhausted',
    );

    harness.advance(MANUAL_REFRESH_COOLDOWN_MS);
    await harness.service.runFullRecalculation({
      source: 'manual',
      manual: true,
      lockMode: 'throw',
    });

    assert.equal(calls, 2);
  });
});

describe('dashboard refresh lease fencing', () => {
  it('prevents an expired execution from overwriting a newer refresh after takeover', async () => {
    let releaseFirst;
    let signalFirstStarted;
    const firstStarted = new Promise(resolve => {
      signalFirstStarted = resolve;
    });
    let calls = 0;

    const harness = createHarness({
      recalculateMetrics: async () => {
        calls += 1;
        if (calls === 1) {
          signalFirstStarted();
          await new Promise(resolve => {
            releaseFirst = resolve;
          });
          return { total_revenue: 100, total_orders: 1 };
        }
        return { total_revenue: 200, total_orders: 2 };
      },
    });

    const first = harness.service.runFullRecalculation({ source: 'event', lockMode: 'wait' });
    await firstStarted;

    harness.advance(REFRESH_LOCK_TTL_MS + 1);

    await harness.service.runFullRecalculation({ source: 'event', lockMode: 'wait' });

    assert.equal(
      harness.db.snapshot('system_metrics', 'dashboard').data().total_revenue,
      200,
    );

    releaseFirst();

    await assert.rejects(
      first,
      error => error.code === 'aborted',
    );

    assert.equal(
      harness.db.snapshot('system_metrics', 'dashboard').data().total_revenue,
      200,
    );
    assert.equal(harness.lock().data().owner, null);
  });

  it('rejects the final metrics write when the lease expired even without a takeover', async () => {
    let releaseFirst;
    let signalFirstStarted;
    const firstStarted = new Promise(resolve => {
      signalFirstStarted = resolve;
    });

    const harness = createHarness({
      recalculateMetrics: async () => {
        signalFirstStarted();
        await new Promise(resolve => {
          releaseFirst = resolve;
        });
        return { total_revenue: 300, total_orders: 3 };
      },
    });

    const first = harness.service.runFullRecalculation({ source: 'event', lockMode: 'wait' });
    await firstStarted;

    harness.advance(REFRESH_LOCK_TTL_MS + 1);
    releaseFirst();

    await assert.rejects(
      first,
      error => error.code === 'aborted',
    );

    const dashboardData = harness.db.snapshot('system_metrics', 'dashboard').data();
    assert.equal(dashboardData.total_revenue, undefined);
    assert.equal(dashboardData.total_orders, undefined);
  });
});

describe('dashboard refresh failure handling', () => {
  it('does not expose internal recalculation error details to the client', async () => {
    const harness = createHarness({
      recalculateMetrics: async () => {
        throw new Error('secret internal aggregation detail');
      },
    });

    await assert.rejects(
      harness.service.refreshDashboardMetrics({
        request: { auth: { uid: 'admin-1' } },
        assertAdmin: adminAssert,
      }),
      error => error.code === 'internal' && !error.message.includes('secret internal'),
    );
  });
});

describe('dashboard function registration', () => {
  const indexSource = fs.readFileSync(
    fileURLToPath(new URL('../index.js', import.meta.url)),
    'utf8',
  );
  const controllerSource = fs.readFileSync(
    fileURLToPath(new URL('../controllers/dashboardController.js', import.meta.url)),
    'utf8',
  );

  it('exports the new manual refresh callable', () => {
    assert.match(indexSource, /refreshDashboardMetrics/);
    assert.match(controllerSource, /export const refreshDashboardMetrics = onCall/);
  });

  it('keeps the existing dashboard exports and schedules intact', () => {
    for (const exportName of [
      'onCompetitionChangeDashboard',
      'onCompetitionCreatedDashboard',
      'onCompetitionDeletedDashboard',
      'onUserChangeDashboard',
      'onUserDeletedDashboard',
      'onOrderCreatedDashboard',
      'onOrderUpdatedDashboard',
      'onOrderDeletedDashboard',
      'onChatCreatedDashboard',
      'onChatUpdatedDashboard',
      'syncDashboardMetricsScheduled',
      'onDayChangeSync',
      'syncDashboardMetrics',
    ]) {
      assert.match(indexSource, new RegExp(exportName));
      assert.match(controllerSource, new RegExp(`export const ${exportName}`));
    }
  });

  it('uses the shared dashboard recalculation service', () => {
    assert.match(controllerSource, /createDashboardMetricsService/);
    assert.match(controllerSource, /runFullRecalculation/);
    assert.match(controllerSource, /syncDashboardMetricsScheduled/);
    assert.match(controllerSource, /refreshDashboardMetrics/);
  });
});
