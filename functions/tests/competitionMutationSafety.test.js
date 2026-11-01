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
  createDeleteCompetitionHandler,
  createSaveCompetitionHandler,
} from '../services/competitionMutationService.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const NEXT_DRAW = new Date(Date.now() + 48 * 60 * 60 * 1000);

function makeSaveHandler(db, assertAdmin = async () => 'admin1') {
  return createSaveCompetitionHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin,
    HttpsError: MockHttpsError,
  });
}

function makeDeleteHandler(db, assertAdmin = async () => 'admin1') {
  return createDeleteCompetitionHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin,
    HttpsError: MockHttpsError,
  });
}

function seedCompetition(db, overrides = {}) {
  db.setDocument('competition', 'c1', {
    title: 'Original',
    description: 'Original description',
    category: 'Tech',
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: 96,
    sold_tickets: 4,
    last_ticket_sequence: 4,
    participants: [db.collection('user').doc('u1')],
    status: 'active',
    draw_date: FUTURE_DRAW,
    instagram_live_url: 'https://instagram.com/live/test',
    ...overrides,
  });
}

function saveRequest(overrides = {}) {
  return {
    auth: { uid: 'admin1' },
    data: {
      competitionId: 'c1',
      isDraft: false,
      fields: { title: 'Updated title' },
      ...overrides,
    },
  };
}

function questionPayload(overrides = {}) {
  return {
    question: 'What is the correct answer?',
    images: ['https://example.com/question.png'],
    option: [
      { option_id: 'a', option: 'Option A' },
      { option_id: 'b', option: 'Option B' },
    ],
    answer: { option_id: 'a' },
    ...overrides,
  };
}

function seedQuestion(db, id, overrides = {}) {
  const competitionRef = db.collection('competition').doc('c1');
  db.setDocument('questions', id, {
    competition_id: competitionRef,
    question_id: id,
    question: 'Original question',
    images: [],
    option: [
      { option_id: 'a', option: 'Option A' },
      { option_id: 'b', option: 'Option B' },
    ],
    answer: { option_id: 'a' },
    created_at: { __mockServerTimestamp: true },
    ...overrides,
  });
}

describe('competition mutation safety', () => {
  it('creates a new competition through the guarded handler', async () => {
    const db = new MemoryDB();
    const handler = makeSaveHandler(db);

    const result = await handler(saveRequest({
      competitionId: null,
      fields: {
        title: 'New Competition',
        total_tickets: 50,
        ticket_price: 5,
        description: 'New',
      },
      draw_date_millis: FUTURE_DRAW.getTime(),
    }));

    assert.equal(result.isNew, true);
    assert.equal(result.status, 'active');
    assert.equal(result.transitionedToActive, true);
    const competition = db.snapshot('competition', result.competitionId).data();
    assert.equal(competition.title, 'New Competition');
    assert.equal(competition.stock_quantity, 50);
    assert.equal(competition.sold_tickets, 0);
    assert.equal(competition.last_ticket_sequence, 0);
    assert.equal(competition.created_at.__mockServerTimestamp, true);
  });

  it('updates ordinary fields and preserves ticket/draw state on a draft publish', async () => {
    const db = new MemoryDB();
    seedCompetition(db, { status: 'draft', sold_tickets: 0, stock_quantity: 100, last_ticket_sequence: 0, draw_date: null });

    const result = await makeSaveHandler(db)(saveRequest({
      fields: { title: 'Published', total_tickets: 100 },
      draw_date_millis: NEXT_DRAW.getTime(),
    }));

    assert.equal(result.status, 'active');
    assert.equal(result.transitionedToActive, true);
    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.title, 'Published');
    assert.equal(competition.status, 'active');
    assert.equal(competition.sold_tickets, 0);
    assert.equal(competition.last_ticket_sequence, 0);
    assert.equal(competition.participants.length, 1);
    assert.equal(competition.draw_date.getTime(), NEXT_DRAW.getTime());
  });

  it('rejects privileged draw fields from general edits without writing', async () => {
    const privilegedFields = [
      'status',
      'winner_ref',
      'winner_ticket_ref',
      'draw_started_at',
      'draw_task_id',
      'handover_details',
      'sold_tickets',
      'last_ticket_sequence',
      'participants',
      'stock_quantity',
      'created_at',
      'updated_at',
    ];

    for (const field of privilegedFields) {
      const db = new MemoryDB();
      seedCompetition(db);
      const before = { ...db.snapshot('competition', 'c1').data() };

      await assert.rejects(
        makeSaveHandler(db)(saveRequest({
          fields: { title: 'Changed', [field]: 'tampered' },
        })),
        (error) => error.code === 'invalid-argument'
      );

      assert.deepEqual(db.snapshot('competition', 'c1').data(), before);
    }
  });

  it('rejects edits during ready-to-draw, drawing, announced, and completed states', async () => {
    for (const status of ['ready_to_draw', 'drawing', 'winner_announced', 'completed', 'end', 'closed', 'cancelled', 'deleted']) {
      const db = new MemoryDB();
      seedCompetition(db, { status });

      await assert.rejects(
        makeSaveHandler(db)(saveRequest()),
        (error) => error.code === 'failed-precondition'
      );
      assert.equal(db.snapshot('competition', 'c1').data().title, 'Original');
      assert.equal(db.snapshot('competition', 'c1').data().status, status);
    }
  });

  it('rejects edits when winner references exist even if status looks mutable', async () => {
    const db = new MemoryDB();
    seedCompetition(db, {
      status: 'active',
      winner_ref: db.collection('user').doc('winner'),
    });

    await assert.rejects(
      makeSaveHandler(db)(saveRequest()),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().title, 'Original');
  });

  it('prevents moving a published competition back to draft', async () => {
    const db = new MemoryDB();
    seedCompetition(db);

    await assert.rejects(
      makeSaveHandler(db)(saveRequest({ isDraft: true })),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(db.snapshot('competition', 'c1').data().status, 'active');
  });

  it('computes sold_out from server inventory when capacity is exhausted', async () => {
    const db = new MemoryDB();
    seedCompetition(db, { sold_tickets: 100, stock_quantity: 0 });

    const result = await makeSaveHandler(db)(saveRequest({
      fields: { total_tickets: 100 },
    }));

    assert.equal(result.status, 'sold_out');
    assert.equal(db.snapshot('competition', 'c1').data().status, 'sold_out');
  });
  it('increases available stock by the capacity increase while preserving sold tickets', async () => {
    const db = new MemoryDB();
    seedCompetition(db);

    const result = await makeSaveHandler(db)(saveRequest({
      fields: { total_tickets: 150 },
    }));

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(result.status, 'active');
    assert.equal(competition.total_tickets, 150);
    assert.equal(competition.stock_quantity, 146);
    assert.equal(competition.sold_tickets, 4);
    assert.equal(competition.last_ticket_sequence, 4);
  });

  it('reduces available stock by the capacity reduction without going negative', async () => {
    const db = new MemoryDB();
    seedCompetition(db);

    const result = await makeSaveHandler(db)(saveRequest({
      fields: { total_tickets: 80 },
    }));

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(result.status, 'active');
    assert.equal(competition.total_tickets, 80);
    assert.equal(competition.stock_quantity, 76);
    assert.equal(competition.sold_tickets, 4);
  });

  it('marks a capacity reduction down to the sold count as sold_out with zero stock', async () => {
    const db = new MemoryDB();
    seedCompetition(db);

    const result = await makeSaveHandler(db)(saveRequest({
      fields: { total_tickets: 4 },
    }));

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(result.status, 'sold_out');
    assert.equal(competition.total_tickets, 4);
    assert.equal(competition.stock_quantity, 0);
    assert.equal(competition.sold_tickets, 4);
  });

  it('rejects a capacity reduction below the sold count without writes', async () => {
    const db = new MemoryDB();
    seedCompetition(db);
    const before = { ...db.snapshot('competition', 'c1').data() };

    await assert.rejects(
      makeSaveHandler(db)(saveRequest({
        fields: { total_tickets: 3 },
      })),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(db.snapshot('competition', 'c1').data(), before);
  });

  it('reopens a sold-out competition when capacity is increased above sold tickets', async () => {
    const db = new MemoryDB();
    seedCompetition(db, {
      status: 'sold_out',
      total_tickets: 100,
      stock_quantity: 0,
      sold_tickets: 100,
      last_ticket_sequence: 100,
    });

    const result = await makeSaveHandler(db)(saveRequest({
      fields: { total_tickets: 120 },
    }));

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(result.status, 'active');
    assert.equal(competition.total_tickets, 120);
    assert.equal(competition.stock_quantity, 20);
    assert.equal(competition.sold_tickets, 100);
  });


  it('creates competition questions through the guarded save transaction', async () => {
    const db = new MemoryDB();
    const handler = makeSaveHandler(db);

    const result = await handler(
      saveRequest({
        competitionId: null,
        fields: { title: 'Question Competition', total_tickets: 50, ticket_price: 5 },
        questions: [questionPayload()],
      })
    );

    assert.equal(result.isNew, true);
    assert.equal(result.questionsSaved, 1);
    const competitionId = result.competitionId;
    const competition = db.snapshot('competition', competitionId).data();
    assert.equal(competition.title, 'Question Competition');

    const questions = Array.from(db.collectionStore('questions').entries());
    assert.equal(questions.length, 1);
    const [questionId, question] = questions[0];
    assert.equal(question.competition_id.path, `competition/${competitionId}`);
    assert.equal(question.question_id, questionId);
    assert.equal(question.question, 'What is the correct answer?');
    assert.deepEqual(question.answer, { option_id: 'a', option: 'Option A' });
    assert.equal(question.created_at.__mockServerTimestamp, true);
  });

  it('updates existing questions by id without changing their identifiers', async () => {
    const db = new MemoryDB();
    seedCompetition(db);
    seedQuestion(db, 'q1');
    const originalCreatedAt = db.snapshot('questions', 'q1').data().created_at;

    const result = await makeSaveHandler(db)(
      saveRequest({
        questions: [
          questionPayload({
            id: 'q1',
            question: 'Updated question',
            answer: { option_id: 'b' },
          }),
        ],
      })
    );

    assert.equal(result.questionsSaved, 1);
    const question = db.snapshot('questions', 'q1').data();
    assert.equal(question.question_id, 'q1');
    assert.equal(question.question, 'Updated question');
    assert.deepEqual(question.answer, { option_id: 'b', option: 'Option B' });
    assert.deepEqual(question.created_at, originalCreatedAt);
    assert.equal(db.collectionStore('questions').size, 1);
  });

  it('atomically replaces questions while preserving retained identifiers', async () => {
    const db = new MemoryDB();
    seedCompetition(db);
    seedQuestion(db, 'q1');
    seedQuestion(db, 'q2', { question: 'Removed question' });

    const result = await makeSaveHandler(db)(
      saveRequest({
        replaceQuestions: true,
        questions: [
          questionPayload({ id: 'q1', question: 'Retained question' }),
          questionPayload({ question: 'New question' }),
        ],
      })
    );

    assert.equal(result.questionsSaved, 2);
    assert.equal(result.questionsDeleted, 1);
    assert.equal(db.snapshot('questions', 'q1').data().question, 'Retained question');
    assert.equal(db.snapshot('questions', 'q2').exists, false);
    const questionIds = Array.from(db.collectionStore('questions').keys());
    assert.equal(questionIds.length, 2);
    assert.equal(questionIds.includes('q1'), true);
  });

  it('rejects question mutations during protected draw states without changes', async () => {
    const db = new MemoryDB();
    seedCompetition(db, { status: 'drawing' });
    seedQuestion(db, 'q1');
    const beforeCompetition = { ...db.snapshot('competition', 'c1').data() };
    const beforeQuestion = { ...db.snapshot('questions', 'q1').data() };

    await assert.rejects(
      makeSaveHandler(db)(
        saveRequest({
          questions: [questionPayload({ id: 'q1', question: 'Changed' })],
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(db.snapshot('competition', 'c1').data(), beforeCompetition);
    assert.deepEqual(db.snapshot('questions', 'q1').data(), beforeQuestion);
  });

  it('rejects unauthorized and invalid question mutations without partial writes', async () => {
    const unauthorizedDb = new MemoryDB();
    seedCompetition(unauthorizedDb);
    seedQuestion(unauthorizedDb, 'q1');

    await assert.rejects(
      makeSaveHandler(unauthorizedDb, async () => {
        throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
      })(saveRequest({ questions: [questionPayload({ id: 'q1' })] })),
      (error) => error.code === 'permission-denied'
    );
    assert.equal(unauthorizedDb.snapshot('competition', 'c1').data().title, 'Original');
    assert.equal(unauthorizedDb.snapshot('questions', 'q1').data().question, 'Original question');

    const invalidDb = new MemoryDB();
    seedCompetition(invalidDb);
    seedQuestion(invalidDb, 'q1');
    const beforeCompetition = { ...invalidDb.snapshot('competition', 'c1').data() };
    const beforeQuestion = { ...invalidDb.snapshot('questions', 'q1').data() };

    await assert.rejects(
      makeSaveHandler(invalidDb)(
        saveRequest({
          fields: { title: 'Must not apply' },
          questions: [questionPayload({ id: 'q1', option: [{ option_id: 'a', option: 'A' }] })],
        })
      ),
      (error) => error.code === 'invalid-argument'
    );

    assert.deepEqual(invalidDb.snapshot('competition', 'c1').data(), beforeCompetition);
    assert.deepEqual(invalidDb.snapshot('questions', 'q1').data(), beforeQuestion);
  });

  it('rejects a question that belongs to another competition without applying competition changes', async () => {
    const db = new MemoryDB();
    seedCompetition(db);
    db.setDocument('questions', 'foreign', {
      competition_id: db.collection('competition').doc('other'),
      question_id: 'foreign',
      question: 'Foreign question',
      images: [],
      option: [
        { option_id: 'a', option: 'A' },
        { option_id: 'b', option: 'B' },
      ],
      answer: { option_id: 'a' },
    });
    const beforeCompetition = { ...db.snapshot('competition', 'c1').data() };
    const beforeQuestion = { ...db.snapshot('questions', 'foreign').data() };

    await assert.rejects(
      makeSaveHandler(db)(
        saveRequest({
          questions: [questionPayload({ id: 'foreign', question: 'Changed' })],
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(db.snapshot('competition', 'c1').data(), beforeCompetition);
    assert.deepEqual(db.snapshot('questions', 'foreign').data(), beforeQuestion);
  });

  it('rejects question mutation requests above the atomic limit', async () => {
    const db = new MemoryDB();
    seedCompetition(db);
    const beforeCompetition = { ...db.snapshot('competition', 'c1').data() };
    const oversized = Array.from({ length: 401 }, (_, index) =>
      questionPayload({ question: `Question ${index}` })
    );

    await assert.rejects(
      makeSaveHandler(db)(saveRequest({ questions: oversized })),
      (error) => error.code === 'invalid-argument'
    );

    assert.deepEqual(db.snapshot('competition', 'c1').data(), beforeCompetition);
    assert.equal(db.collectionStore('questions').size, 0);
  });

  it('rejects deletion of a competition with sold tickets without mutating records', async () => {
    const db = new MemoryDB();
    seedCompetition(db, {
      status: 'active',
      sold_tickets: 4,
      stock_quantity: 96,
      last_ticket_sequence: 4,
    });
    const competitionRef = db.collection('competition').doc('c1');
    db.setDocument('ticket', 't1', {
      competition_id: competitionRef,
      status: 'active',
      ticket_number: 1,
      ticket_sequence: 'T001',
    });
    db.setDocument('order', 'o1', {
      competition_id: competitionRef,
      status: 'paid',
      total_amount: 40,
    });
    seedQuestion(db, 'q1');
    const beforeCompetition = { ...db.snapshot('competition', 'c1').data() };
    const beforeTicket = { ...db.snapshot('ticket', 't1').data() };
    const beforeOrder = { ...db.snapshot('order', 'o1').data() };
    const beforeQuestion = { ...db.snapshot('questions', 'q1').data() };

    await assert.rejects(
      makeDeleteHandler(db)({
        auth: { uid: 'admin1' },
        data: { competitionId: 'c1', deleteQuestions: true },
      }),
      (error) => error.code === 'failed-precondition' && /sold tickets/.test(error.message)
    );

    assert.deepEqual(db.snapshot('competition', 'c1').data(), beforeCompetition);
    assert.deepEqual(db.snapshot('ticket', 't1').data(), beforeTicket);
    assert.deepEqual(db.snapshot('order', 'o1').data(), beforeOrder);
    assert.deepEqual(db.snapshot('questions', 'q1').data(), beforeQuestion);
  });

  it('deletes only mutable competitions and treats repeated deletion safely', async () => {
    const db = new MemoryDB();
    seedCompetition(db, {
      status: 'draft',
      sold_tickets: 0,
      stock_quantity: 100,
      last_ticket_sequence: 0,
    });
    const handler = makeDeleteHandler(db);

    const first = await handler({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } });
    const second = await handler({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.idempotentReplay, true);
    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.status, 'deleted');
    assert.equal(competition.total_tickets, 100);
    assert.equal(competition.stock_quantity, 100);
    assert.equal(competition.sold_tickets, 0);
    assert.equal(competition.last_ticket_sequence, 0);
  });

  it('rejects deletion during draw finality and for unauthorized callers', async () => {
    const drawingDb = new MemoryDB();
    seedCompetition(drawingDb, { status: 'drawing' });
    await assert.rejects(
      makeDeleteHandler(drawingDb)({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(drawingDb.snapshot('competition', 'c1').data().status, 'drawing');

    const winningDb = new MemoryDB();
    seedCompetition(winningDb, {
      status: 'active',
      winner_ticket_ref: winningDb.collection('ticket').doc('t1'),
    });
    await assert.rejects(
      makeDeleteHandler(winningDb)({ auth: { uid: 'admin1' }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'failed-precondition'
    );

    const unauthorizedDb = new MemoryDB();
    seedCompetition(unauthorizedDb, { status: 'draft' });
    await assert.rejects(
      makeDeleteHandler(unauthorizedDb, async () => {
        throw new MockHttpsError('permission-denied', 'Only admins can perform this action.');
      })({ auth: { uid: 'user1' }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'permission-denied'
    );
    assert.equal(unauthorizedDb.snapshot('competition', 'c1').data().status, 'draft');
  });

  it('retains questions on standard soft deletion and removes them only on explicit cleanup', async () => {
    const db = new MemoryDB();
    seedCompetition(db, {
      status: 'draft',
      sold_tickets: 0,
      stock_quantity: 100,
      last_ticket_sequence: 0,
    });
    db.setDocument('questions', 'q1', {
      competition_id: db.collection('competition').doc('c1'),
      question: 'Question 1',
    });
    db.setDocument('questions', 'q2', {
      competition_id: db.collection('competition').doc('c1'),
      question: 'Question 2',
    });
    const handler = makeDeleteHandler(db);

    const first = await handler({
      auth: { uid: 'admin1' },
      data: { competitionId: 'c1' },
    });

    assert.equal(first.questionsDeleted, 0);
    assert.equal(db.collectionStore('questions').size, 2);
    assert.equal(db.snapshot('competition', 'c1').data().status, 'deleted');

    const cleanup = await handler({
      auth: { uid: 'admin1' },
      data: { competitionId: 'c1', deleteQuestions: true },
    });

    assert.equal(cleanup.idempotentReplay, true);
    assert.equal(cleanup.questionsDeleted, 2);
    assert.equal(db.collectionStore('questions').size, 0);
  });

  it('does not delete questions when draw-finality deletion is rejected', async () => {
    const db = new MemoryDB();
    seedCompetition(db, { status: 'drawing' });
    db.setDocument('questions', 'q1', {
      competition_id: db.collection('competition').doc('c1'),
      question: 'Question 1',
    });

    await assert.rejects(
      makeDeleteHandler(db)({
        auth: { uid: 'admin1' },
        data: { competitionId: 'c1', deleteQuestions: true },
      }),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.snapshot('competition', 'c1').data().status, 'drawing');
    assert.equal(db.collectionStore('questions').size, 1);
  });

  it('frontend competition services route competition and question mutations through the backend', () => {
    const adminService = fs.readFileSync(
      fileURLToPath(
        new URL('../../src/modules/admin/competitions/services/adminCompetitionService.js', import.meta.url)
      ),
      'utf8'
    );
    const createService = fs.readFileSync(
      fileURLToPath(
        new URL('../../src/modules/admin/competitions/services/competitionService.js', import.meta.url)
      ),
      'utf8'
    );

    assert.equal(adminService.includes('saveAdminCompetition'), true);
    assert.equal(adminService.includes('deleteAdminCompetition'), true);
    assert.equal(adminService.includes('updateDoc(compRef'), false);
    assert.equal(adminService.includes('syncCompetitionQuestions'), false);
    assert.equal(adminService.includes('addDoc(collection(db'), false);
    assert.equal(createService.includes('batch.set(competitionRef'), false);
    assert.equal(createService.includes('saveAdminCompetition'), true);
    assert.equal(createService.includes('writeBatch'), false);
    assert.equal(createService.includes('collection(db, "questions")'), false);
  });
});
