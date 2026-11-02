import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import { createStartCompetitionLiveDrawHandler } from '../services/liveDrawService.js';
import { getParticipantRemovalDrawBlock } from '../services/ticketAdjustmentAudit.js';
import {
  createCompetitionLifecycleReconciler,
  reactivateFutureReadyToDrawCompetition,
  reconcileDueCompetitionDrawState,
  scheduleCompetitionDrawTaskFromAuthoritativeState,
  transitionCompetitionToReadyToDraw,
} from '../controllers/competitionStatusCloudTasksController.js';

const NOW = Date.now();
const PAST_DRAW = new Date(NOW - 60_000);
const ADMIN_UID = 'admin1';
const COMPETITION_ID = 'c1';

function makeLiveDrawHandler(db) {
  return createStartCompetitionLiveDrawHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: async () => ADMIN_UID,
    HttpsError: MockHttpsError,
  });
}

function liveDrawRequest() {
  return { auth: { uid: ADMIN_UID }, data: { competitionId: COMPETITION_ID } };
}

const TEST_TASK_ID = 'test-draw-task-1';

function runReadyTransition(db, dispatchedTaskId = TEST_TASK_ID) {
  const competition = db.snapshot('competition', COMPETITION_ID).data();
  db.setDocument('competition', COMPETITION_ID, {
    ...competition,
    draw_task_id: dispatchedTaskId,
  });

  return transitionCompetitionToReadyToDraw({
    db,
    admin: createMockAdmin(),
    competitionId: COMPETITION_ID,
    dispatchedTaskId,
    now: NOW,
    logger: createMockLogger(),
  });
}

function runDueState(db) {
  return reconcileDueCompetitionDrawState({
    db,
    admin: createMockAdmin(),
    competitionId: COMPETITION_ID,
    now: NOW,
  });
}

function seedScenario(
  db,
  { status = 'ready_to_draw', restricted = false, adjustments = [] } = {}
) {
  const user1Ref = db.collection('user').doc('u1');
  const user2Ref = db.collection('user').doc('u2');
  const competitionRef = db.collection('competition').doc(COMPETITION_ID);

  db.setDocument('competition', COMPETITION_ID, {
    title: 'Draw Safety Competition',
    status,
    draw_date: PAST_DRAW,
    instagram_live_url: 'https://instagram.com/live/test',
    restricted_participants:
      restricted === 'both' ? [user1Ref, user2Ref] : restricted ? [user1Ref] : [],
  });

  for (const adjustment of adjustments) {
    const {
      requestId,
      index = 0,
      complete = false,
      userId = 'u1',
      createdAt = NOW,
      noop = false,
      competitionId = COMPETITION_ID,
    } = adjustment;
    const userRef = db.collection('user').doc(userId);
    const recordCompetitionRef = db.collection('competition').doc(competitionId);
    const documentId = noop ? requestId : `${requestId}:chunk:${index}`;

    db.setDocument('ticket_adjustments', documentId, {
      operation: 'ticket_invalidation',
      source: 'admin_all_active_tickets',
      request_id: requestId,
      user_ref: userRef,
      competition_ref: recordCompetitionRef,
      reason: 'Administrative participant removal',
      result: {
        mode: 'participant_removal',
        noop,
        restrictedFutureParticipation: true,
        complete,
      },
      created_at: createdAt,
    });
  }

  return { user1Ref, user2Ref, competitionRef };
}

async function assertBothPathsBlocked(seed) {
  const liveDb = new MemoryDB();
  seedScenario(liveDb, { ...seed, status: 'ready_to_draw' });
  await assert.rejects(
    makeLiveDrawHandler(liveDb)(liveDrawRequest()),
    (error) =>
      error.code === 'failed-precondition' &&
      /removal|incomplete|ambiguous|not complete/i.test(error.message)
  );
  assert.equal(liveDb.snapshot('competition', COMPETITION_ID).data().status, 'ready_to_draw');

  const readyDb = new MemoryDB();
  seedScenario(readyDb, { ...seed, status: 'active' });
  const result = await runReadyTransition(readyDb);
  assert.equal(result.outcome, 'blocked');
  assert.equal(readyDb.snapshot('competition', COMPETITION_ID).data().status, 'active');
}

async function assertBothPathsAllowed(seed) {
  const liveDb = new MemoryDB();
  seedScenario(liveDb, { ...seed, status: 'ready_to_draw' });
  const liveResult = await makeLiveDrawHandler(liveDb)(liveDrawRequest());
  assert.equal(liveResult.status, 'drawing');
  assert.equal(liveDb.snapshot('competition', COMPETITION_ID).data().status, 'drawing');

  const readyDb = new MemoryDB();
  seedScenario(readyDb, { ...seed, status: 'active' });
  const readyResult = await runReadyTransition(readyDb);
  assert.equal(readyResult.outcome, 'ready_to_draw');
  assert.equal(readyDb.snapshot('competition', COMPETITION_ID).data().status, 'ready_to_draw');
}

describe('draw safety for participant removal', () => {
  it('allows both draw paths when no participant is restricted', async () => {
    await assertBothPathsAllowed({ restricted: false, adjustments: [] });
  });

  it('allows both draw paths after a completed single-chunk removal', async () => {
    await assertBothPathsAllowed({
      restricted: true,
      adjustments: [{ requestId: 'req-complete-1', index: 0, complete: true }],
    });
  });

  it('allows both draw paths after a completed multi-chunk removal', async () => {
    await assertBothPathsAllowed({
      restricted: true,
      adjustments: [
        { requestId: 'req-complete-2', index: 0, complete: false, createdAt: NOW - 2000 },
        { requestId: 'req-complete-2', index: 1, complete: true, createdAt: NOW - 1000 },
      ],
    });
  });

  it('allows both draw paths after a completed no-op removal', async () => {
    await assertBothPathsAllowed({
      restricted: true,
      adjustments: [{ requestId: 'req-noop', noop: true, complete: true }],
    });
  });

  it('blocks both draw paths when a restriction has no removal progress record', async () => {
    await assertBothPathsBlocked({ restricted: true, adjustments: [] });
  });

  it('blocks both draw paths for a partially completed multi-chunk removal', async () => {
    await assertBothPathsBlocked({
      restricted: true,
      adjustments: [
        { requestId: 'req-partial', index: 0, complete: false, createdAt: NOW - 2000 },
        { requestId: 'req-partial', index: 1, complete: false, createdAt: NOW - 1000 },
      ],
    });
  });

  it('blocks both draw paths when invalidation failed after the restriction fence', async () => {
    await assertBothPathsBlocked({
      restricted: true,
      adjustments: [{ requestId: 'req-failed', index: 0, complete: false }],
    });
  });

  it('blocks both draw paths when any of multiple restricted participants is incomplete', async () => {
    await assertBothPathsBlocked({
      restricted: 'both',
      adjustments: [
        { requestId: 'req-user-1', userId: 'u1', index: 0, complete: true },
        { requestId: 'req-user-2', userId: 'u2', index: 0, complete: false },
      ],
    });
  });

  it('blocks both draw paths for a chunk gap', async () => {
    await assertBothPathsBlocked({
      restricted: true,
      adjustments: [
        { requestId: 'req-gap', index: 0, complete: false, createdAt: NOW - 3000 },
        { requestId: 'req-gap', index: 2, complete: true, createdAt: NOW - 1000 },
      ],
    });
  });

  it('allows both draw paths when a newer complete removal supersedes an older incomplete attempt', async () => {
    await assertBothPathsAllowed({
      restricted: true,
      adjustments: [
        { requestId: 'req-old', index: 0, complete: false, createdAt: NOW - 5000 },
        { requestId: 'req-new', index: 0, complete: true, createdAt: NOW },
      ],
    });
  });

  it('scopes removal progress to the current competition', async () => {
    await assertBothPathsAllowed({
      restricted: true,
      adjustments: [
        { requestId: 'req-current-complete', index: 0, complete: true, competitionId: 'c1' },
        { requestId: 'req-other-incomplete', index: 0, complete: false, competitionId: 'c2' },
      ],
    });
  });
});

describe('draw-guard query shape', () => {
  it('queries ticket_adjustments by both participant and competition', async () => {
    const db = new MemoryDB();
    const userRef = db.collection('user').doc('u1');
    let capturedQuery = null;

    const result = await getParticipantRemovalDrawBlock({
      db,
      competitionId: COMPETITION_ID,
      competitionData: { restricted_participants: [userRef] },
      readQuery: (query) => {
        capturedQuery = query;
        return Promise.resolve({ docs: [] });
      },
    });

    assert.match(result, /No completed removal record/);
    assert.ok(capturedQuery);
    assert.ok(
      capturedQuery.constraints.some(
        (constraint) =>
          constraint.field === 'user_ref' &&
          constraint.operator === '==' &&
          constraint.value.path === 'user/u1'
      )
    );
    assert.ok(
      capturedQuery.constraints.some(
        (constraint) =>
          constraint.field === 'competition_ref' &&
          constraint.operator === '==' &&
          constraint.value.path === `competition/${COMPETITION_ID}`
      )
    );
  });
});

describe('lifecycle draw-state transaction', () => {
  function attachTaskId(db, taskId = 'task-1') {
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    db.setDocument('competition', COMPETITION_ID, {
      ...competition,
      draw_task_id: taskId,
    });
  }

  it('blocks lifecycle progression for an incomplete removal without clearing the draw task', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active', restricted: true });
    attachTaskId(db);

    const result = await runDueState(db);

    assert.equal(result.outcome, 'blocked');
    assert.deepEqual(result.taskIds, []);
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, 'task-1');
  });

  it('advances lifecycle progression after a completed removal', async () => {
    const db = new MemoryDB();
    seedScenario(db, {
      status: 'active',
      restricted: true,
      adjustments: [
        { requestId: 'req-lifecycle-complete', index: 0, complete: true },
      ],
    });
    attachTaskId(db);

    const result = await runDueState(db);

    assert.equal(result.outcome, 'ready_to_draw');
    assert.deepEqual(result.taskIds, ['task-1']);
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'ready_to_draw');
    assert.equal(competition.draw_task_id, undefined);
  });

  it('blocks when a restriction commits before the lifecycle authoritative read', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active', restricted: false });
    db.beforeTransaction = async () => {
      const competition = db.snapshot('competition', COMPETITION_ID).data();
      db.setDocument('competition', COMPETITION_ID, {
        ...competition,
        restricted_participants: [db.collection('user').doc('u1')],
      });
    };

    const result = await runDueState(db);

    assert.equal(result.outcome, 'blocked');
    assert.equal(db.snapshot('competition', COMPETITION_ID).data().status, 'active');
  });

  it('retries and blocks when a restriction commits after the lifecycle transaction read', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active', restricted: false });
    attachTaskId(db);
    let injected = false;
    db.afterTransactionRead = (ref) => {
      if (ref.path === `competition/${COMPETITION_ID}` && !injected) {
        injected = true;
        const competition = db.snapshot('competition', COMPETITION_ID).data();
        db.setDocument('competition', COMPETITION_ID, {
          ...competition,
          restricted_participants: [db.collection('user').doc('u1')],
        });
      }
    };

    const result = await runDueState(db);

    assert.equal(result.outcome, 'blocked');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, 'task-1');
  });
});

describe('lifecycle draw-state idempotency', () => {
  function attachTaskId(db, taskId = 'task-1') {
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    db.setDocument('competition', COMPETITION_ID, {
      ...competition,
      draw_task_id: taskId,
    });
  }

  function competitionVersion(db) {
    return db.version(`competition/${COMPETITION_ID}`);
  }

  it('transitions an eligible competition to ready_to_draw on the first invocation', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active' });

    const result = await runDueState(db);

    assert.equal(result.outcome, 'ready_to_draw');
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().status,
      'ready_to_draw'
    );
  });

  it('performs no write on repeated invocations after the ready transition', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active' });

    const first = await runDueState(db);
    assert.equal(first.outcome, 'ready_to_draw');

    const versionAfterFirst = competitionVersion(db);
    const updatedAtAfterFirst =
      db.snapshot('competition', COMPETITION_ID).data().updated_at;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const repeated = await runDueState(db);
      assert.equal(repeated.outcome, 'already_ready');
      assert.deepEqual(repeated.taskIds, []);
    }

    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competitionVersion(db), versionAfterFirst);
    assert.equal(competition.status, 'ready_to_draw');
    assert.strictEqual(competition.updated_at, updatedAtAfterFirst);
  });

  it('clears a stale draw task exactly once on an already-ready competition', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'ready_to_draw' });
    attachTaskId(db, 'stale-task-1');

    const versionBefore = competitionVersion(db);

    const first = await runDueState(db);
    assert.equal(first.outcome, 'already_ready');
    assert.deepEqual(first.taskIds, ['stale-task-1']);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      undefined
    );

    const versionAfterFirst = competitionVersion(db);
    assert.equal(versionAfterFirst, versionBefore + 1);

    const second = await runDueState(db);
    assert.equal(second.outcome, 'already_ready');
    assert.deepEqual(second.taskIds, []);
    assert.equal(competitionVersion(db), versionAfterFirst);
  });

  it('performs no write when the participant-removal guard blocks', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active', restricted: true });

    const versionBefore = competitionVersion(db);
    const result = await runDueState(db);

    assert.equal(result.outcome, 'blocked');
    assert.equal(competitionVersion(db), versionBefore);
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, undefined);
  });

  it('performs no write when an already-ready competition is still protected', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'drawing' });

    const versionBefore = competitionVersion(db);
    const result = await runDueState(db);

    assert.equal(result.outcome, 'not_pre_draw');
    assert.equal(competitionVersion(db), versionBefore);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().status,
      'drawing'
    );
  });
});

describe('lifecycle reconciliation idempotency and task ordering', () => {
  function competitionRef(db) {
    return db.collection('competition').doc(COMPETITION_ID);
  }

  function competitionData(db) {
    return db.snapshot('competition', COMPETITION_ID).data();
  }

  function competitionVersion(db) {
    return db.version(`competition/${COMPETITION_ID}`);
  }

  function makeReconciler(db, overrides = {}) {
    return createCompetitionLifecycleReconciler({
      db,
      admin: createMockAdmin(),
      now: () => NOW,
      logger: createMockLogger(),
      deleteTask: async () => {},
      scheduleDrawTask: async () => {},
      ...overrides,
    });
  }

  it('deletes a stale task externally only after the due-state transaction commits', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active' });
    const competition = competitionData(db);
    db.setDocument('competition', COMPETITION_ID, {
      ...competition,
      draw_task_id: 'task-1',
    });

    const observed = [];
    const reconcile = makeReconciler(db, {
      deleteTask: async (taskId) => {
        const committed = competitionData(db);
        observed.push({
          taskId,
          status: committed.status,
          drawTaskId: committed.draw_task_id,
        });
      },
    });

    const eventData = competitionData(db);
    await reconcile({
      competitionRef: competitionRef(db),
      competitionId: COMPETITION_ID,
      beforeData: eventData,
      afterData: eventData,
    });

    assert.equal(observed.length, 1);
    assert.deepEqual(observed[0], {
      taskId: 'task-1',
      status: 'ready_to_draw',
      drawTaskId: undefined,
    });
    assert.equal(competitionData(db).status, 'ready_to_draw');
  });

  it('does not delete tasks when the due-state transaction fails', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active' });
    const competition = competitionData(db);
    db.setDocument('competition', COMPETITION_ID, {
      ...competition,
      draw_task_id: 'task-1',
    });

    let deletes = 0;
    const reconcile = makeReconciler(db, {
      deleteTask: async () => {
        deletes += 1;
      },
      reconcileDueDrawState: async () => {
        throw new Error('authoritative transaction failed');
      },
    });

    const eventData = competitionData(db);
    await assert.rejects(
      reconcile({
        competitionRef: competitionRef(db),
        competitionId: COMPETITION_ID,
        beforeData: eventData,
        afterData: eventData,
      }),
      /authoritative transaction failed/
    );

    assert.equal(deletes, 0);
    assert.equal(competitionData(db).status, 'active');
  });

  it('does not regress an already-ready competition from a stale future-date event', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'ready_to_draw' });
    const staleFutureDraw = new Date(NOW + 60_000);
    const versionBefore = competitionVersion(db);
    const scheduleCalls = [];

    const reconcile = makeReconciler(db, {
      scheduleDrawTask: async (...args) => {
        scheduleCalls.push(args);
      },
    });

    const staleEvent = {
      status: 'ready_to_draw',
      draw_date: staleFutureDraw,
      instagram_live_url: 'https://instagram.com/live/test',
      restricted_participants: [],
    };

    await reconcile({
      competitionRef: competitionRef(db),
      competitionId: COMPETITION_ID,
      beforeData: staleEvent,
      afterData: staleEvent,
    });

    assert.equal(competitionData(db).status, 'ready_to_draw');
    assert.equal(competitionVersion(db), versionBefore);
    assert.equal(scheduleCalls.length, 1);
  });

  it('still blocks draw progression when a restriction commits before the authoritative read', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'active' });
    db.beforeTransaction = async () => {
      const competition = competitionData(db);
      db.setDocument('competition', COMPETITION_ID, {
        ...competition,
        restricted_participants: [db.collection('user').doc('u1')],
      });
    };

    let deletes = 0;
    const reconcile = makeReconciler(db, {
      deleteTask: async () => {
        deletes += 1;
      },
    });

    const eventData = {
      status: 'active',
      draw_date: PAST_DRAW,
      restricted_participants: [],
    };

    await reconcile({
      competitionRef: competitionRef(db),
      competitionId: COMPETITION_ID,
      beforeData: eventData,
      afterData: eventData,
    });

    assert.equal(competitionData(db).status, 'active');
    assert.equal(deletes, 0);
  });
});

describe('future ready_to_draw reactivation guard', () => {
  it('reactivates only an authoritative future-dated ready competition', async () => {
    const db = new MemoryDB();
    seedScenario(db, { status: 'ready_to_draw' });
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    db.setDocument('competition', COMPETITION_ID, {
      ...competition,
      draw_date: new Date(NOW + 60_000),
    });

    const result = await reactivateFutureReadyToDrawCompetition({
      db,
      admin: createMockAdmin(),
      competitionId: COMPETITION_ID,
      now: NOW,
    });

    assert.equal(result.outcome, 'reactivated');
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().status,
      'active'
    );
  });

  it('does not regress a ready competition whose authoritative draw date has passed', async () => {
    for (const status of ['drawing', 'completed', 'cancelled', 'paused']) {
      const db = new MemoryDB();
      seedScenario(db, { status });
      const versionBefore = db.version(`competition/${COMPETITION_ID}`);

      const result = await reactivateFutureReadyToDrawCompetition({
        db,
        admin: createMockAdmin(),
        competitionId: COMPETITION_ID,
        now: NOW,
      });

      assert.notEqual(result.outcome, 'reactivated');
      assert.equal(db.snapshot('competition', COMPETITION_ID).data().status, status);
      assert.equal(db.version(`competition/${COMPETITION_ID}`), versionBefore);
    }

    const db = new MemoryDB();
    seedScenario(db, { status: 'ready_to_draw' });
    const versionBefore = db.version(`competition/${COMPETITION_ID}`);

    const result = await reactivateFutureReadyToDrawCompetition({
      db,
      admin: createMockAdmin(),
      competitionId: COMPETITION_ID,
      now: NOW,
    });

    assert.equal(result.outcome, 'not_future');
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().status,
      'ready_to_draw'
    );
    assert.equal(db.version(`competition/${COMPETITION_ID}`), versionBefore);
  });
});

describe('authoritative draw-task scheduling', () => {
  const HOUR = 60 * 60 * 1000;

  function expectedTaskId(drawDate) {
    return `draw-${COMPETITION_ID}-${drawDate.getTime()}`;
  }

  function seedFutureDraw(
    db,
    { status = 'active', drawDate = new Date(NOW + HOUR), taskId } = {}
  ) {
    db.setDocument('competition', COMPETITION_ID, {
      title: 'Scheduling Competition',
      status,
      draw_date: drawDate,
      restricted_participants: [],
      ...(taskId ? { draw_task_id: taskId } : {}),
    });
    return drawDate;
  }

  function runScheduler(db, params = {}, overrides = {}) {
    return scheduleCompetitionDrawTaskFromAuthoritativeState({
      db,
      admin: createMockAdmin(),
      now: NOW,
      logger: createMockLogger(),
      deleteTask: async () => {},
      ...overrides,
      ...params,
    });
  }

  it('schedules and stores the task for the authoritative draw date', async () => {
    const db = new MemoryDB();
    const drawDate = seedFutureDraw(db);
    const created = [];

    const result = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: drawDate },
      {
        createTask: async (competitionId, date) => {
          created.push({ competitionId, millis: date.getTime() });
          return expectedTaskId(date);
        },
      }
    );

    assert.equal(result.outcome, 'scheduled');
    assert.deepEqual(created, [
      { competitionId: COMPETITION_ID, millis: drawDate.getTime() },
    ]);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      expectedTaskId(drawDate)
    );
  });

  it('does not schedule a task from a stale event draw date', async () => {
    const db = new MemoryDB();
    const authoritativeDrawDate = seedFutureDraw(db, {
      drawDate: new Date(NOW + 2 * HOUR),
    });
    let creates = 0;

    const result = await runScheduler(
      db,
      {
        competitionId: COMPETITION_ID,
        eventDrawDate: new Date(NOW + HOUR),
      },
      {
        createTask: async () => {
          creates += 1;
          return 'obsolete-task';
        },
      }
    );

    assert.equal(result.outcome, 'stale_event');
    assert.equal(result.authoritativeDrawDate, authoritativeDrawDate.getTime());
    assert.equal(creates, 0);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      undefined
    );
  });

  it('does not schedule for a status that no longer permits draw scheduling', async () => {
    const db = new MemoryDB();
    seedFutureDraw(db, { status: 'draft' });
    let creates = 0;

    const result = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: new Date(NOW + HOUR) },
      {
        createTask: async () => {
          creates += 1;
          return 'should-not-exist';
        },
      }
    );

    assert.equal(result.outcome, 'not_schedulable');
    assert.equal(creates, 0);
  });

  it('does not create a duplicate task when the authoritative task is already stored', async () => {
    const db = new MemoryDB();
    const drawDate = seedFutureDraw(db);
    db.setDocument('competition', COMPETITION_ID, {
      ...db.snapshot('competition', COMPETITION_ID).data(),
      draw_task_id: expectedTaskId(drawDate),
    });
    let creates = 0;

    const result = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: drawDate },
      {
        createTask: async () => {
          creates += 1;
          return expectedTaskId(drawDate);
        },
      }
    );

    assert.equal(result.outcome, 'already_scheduled');
    assert.equal(creates, 0);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      expectedTaskId(drawDate)
    );
  });

  it('does not overwrite a newer stored task ID', async () => {
    const db = new MemoryDB();
    const drawDate = seedFutureDraw(db);
    const newerTaskId = `draw-${COMPETITION_ID}-${drawDate.getTime() + HOUR}`;
    db.setDocument('competition', COMPETITION_ID, {
      ...db.snapshot('competition', COMPETITION_ID).data(),
      draw_task_id: newerTaskId,
    });

    const deleted = [];
    const result = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: drawDate },
      {
        createTask: async () => expectedTaskId(drawDate),
        deleteTask: async (taskId) => {
          deleted.push(taskId);
        },
      }
    );

    assert.equal(result.outcome, 'persist_rejected');
    assert.equal(result.reason, 'newer_or_unknown_task_present');
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      newerTaskId
    );
    assert.deepEqual(deleted, []);
  });

  it('does not delete a created task when persistence is rejected after a draw-date change', async () => {
    const db = new MemoryDB();
    const originalDrawDate = seedFutureDraw(db);
    const newerDrawDate = new Date(originalDrawDate.getTime() + HOUR);
    const obsoleteTaskId = expectedTaskId(originalDrawDate);
    const newerTaskId = expectedTaskId(newerDrawDate);
    const deleted = [];

    const result = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: originalDrawDate },
      {
        createTask: async () => {
          // A newer lifecycle event commits while the old task is being created.
          db.setDocument('competition', COMPETITION_ID, {
            ...db.snapshot('competition', COMPETITION_ID).data(),
            draw_date: newerDrawDate,
            draw_task_id: newerTaskId,
          });
          return obsoleteTaskId;
        },
        deleteTask: async (taskId) => {
          deleted.push(taskId);
        },
      }
    );

    assert.equal(result.outcome, 'persist_rejected');
    assert.equal(result.reason, 'draw_date_changed');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.draw_task_id, newerTaskId);
    assert.equal(competition.draw_date.getTime(), newerDrawDate.getTime());
    assert.deepEqual(deleted, []);
  });

  it('retains a superseded task after persisting the replacement', async () => {
    const db = new MemoryDB();
    const newerDrawDate = new Date(NOW + 2 * HOUR);
    const obsoleteTaskId = expectedTaskId(new Date(NOW + HOUR));
    seedFutureDraw(db, {
      drawDate: newerDrawDate,
      taskId: obsoleteTaskId,
    });

    const deleted = [];
    const result = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: newerDrawDate },
      {
        createTask: async () => expectedTaskId(newerDrawDate),
        deleteTask: async (taskId) => {
          deleted.push(taskId);
        },
      }
    );

    assert.equal(result.outcome, 'scheduled');
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      expectedTaskId(newerDrawDate)
    );
    assert.deepEqual(deleted, []);
  });

  it('treats an already-existing Cloud Task as idempotent', async () => {
    const db = new MemoryDB();
    const drawDate = seedFutureDraw(db);
    const alreadyExists = Object.assign(new Error('already exists'), {
      code: 6,
    });

    const result = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: drawDate },
      {
        createTask: async () => {
          throw alreadyExists;
        },
      }
    );

    assert.equal(result.outcome, 'scheduled');
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      expectedTaskId(drawDate)
    );
  });

  it('never schedules a stale lifecycle event through the reconciler', async () => {
    const db = new MemoryDB();
    const authoritativeDrawDate = new Date(NOW + 2 * HOUR);
    db.setDocument('competition', COMPETITION_ID, {
      title: 'Scheduling Competition',
      status: 'active',
      draw_date: authoritativeDrawDate,
      restricted_participants: [],
    });

    const created = [];
    const reconcile = createCompetitionLifecycleReconciler({
      db,
      admin: createMockAdmin(),
      now: () => NOW,
      logger: createMockLogger(),
      createTask: async (competitionId, date) => {
        created.push(date.getTime());
        return `draw-${competitionId}-${date.getTime()}`;
      },
      deleteTask: async () => {},
    });

    const staleEvent = {
      status: 'active',
      draw_date: new Date(NOW + HOUR),
      restricted_participants: [],
    };

    await reconcile({
      competitionRef: db.collection('competition').doc(COMPETITION_ID),
      competitionId: COMPETITION_ID,
      beforeData: staleEvent,
      afterData: staleEvent,
    });

    assert.deepEqual(created, []);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      undefined
    );
  });

  it('schedules the authoritative draw date through the reconciler', async () => {
    const db = new MemoryDB();
    const drawDate = new Date(NOW + HOUR);
    db.setDocument('competition', COMPETITION_ID, {
      title: 'Scheduling Competition',
      status: 'active',
      draw_date: drawDate,
      restricted_participants: [],
    });

    const created = [];
    const reconcile = createCompetitionLifecycleReconciler({
      db,
      admin: createMockAdmin(),
      now: () => NOW,
      logger: createMockLogger(),
      createTask: async (competitionId, date) => {
        created.push(date.getTime());
        return `draw-${competitionId}-${date.getTime()}`;
      },
      deleteTask: async () => {},
    });

    const eventData = {
      status: 'active',
      draw_date: drawDate,
      restricted_participants: [],
    };

    await reconcile({
      competitionRef: db.collection('competition').doc(COMPETITION_ID),
      competitionId: COMPETITION_ID,
      beforeData: eventData,
      afterData: eventData,
    });

    assert.deepEqual(created, [drawDate.getTime()]);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      expectedTaskId(drawDate)
    );
  });

  it('does not delete a created task when the persistence transaction throws', async () => {
    const db = new MemoryDB();
    const drawDate = seedFutureDraw(db);
    const createdTaskId = expectedTaskId(drawDate);
    const deleted = [];
    const originalRunTransaction = db.runTransaction.bind(db);
    db.runTransaction = async () => {
      throw new Error('persistence transaction failed');
    };

    try {
      await assert.rejects(
        runScheduler(
          db,
          { competitionId: COMPETITION_ID, eventDrawDate: drawDate },
          {
            createTask: async () => createdTaskId,
            deleteTask: async (taskId) => {
              deleted.push(taskId);
            },
          }
        ),
        /persistence transaction failed/
      );
    } finally {
      db.runTransaction = originalRunTransaction;
    }

    assert.deepEqual(deleted, []);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      undefined
    );
  });

  it('keeps a rejected task intact so it can become authoritative later', async () => {
    const db = new MemoryDB();
    const originalDrawDate = new Date(NOW + HOUR);
    const newerDrawDate = new Date(NOW + 2 * HOUR);
    const rejectedTaskId = expectedTaskId(originalDrawDate);
    const newerTaskId = expectedTaskId(newerDrawDate);
    seedFutureDraw(db, { drawDate: originalDrawDate });

    const deleted = [];
    let creates = 0;

    const first = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: originalDrawDate },
      {
        createTask: async () => {
          creates += 1;
          db.setDocument('competition', COMPETITION_ID, {
            ...db.snapshot('competition', COMPETITION_ID).data(),
            draw_date: newerDrawDate,
            draw_task_id: newerTaskId,
          });
          return rejectedTaskId;
        },
        deleteTask: async (taskId) => {
          deleted.push(taskId);
        },
      }
    );

    assert.equal(first.outcome, 'persist_rejected');
    assert.equal(first.reason, 'draw_date_changed');
    assert.deepEqual(deleted, []);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      newerTaskId
    );

    // Simulate the newer pointer being cleared and the date returning to D1.
    const releasable = { ...db.snapshot('competition', COMPETITION_ID).data() };
    delete releasable.draw_task_id;
    releasable.draw_date = originalDrawDate;
    db.setDocument('competition', COMPETITION_ID, releasable);

    const second = await runScheduler(
      db,
      { competitionId: COMPETITION_ID, eventDrawDate: originalDrawDate },
      {
        createTask: async () => {
          creates += 1;
          return rejectedTaskId;
        },
        deleteTask: async (taskId) => {
          deleted.push(taskId);
        },
      }
    );

    assert.equal(second.outcome, 'scheduled');
    assert.equal(creates, 2);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      rejectedTaskId
    );
    assert.deepEqual(deleted, []);
  });
});

describe('draw worker authoritative task check', () => {
  const HOUR = 60 * 60 * 1000;

  function seedWorker(
    db,
    { status = 'active', drawDate = PAST_DRAW, taskId, restricted = false } = {}
  ) {
    db.setDocument('competition', COMPETITION_ID, {
      title: 'Worker Authority Competition',
      status,
      draw_date: drawDate,
      ...(taskId ? { draw_task_id: taskId } : {}),
      restricted_participants: restricted
        ? [db.collection('user').doc('u1')]
        : [],
    });
  }

  function runWorker(db, dispatchedTaskId, now = NOW) {
    return transitionCompetitionToReadyToDraw({
      db,
      admin: createMockAdmin(),
      competitionId: COMPETITION_ID,
      dispatchedTaskId,
      now,
      logger: createMockLogger(),
    });
  }

  function competitionVersion(db) {
    return db.version(`competition/${COMPETITION_ID}`);
  }

  it('does not let an orphan task progress while another task ID is stored', async () => {
    const db = new MemoryDB();
    seedWorker(db, { taskId: 'authoritative-task' });
    const versionBefore = competitionVersion(db);

    const result = await runWorker(db, 'orphan-task');

    assert.equal(result.outcome, 'stale_task');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, 'authoritative-task');
    assert.equal(competitionVersion(db), versionBefore);
  });

  it('does not let a task progress when no authoritative task ID is stored', async () => {
    const db = new MemoryDB();
    seedWorker(db, {});
    const versionBefore = competitionVersion(db);

    const result = await runWorker(db, 'orphan-task');

    assert.equal(result.outcome, 'stale_task');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, undefined);
    assert.equal(competitionVersion(db), versionBefore);
  });

  it('does not let a task progress without a dispatched task ID', async () => {
    const db = new MemoryDB();
    seedWorker(db, { taskId: 'task-1' });
    const versionBefore = competitionVersion(db);

    const result = await runWorker(db, null);

    assert.equal(result.outcome, 'stale_task');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, 'task-1');
    assert.equal(competitionVersion(db), versionBefore);
  });

  it('accepts the exact authoritative task ID when all draw conditions pass', async () => {
    const db = new MemoryDB();
    seedWorker(db, { taskId: 'task-1' });

    const result = await runWorker(db, 'task-1');

    assert.equal(result.outcome, 'ready_to_draw');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'ready_to_draw');
    assert.equal(competition.draw_task_id, undefined);
  });

  it('does not progress a matching task before the authoritative draw date', async () => {
    const db = new MemoryDB();
    seedWorker(db, {
      taskId: 'task-1',
      drawDate: new Date(NOW + HOUR),
    });
    const versionBefore = competitionVersion(db);

    const result = await runWorker(db, 'task-1');

    assert.equal(result.outcome, 'not_due');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, 'task-1');
    assert.equal(competitionVersion(db), versionBefore);
  });

  it('does not progress a matching task for a terminal competition', async () => {
    const db = new MemoryDB();
    seedWorker(db, { status: 'cancelled', taskId: 'task-1' });

    const result = await runWorker(db, 'task-1');

    assert.equal(result.outcome, 'terminal');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'cancelled');
    assert.equal(competition.draw_task_id, 'task-1');
  });

  it('still blocks a matching task when participant removal is incomplete', async () => {
    const db = new MemoryDB();
    seedWorker(db, { taskId: 'task-1', restricted: true });

    const result = await runWorker(db, 'task-1');

    assert.equal(result.outcome, 'blocked');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'active');
    assert.equal(competition.draw_task_id, 'task-1');
  });
});

describe('out-of-order draw lifecycle events', () => {
  const HOUR = 60 * 60 * 1000;

  function expectedTaskId(drawDate) {
    return `draw-${COMPETITION_ID}-${drawDate.getTime()}`;
  }

  it('keeps the newer task when a delayed older event arrives and dispatches it when due', async () => {
    const db = new MemoryDB();
    const olderDrawDate = new Date(NOW + HOUR);
    const newerDrawDate = new Date(NOW + 2 * HOUR);
    const newerTaskId = expectedTaskId(newerDrawDate);
    const created = [];

    db.setDocument('competition', COMPETITION_ID, {
      title: 'Out-of-order Competition',
      status: 'active',
      draw_date: newerDrawDate,
      restricted_participants: [],
    });

    const reconcile = createCompetitionLifecycleReconciler({
      db,
      admin: createMockAdmin(),
      now: () => NOW,
      logger: createMockLogger(),
      createTask: async (competitionId, date) => {
        created.push(date.getTime());
        return `draw-${competitionId}-${date.getTime()}`;
      },
      deleteTask: async () => {},
    });

    const newerEvent = {
      status: 'active',
      draw_date: newerDrawDate,
      restricted_participants: [],
    };

    await reconcile({
      competitionRef: db.collection('competition').doc(COMPETITION_ID),
      competitionId: COMPETITION_ID,
      beforeData: null,
      afterData: newerEvent,
    });

    assert.deepEqual(created, [newerDrawDate.getTime()]);
    assert.equal(
      db.snapshot('competition', COMPETITION_ID).data().draw_task_id,
      newerTaskId
    );

    const olderEvent = {
      status: 'active',
      draw_date: olderDrawDate,
      restricted_participants: [],
    };

    await reconcile({
      competitionRef: db.collection('competition').doc(COMPETITION_ID),
      competitionId: COMPETITION_ID,
      beforeData: olderEvent,
      afterData: olderEvent,
    });

    assert.deepEqual(created, [newerDrawDate.getTime()]);
    const afterDelayedEvent = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(afterDelayedEvent.draw_task_id, newerTaskId);
    assert.equal(afterDelayedEvent.draw_date.getTime(), newerDrawDate.getTime());

    const workerResult = await transitionCompetitionToReadyToDraw({
      db,
      admin: createMockAdmin(),
      competitionId: COMPETITION_ID,
      dispatchedTaskId: newerTaskId,
      now: newerDrawDate.getTime() + 1000,
      logger: createMockLogger(),
    });

    assert.equal(workerResult.outcome, 'ready_to_draw');
    const competition = db.snapshot('competition', COMPETITION_ID).data();
    assert.equal(competition.status, 'ready_to_draw');
    assert.equal(competition.draw_task_id, undefined);
  });
});
