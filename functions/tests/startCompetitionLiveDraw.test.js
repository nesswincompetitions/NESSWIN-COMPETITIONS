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
import { getLiveDrawStartBlock } from '../services/ticketAdjustmentPolicy.js';
import { createStartCompetitionLiveDrawHandler } from '../services/liveDrawService.js';

const PAST_DRAW = new Date(Date.now() - 60 * 1000);
const FUTURE_DRAW = new Date(Date.now() + 60 * 60 * 1000);

function makeHandler(db, assertAdmin = async () => 'admin1') {
  return createStartCompetitionLiveDrawHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin,
    HttpsError: MockHttpsError,
  });
}

function seed(db, overrides = {}) {
  db.setDocument('competition', 'c1', {
    title: 'Test Competition',
    status: 'ready_to_draw',
    draw_date: PAST_DRAW,
    instagram_live_url: 'https://instagram.com/live/test',
    ...overrides,
  });
}

const READY = {
  status: 'ready_to_draw',
  draw_date: PAST_DRAW,
  instagram_live_url: 'https://instagram.com/live/test',
};

describe('live draw start policy', () => {
  it('allows a ready competition whose draw date has been reached', () => {
    assert.equal(getLiveDrawStartBlock(READY), null);
    assert.equal(getLiveDrawStartBlock({ ...READY, status: 'READY_TO_DRAW' }), null);
  });

  it('rejects invalid states, winner references, draw-date problems, and missing live URL', () => {
    assert.match(
      getLiveDrawStartBlock({ ...READY, status: 'drawing' }),
      /already started/
    );
    assert.match(
      getLiveDrawStartBlock({ ...READY, status: 'active' }),
      /ready to draw/
    );
    assert.match(
      getLiveDrawStartBlock({ ...READY, winner_ref: 'user/u1' }),
      /winner/
    );
    assert.match(
      getLiveDrawStartBlock({ ...READY, draw_date: undefined }),
      /missing/
    );
    assert.match(
      getLiveDrawStartBlock({ ...READY, draw_date: 'not-a-date' }),
      /invalid/
    );
    assert.match(
      getLiveDrawStartBlock({ ...READY, draw_date: FUTURE_DRAW }),
      /not been reached/
    );
    assert.match(
      getLiveDrawStartBlock({ ...READY, instagram_live_url: '' }),
      /Instagram Live URL/
    );
  });
});

describe('startCompetitionLiveDraw handler', () => {
  it('performs the transition atomically for an authorized admin', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await makeHandler(db)({
      auth: { uid: 'admin1' },
      data: { competitionId: 'c1' },
    });

    assert.deepEqual(result, {
      success: true,
      competitionId: 'c1',
      status: 'drawing',
    });
    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.status, 'drawing');
    assert.equal(competition.draw_started_at.__mockServerTimestamp, true);
  });

  it('rejects unauthorized callers without writes', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      makeHandler(db, async () => {
        throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
      })({ auth: { uid: 'user1' }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'permission-denied'
    );
    assert.equal(db.snapshot('competition', 'c1').data().status, 'ready_to_draw');
  });

  it('rejects invalid states, future draw dates, and missing competitions', async () => {
    const activeDb = new MemoryDB();
    seed(activeDb, { status: 'active' });
    await assert.rejects(
      makeHandler(activeDb)({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(activeDb.snapshot('competition', 'c1').data().status, 'active');

    const futureDb = new MemoryDB();
    seed(futureDb, { draw_date: FUTURE_DRAW });
    await assert.rejects(
      makeHandler(futureDb)({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(futureDb.snapshot('competition', 'c1').data().status, 'ready_to_draw');

    const missingDb = new MemoryDB();
    await assert.rejects(
      makeHandler(missingDb)({ auth: { uid: 'admin1' }, data: { competitionId: 'missing' } }),
      (error) => error.code === 'not-found'
    );
  });

  it('handles duplicate transitions safely', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    await handler({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } });
    await assert.rejects(
      handler({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'failed-precondition' && /already started/.test(error.message)
    );
    assert.equal(db.snapshot('competition', 'c1').data().status, 'drawing');
  });

  it('serializes concurrent duplicate transitions', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeHandler(db);

    const results = await Promise.allSettled([
      handler({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } }),
      handler({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(db.snapshot('competition', 'c1').data().status, 'drawing');
  });

  it('frontend service no longer writes the protected status directly', () => {
    const source = fs.readFileSync(
      fileURLToPath(
        new URL('../../src/modules/admin/competitions/services/winnerWorkflowService.js', import.meta.url)
      ),
      'utf8'
    );

    assert.equal(source.includes('updateDoc('), false);
    assert.equal(source.includes("status: 'drawing'"), false);
    assert.equal(source.includes('startCompetitionLiveDraw'), true);
  });
});
