import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  ADDITIONAL_PAYMENT_FULFILLMENT,
  ADDITIONAL_PAYMENT_LOCKS_COLLECTION,
  ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
  ADDITIONAL_PAYMENT_STATUS,
  createAdditionalPaymentRequestHandler,
  createGetAdditionalPaymentCheckoutUrlHandler,
  createGetMyAdditionalPaymentRequestsHandler,
  createListAdditionalPaymentRequestsHandler,
  processAdditionalPaymentWebhookEvent,
} from '../services/additionalPaymentService.js';
import { ADMIN_AUDIT_COLLECTION, AUDIT_ACTIONS } from '../services/adminAuditService.js';
import { createStripeWebhookHandler } from '../controllers/paymentWebhookController.js';
import { runOrderTransaction } from '../services/orderTransactionService.js';
import { evaluateCheckoutSettlement, SettlementValidationError } from '../services/stripeSettlementService.js';
import { buildNotificationPayload } from '../services/orderNotificationService.js';
import { PAYMENT_SETTLEMENT } from '../services/ticketOrigin.js';

const NOW = 1_800_000_000_000;
const FUTURE_DRAW = new Date(NOW + (2 * 60 * 60 * 1000));
const LONG_DRAW = new Date(NOW + (48 * 60 * 60 * 1000));
const ADVANCED_NOW = NOW + (25 * 60 * 60 * 1000);
const PAST_DRAW = new Date(NOW - 60_000);
const ADMIN_UID = 'admin1';
const USER_UID = 'u1';
const PARTICIPANT_PAYMENT_REQUEST_KEYS = [
  'can_pay',
  'competition_title',
  'currency',
  'expires_at_millis',
  'fulfillment_status',
  'payment_status',
  'request_id',
  'requested_ticket_quantity',
  'total_amount',
].sort();

function seed(db, overrides = {}) {
  const userRef = db.collection('user').doc(USER_UID);
  const adminRef = db.collection('user').doc(ADMIN_UID);
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', USER_UID, {
    display_name: 'Participant',
    is_active: true,
    free_tickets: 0,
    total_tickets_bought: 0,
    total_spent: 0,
    ...(overrides.user || {}),
  });
  db.setDocument('user', ADMIN_UID, { role: 'admin' });
  db.setDocument('user', 'u2', { display_name: 'Other User', is_active: true });
  db.setDocument('competition', 'c1', {
    title: 'Additional Payment Competition',
    status: 'active',
    draw_date: FUTURE_DRAW,
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: 50,
    sold_tickets: 0,
    last_ticket_sequence: 0,
    participants: [userRef],
    ...(overrides.competition || {}),
  });
  db.setDocument('skill_attempts', `${USER_UID}_c1`, {
    passed: true,
    ...(overrides.skillAttempt || {}),
  });

  return { userRef, adminRef, competitionRef };
}

function makeStripe({ createError = null, retrieve = null } = {}) {
  const calls = { create: [], retrieve: [] };
  const factory = () => ({
    checkout: {
      sessions: {
        create: async (params, options) => {
          calls.create.push({ params, options });
          if (createError) throw createError;
          const id = `cs_test_${calls.create.length}`;
          return {
            id,
            url: `https://stripe.test/${id}`,
            status: 'open',
            payment_status: 'unpaid',
          };
        },
        retrieve: async (id) => {
          calls.retrieve.push(id);
          if (retrieve) return retrieve(id);
          return {
            id,
            url: `https://stripe.test/${id}`,
            status: 'open',
            payment_status: 'unpaid',
          };
        },
      },
    },
  });
  return { factory, calls };
}

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

function makeCreateHandler(
  db,
  stripe = makeStripe(),
  now = () => NOW,
  { getAppOrigins = () => 'https://app.test' } = {}
) {
  return createAdditionalPaymentRequestHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
    stripeFactory: stripe.factory,
    getStripeSecretKey: () => 'sk_test',
    getAppOrigins,
    now,
  });
}

function createRequest(overrides = {}) {
  return {
    auth: { uid: ADMIN_UID },
    data: {
      userId: USER_UID,
      competitionId: 'c1',
      ticketQuantity: 2,
      reason: 'Extra allocation requested by support',
      requestId: 'req-additional-001',
      origin: 'https://app.test',
      ...overrides,
    },
  };
}

function makeWebhookEvent({ requestId = 'req-additional-001', sessionOverrides = {} } = {}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        metadata: { additionalPaymentRequestId: requestId },
        amount_total: 2000,
        currency: 'gbp',
        payment_status: 'paid',
        payment_intent: 'pi_additional_1',
        mode: 'payment',
        status: 'complete',
        ...sessionOverrides,
      },
    },
  };
}

function seedRequest(db, refs, overrides = {}) {
  db.setDocument(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-additional-001', {
    request_id: 'req-additional-001',
    user_ref: refs.userRef,
    competition_id: refs.competitionRef,
    competition_title: 'Additional Payment Competition',
    initiated_by: refs.adminRef,
    requested_ticket_quantity: 2,
    unit_price: 10,
    unit_amount_minor: 1000,
    total_amount: 20,
    total_amount_minor: 2000,
    currency: 'GBP',
    payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
    fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    stripe_checkout_session_id: 'cs_test_1',
    stripe_payment_intent_id: '',
    order_id: null,
    issued_ticket_count: 0,
    reason: 'Extra allocation requested by support',
    success_url: 'https://app.test/profile/orders?additional_payment=success',
    cancel_url: 'https://app.test/profile/orders?additional_payment=cancelled',
    expires_at_millis: NOW + (60 * 60 * 1000),
    stripe_expires_at: Math.floor(NOW / 1000) + (60 * 60),
    fulfillment_attempts: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });
}

async function runWebhook(db, event) {
  return processAdditionalPaymentWebhookEvent({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    event,
    HttpsError: MockHttpsError,
  });
}

function auditEvents(db) {
  return Array.from(db.collectionStore(ADMIN_AUDIT_COLLECTION).values());
}

describe('create additional payment request', () => {
  it('creates a pending request using server pricing and a bounded Stripe session', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    const stripe = makeStripe();
    const handler = makeCreateHandler(db, stripe);

    const result = await handler(createRequest({
      total_amount: 0.01,
      unit_price: 0.01,
      amount: 0.01,
    }));

    assert.equal(result.sessionUrl, 'https://stripe.test/cs_test_1');
    assert.equal(result.request.payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(result.request.total_amount, 20);
    assert.equal(result.request.unit_price, 10);
    assert.equal(result.request.requested_ticket_quantity, 2);
    assert.equal(result.request.initiated_by, ADMIN_UID);
    assert.equal(result.request.reason, 'Extra allocation requested by support');

    assert.equal(stripe.calls.create.length, 1);
    const { params, options } = stripe.calls.create[0];
    assert.equal(params.line_items[0].price_data.unit_amount, 1000);
    assert.equal(params.line_items[0].quantity, 2);
    assert.equal(params.currency, undefined);
    assert.equal(params.mode, 'payment');
    assert.equal(params.expires_at, Math.floor(FUTURE_DRAW.getTime() / 1000) - 1);
    assert.equal(params.metadata.additionalPaymentRequestId, 'req-additional-001');
    assert.equal(params.metadata.requestType, 'additional_payment');
    assert.equal(options.idempotencyKey, 'additional_payment_session_req-additional-001');
    assert.equal(params.success_url.startsWith('https://app.test/profile/orders'), true);

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.PENDING);
    assert.equal(request.unit_amount_minor, 1000);
    assert.equal(request.total_amount, 20);
    assert.equal(request.total_amount_minor, 2000);
    assert.equal(request.stripe_checkout_session_id, 'cs_test_1');
    assert.equal(request.user_ref.path, refs.userRef.path);
    assert.equal(request.competition_id.path, refs.competitionRef.path);
    assert.equal(request.initiated_by.path, `user/${ADMIN_UID}`);
    assert.equal(request.expires_at_millis, (Math.floor(FUTURE_DRAW.getTime() / 1000) - 1) * 1000);

    const lock = db.snapshot(
      ADDITIONAL_PAYMENT_LOCKS_COLLECTION,
      `${USER_UID}_c1`
    );
    assert.equal(lock.exists, true);
    assert.equal(lock.data().request_id, 'req-additional-001');

    const events = auditEvents(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, AUDIT_ACTIONS.PAYMENT_REQUEST_CREATED);
    assert.equal(events[0].actor_type, 'admin');
    assert.equal(events[0].actor_uid, ADMIN_UID);
    assert.equal(events[0].related.payment_request_id, 'req-additional-001');
    assert.equal(events[0].related.user_id, USER_UID);
    assert.equal(events[0].related.competition_id, 'c1');
    assert.equal(events[0].after.total_amount, 20);
    assert.equal(JSON.stringify(events[0]).includes('pi_additional'), false);
  });

  it('caps Stripe expiry at 24 hours', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: new Date(NOW + (48 * 60 * 60 * 1000)) } });
    const stripe = makeStripe();

    await makeCreateHandler(db, stripe)(createRequest({ requestId: 'req-additional-long' }));

    assert.equal(
      stripe.calls.create[0].params.expires_at,
      Math.floor(NOW / 1000) + (24 * 60 * 60)
    );
  });

  it('rejects unauthenticated and non-admin callers', async () => {
    for (const request of [
      { auth: null, data: createRequest().data },
      { auth: { uid: USER_UID }, data: createRequest().data },
    ]) {
      const db = new MemoryDB();
      seed(db);
      const stripe = makeStripe();
      await assert.rejects(
        makeCreateHandler(db, stripe)(request),
        (error) =>
          error.code === 'unauthenticated' || error.code === 'permission-denied'
      );
      assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 0);
      assert.equal(stripe.calls.create.length, 0);
    }
  });

  it('rejects invalid identifiers and quantities', async () => {
    const cases = [
      [{ userId: '' }, 'invalid-argument'],
      [{ competitionId: '' }, 'invalid-argument'],
      [{ requestId: 'short' }, 'invalid-argument'],
      [{ reason: '   ' }, 'invalid-argument'],
      [{ ticketQuantity: 0 }, 'invalid-argument'],
      [{ ticketQuantity: -1 }, 'invalid-argument'],
      [{ ticketQuantity: 1.5 }, 'invalid-argument'],
      [{ ticketQuantity: 101 }, 'invalid-argument'],
      [{ userId: 'missing-user' }, 'not-found'],
      [{ competitionId: 'missing-competition' }, 'not-found'],
    ];

    for (const [overrides, code] of cases) {
      const db = new MemoryDB();
      seed(db);
      await assert.rejects(
        makeCreateHandler(db)(createRequest(overrides)),
        (error) => error.code === code,
        JSON.stringify(overrides)
      );
      assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 0);
    }
  });

  it('rejects ineligible participants, skill gaps, pricing, stock, and draw states', async () => {
    const cases = [
      ['not a participant', { competition: { participants: [] } }, {}],
      ['missing skill', {}, { skillAttempt: { passed: false } }],
      ['invalid price', { competition: { ticket_price: 0 } }, {}],
      ['past draw', { competition: { draw_date: PAST_DRAW } }, {}],
      ['drawing', { competition: { status: 'drawing' } }, {}],
      ['winner', { competition: { winner_ref: 'user/u2' } }, {}],
      ['insufficient stock', { competition: { stock_quantity: 1 } }, {}],
      ['deleting user', { user: { status: 'deleting' } }, {}],
    ];

    for (const [label, overrides, extra] of cases) {
      const db = new MemoryDB();
      seed(db, { ...overrides, ...extra });
      await assert.rejects(
        makeCreateHandler(db)(createRequest({ requestId: `req-${label.replace(/[^a-z0-9]/gi, '')}` })),
        (error) => error.code === 'failed-precondition',
        label
      );
      assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 0);
    }
  });

  it('prevent duplicate active requests for the same participant and competition', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    const handler = makeCreateHandler(db, stripe);

    await handler(createRequest());
    await assert.rejects(
      handler(createRequest({ requestId: 'req-additional-002' })),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 1);
    assert.equal(stripe.calls.create.length, 1);
  });

  it('replays the same request ID without creating a duplicate Stripe session', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    const handler = makeCreateHandler(db, stripe);

    await handler(createRequest());
    const replay = await handler(createRequest());

    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.sessionUrl, 'https://stripe.test/cs_test_1');
    assert.equal(stripe.calls.create.length, 1);
    assert.equal(stripe.calls.retrieve.length, 1);
    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 1);
  });

  it('does not return an existing checkout URL after the competition leaves active state', async () => {
    const db = new MemoryDB();
    const refs = seed(db, { competition: { status: 'drawing' } });
    seedRequest(db, refs);
    const stripe = makeStripe({
      retrieve: (id) => ({
        id,
        url: `https://stripe.test/${id}`,
        status: 'open',
        payment_status: 'unpaid',
        amount_total: 2000,
        currency: 'gbp',
        mode: 'payment',
        metadata: { additionalPaymentRequestId: 'req-additional-001' },
      }),
    });
    const handler = makeCreateHandler(db, stripe);

    await assert.rejects(
      handler(createRequest()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(stripe.calls.create.length, 0);
    assert.equal(db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-additional-001').data().payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
  });

  it('reconciles a same-request paid Stripe session instead of creating another session', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);
    const paidObject = makeWebhookEvent().data.object;
    const stripe = makeStripe({
      retrieve: (id) => ({ ...paidObject, id }),
    });
    const handler = makeCreateHandler(db, stripe);

    const result = await handler(createRequest());

    assert.equal(result.sessionUrl, null);
    assert.equal(result.reconciledPaidSession, true);
    assert.equal(stripe.calls.create.length, 0);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(db.collectionStore('ticket').size, 2);
  });

  it('reconciles a same-request paid + pending request after a crash between settlement and fulfillment', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    });
    const paidObject = makeWebhookEvent().data.object;
    const stripe = makeStripe({
      retrieve: (id) => ({ ...paidObject, id }),
    });
    const handler = makeCreateHandler(db, stripe);

    const result = await handler(createRequest());

    assert.equal(result.sessionUrl, null);
    assert.equal(result.reconciledPaidSession, true);
    assert.equal(stripe.calls.create.length, 0);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(db.collectionStore('ticket').size, 2);
  });

  it('preserves a same-request paid request when Stripe retrieval fails', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    });
    const stripe = makeStripe({
      retrieve: () => {
        throw new Error('stripe unavailable');
      },
    });
    const handler = makeCreateHandler(db, stripe);

    await assert.rejects(
      handler(createRequest()),
      (error) => error.code === 'internal' || error.code === 'failed-precondition'
    );

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.PENDING);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(stripe.calls.create.length, 0);
  });

  it('rejects a same-request paid session with mismatched metadata without issuing tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    });
    const paidObject = makeWebhookEvent({
      requestId: 'req-other-001',
    }).data.object;
    const stripe = makeStripe({
      retrieve: (id) => ({ ...paidObject, id }),
    });
    const handler = makeCreateHandler(db, stripe);

    await assert.rejects(
      handler(createRequest()),
      (error) => error.code === 'failed-precondition'
    );

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('keeps the request pending and retryable when Stripe session creation fails', async () => {
    const db = new MemoryDB();
    seed(db);
    const failingStripe = makeStripe({ createError: new Error('stripe unavailable') });

    await assert.rejects(
      makeCreateHandler(db, failingStripe)(createRequest()),
      (error) => error.code === 'internal'
    );

    let request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.PENDING);
    assert.equal(request.failure_reason, undefined);
    assert.equal(request.stripe_checkout_session_id, '');

    const retryStripe = makeStripe();
    const retry = await makeCreateHandler(db, retryStripe)(createRequest());

    assert.equal(retry.sessionUrl, 'https://stripe.test/cs_test_1');
    assert.equal(retryStripe.calls.create.length, 1);
    assert.equal(
      retryStripe.calls.create[0].options.idempotencyKey,
      'additional_payment_session_req-additional-001'
    );
    request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.stripe_checkout_session_id, 'cs_test_1');
    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 1);
  });
});

describe('additional payment minor-unit pricing', () => {
  it('accepts a normal two-decimal ticket price using integer minor units', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { ticket_price: 10.25 } });
    const stripe = makeStripe();

    const result = await makeCreateHandler(db, stripe)(
      createRequest({ requestId: 'req-minor-normal', ticketQuantity: 3 })
    );

    assert.equal(stripe.calls.create[0].params.line_items[0].price_data.unit_amount, 1025);
    assert.equal(stripe.calls.create[0].params.line_items[0].quantity, 3);
    assert.equal(result.request.unit_price, 10.25);
    assert.equal(result.request.unit_amount_minor, 1025);
    assert.equal(result.request.total_amount, 30.75);
    assert.equal(result.request.total_amount_minor, 3075);
  });

  it('rejects a fractional-penny ticket price without creating a request or Stripe session', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { ticket_price: 10.001 } });
    const stripe = makeStripe();

    await assert.rejects(
      makeCreateHandler(db, stripe)(
        createRequest({ requestId: 'req-minor-fractional-one', ticketQuantity: 1 })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 0);
    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_LOCKS_COLLECTION).size, 0);
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 0);
    assert.equal(stripe.calls.create.length, 0);
  });

  it('rejects a fractional-penny price with quantity greater than one without side effects', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { ticket_price: 10.005 } });
    const stripe = makeStripe();

    await assert.rejects(
      makeCreateHandler(db, stripe)(
        createRequest({ requestId: 'req-minor-fractional-multi', ticketQuantity: 2 })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 0);
    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_LOCKS_COLLECTION).size, 0);
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 0);
    assert.equal(stripe.calls.create.length, 0);
  });

  it('rejects a total that previously passed total rounding but produced a different Stripe line amount', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { ticket_price: 10.005 } });
    const stripe = makeStripe();

    // Old logic accepted 20.01 as the total but sent Stripe unit_amount=1001 × 2 = 2002.
    await assert.rejects(
      makeCreateHandler(db, stripe)(
        createRequest({ requestId: 'req-minor-line-mismatch', ticketQuantity: 2 })
      ),
      (error) =>
        error.code === 'failed-precondition' &&
        /minor units/.test(error.message)
    );

    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 0);
    assert.equal(stripe.calls.create.length, 0);
  });
});

describe('additional payment origin allowlist', () => {
  const attemptCreate = async (
    db,
    { origin = 'https://app.test', getAppOrigins },
    stripe = makeStripe()
  ) => {
    const handler = makeCreateHandler(db, stripe, () => NOW, {
      getAppOrigins,
    });
    await handler(
      createRequest({
        requestId: 'req-origin-test',
        origin,
      })
    );
    return stripe;
  };

  const assertNoSideEffects = (db, stripe) => {
    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size, 0);
    assert.equal(db.collectionStore(ADDITIONAL_PAYMENT_LOCKS_COLLECTION).size, 0);
    assert.equal(db.collectionStore(ADMIN_AUDIT_COLLECTION).size, 0);
    assert.equal(stripe.calls.create.length, 0);
  };

  it('rejects a missing APP_ORIGIN', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    await assert.rejects(
      attemptCreate(db, { getAppOrigins: () => undefined }, stripe),
      (error) => error.code === 'failed-precondition'
    );
    assertNoSideEffects(db, stripe);
  });

  it('rejects an empty APP_ORIGIN', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    await assert.rejects(
      attemptCreate(db, { getAppOrigins: () => '' }, stripe),
      (error) => error.code === 'failed-precondition'
    );
    assertNoSideEffects(db, stripe);
  });

  it('rejects an unapproved origin', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    await assert.rejects(
      attemptCreate(
        db,
        {
          origin: 'https://attacker.test',
          getAppOrigins: () => 'https://app.test',
        },
        stripe
      ),
      (error) => error.code === 'invalid-argument'
    );
    assertNoSideEffects(db, stripe);
  });

  it('rejects a malformed client origin', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    await assert.rejects(
      attemptCreate(
        db,
        {
          origin: 'not-a-url',
          getAppOrigins: () => 'https://app.test',
        },
        stripe
      ),
      (error) => error.code === 'invalid-argument'
    );
    assertNoSideEffects(db, stripe);
  });

  it('rejects a client origin containing credentials', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    await assert.rejects(
      attemptCreate(
        db,
        {
          origin: 'https://user:pass@app.test',
          getAppOrigins: () => 'https://app.test',
        },
        stripe
      ),
      (error) => error.code === 'invalid-argument'
    );
    assertNoSideEffects(db, stripe);
  });

  it('rejects an invalid allowlist entry', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripe();
    await assert.rejects(
      attemptCreate(
        db,
        {
          getAppOrigins: () => 'https://app.test,not-a-url',
        },
        stripe
      ),
      (error) => error.code === 'failed-precondition'
    );
    assertNoSideEffects(db, stripe);
  });

  it('accepts an approved origin and constructs fixed internal return paths', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = await attemptCreate(db, {
      getAppOrigins: () => 'https://app.test',
    });

    assert.equal(stripe.calls.create.length, 1);
    assert.equal(
      stripe.calls.create[0].params.success_url,
      'https://app.test/profile/orders?additional_payment=success&request_id=req-origin-test'
    );
    assert.equal(
      stripe.calls.create[0].params.cancel_url,
      'https://app.test/profile/orders?additional_payment=cancelled&request_id=req-origin-test'
    );
  });

  it('accepts one of multiple configured approved origins', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = await attemptCreate(db, {
      origin: 'https://second.test',
      getAppOrigins: () => 'https://first.test, https://second.test',
    });

    assert.equal(stripe.calls.create.length, 1);
    assert.equal(
      stripe.calls.create[0].params.success_url.startsWith('https://second.test/'),
      true
    );
  });
});

describe('additional payment expiry requires verified Stripe state', () => {
  const expiredSession = (requestId, sessionId, overrides = {}) => ({
    id: sessionId,
    metadata: { additionalPaymentRequestId: requestId },
    amount_total: 2000,
    currency: 'gbp',
    payment_status: 'unpaid',
    payment_intent: null,
    mode: 'payment',
    status: 'expired',
    ...overrides,
  });

  const paidSession = (requestId, sessionId, overrides = {}) => ({
    id: sessionId,
    metadata: { additionalPaymentRequestId: requestId },
    amount_total: 2000,
    currency: 'gbp',
    payment_status: 'paid',
    payment_intent: 'pi_paid_existing',
    mode: 'payment',
    status: 'complete',
    ...overrides,
  });

  const createRequestA = async (db, stripe) => {
    await makeCreateHandler(db, stripe, () => NOW)(
      createRequest({ requestId: 'req-expiry-a-001' })
    );
    return db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-expiry-a-001'
    ).data();
  };

  it('A: keeps an open Stripe session locked after local expiry and fulfills only once later', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: LONG_DRAW } });
    const stripe = makeStripe();
    const requestA = await createRequestA(db, stripe);

    const advancedHandler = makeCreateHandler(db, stripe, () => ADVANCED_NOW);
    await assert.rejects(
      advancedHandler(
        createRequest({
          requestId: 'req-expiry-b-001',
          reason: 'replacement after local expiry',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-b-001').exists,
      false
    );
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_LOCKS_COLLECTION, `${USER_UID}_c1`).data()
        .request_id,
      'req-expiry-a-001'
    );

    const result = await runWebhook(
      db,
      makeWebhookEvent({
        requestId: 'req-expiry-a-001',
        sessionOverrides: { id: requestA.stripe_checkout_session_id },
      })
    );

    assert.equal(result.statusCode, 200);
    const fulfilled = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-expiry-a-001'
    ).data();
    assert.equal(fulfilled.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-b-001').exists,
      false
    );
  });

  it('B: resolves a delayed paid session and blocks replacement', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: LONG_DRAW } });
    const stripe = makeStripe();
    const requestA = await createRequestA(db, stripe);
    const session = paidSession(
      'req-expiry-a-001',
      requestA.stripe_checkout_session_id
    );
    const paidStripe = makeStripe({ retrieve: () => session });

    const advancedHandler = makeCreateHandler(db, paidStripe, () => ADVANCED_NOW);
    await assert.rejects(
      advancedHandler(
        createRequest({
          requestId: 'req-expiry-b-002',
          reason: 'replacement after paid session',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    const resolved = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-expiry-a-001'
    ).data();
    assert.equal(resolved.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(resolved.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-b-002').exists,
      false
    );
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_LOCKS_COLLECTION, `${USER_UID}_c1`).data()
        .request_id,
      'req-expiry-a-001'
    );
  });

  it('C: replaces only after Stripe confirms expiration and never fulfills the expired request', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: LONG_DRAW } });
    const stripe = makeStripe();
    const requestA = await createRequestA(db, stripe);
    const session = expiredSession(
      'req-expiry-a-001',
      requestA.stripe_checkout_session_id
    );
    const expiredStripe = makeStripe({ retrieve: () => session });

    const advancedHandler = makeCreateHandler(db, expiredStripe, () => ADVANCED_NOW);
    const result = await advancedHandler(
      createRequest({
        requestId: 'req-expiry-b-003',
        reason: 'verified expired replacement',
      })
    );

    assert.equal(result.request.request_id, 'req-expiry-b-003');
    const oldRequest = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-expiry-a-001'
    ).data();
    assert.equal(oldRequest.payment_status, ADDITIONAL_PAYMENT_STATUS.EXPIRED);
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_LOCKS_COLLECTION, `${USER_UID}_c1`).data()
        .request_id,
      'req-expiry-b-003'
    );
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-b-003').data()
        .payment_status,
      ADDITIONAL_PAYMENT_STATUS.PENDING
    );

    const late = await runWebhook(
      db,
      makeWebhookEvent({
        requestId: 'req-expiry-a-001',
        sessionOverrides: {
          id: requestA.stripe_checkout_session_id,
          payment_status: 'paid',
          payment_intent: 'pi_late_expired',
        },
      })
    );

    assert.notEqual(late.statusCode, 200);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('order').size, 0);
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-a-001').data()
        .fulfillment_status,
      ADDITIONAL_PAYMENT_FULFILLMENT.PENDING
    );
  });

  it('D: fails closed when Stripe retrieval fails and preserves the lock', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: LONG_DRAW } });
    const stripe = makeStripe();
    const requestA = await createRequestA(db, stripe);
    const before = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-expiry-a-001'
    ).data();
    const failingStripe = makeStripe({
      retrieve: () => {
        throw new Error('stripe unavailable');
      },
    });

    const advancedHandler = makeCreateHandler(db, failingStripe, () => ADVANCED_NOW);
    await assert.rejects(
      advancedHandler(
        createRequest({
          requestId: 'req-expiry-b-004',
          reason: 'retrieval failure replacement',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-a-001').data(),
      before
    );
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_LOCKS_COLLECTION, `${USER_UID}_c1`).data()
        .request_id,
      'req-expiry-a-001'
    );
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-b-004').exists,
      false
    );
    assert.equal(failingStripe.calls.create.length, 0);
    assert.equal(requestA.stripe_checkout_session_id, 'cs_test_1');
  });

  it('E: keeps a complete-but-unpaid session locked', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: LONG_DRAW } });
    const stripe = makeStripe();
    const requestA = await createRequestA(db, stripe);
    const session = expiredSession(
      'req-expiry-a-001',
      requestA.stripe_checkout_session_id,
      { status: 'complete', payment_status: 'unpaid', payment_intent: null }
    );
    const completeUnpaidStripe = makeStripe({ retrieve: () => session });

    const advancedHandler = makeCreateHandler(
      db,
      completeUnpaidStripe,
      () => ADVANCED_NOW
    );
    await assert.rejects(
      advancedHandler(
        createRequest({
          requestId: 'req-expiry-b-005',
          reason: 'complete unpaid replacement',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    const oldRequest = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-expiry-a-001'
    ).data();
    assert.equal(oldRequest.payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_LOCKS_COLLECTION, `${USER_UID}_c1`).data()
        .request_id,
      'req-expiry-a-001'
    );
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-expiry-b-005').exists,
      false
    );
  });

  it('F: allows only one concurrent replacement and never fulfills the expired request', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { draw_date: LONG_DRAW } });
    const stripe = makeStripe();
    const requestA = await createRequestA(db, stripe);
    const session = expiredSession(
      'req-expiry-a-001',
      requestA.stripe_checkout_session_id
    );
    const expiredStripe = makeStripe({ retrieve: () => session });
    const handlerOne = makeCreateHandler(db, expiredStripe, () => ADVANCED_NOW);
    const handlerTwo = makeCreateHandler(db, expiredStripe, () => ADVANCED_NOW);

    const results = await Promise.allSettled([
      handlerOne(
        createRequest({
          requestId: 'req-expiry-b-006',
          reason: 'concurrent replacement one',
        })
      ),
      handlerTwo(
        createRequest({
          requestId: 'req-expiry-c-006',
          reason: 'concurrent replacement two',
        })
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const winnerId = fulfilled[0].value.request.request_id;
    const requestIds = Array.from(
      db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).keys()
    ).sort();
    assert.deepEqual(requestIds, ['req-expiry-a-001', winnerId].sort());
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_LOCKS_COLLECTION, `${USER_UID}_c1`).data()
        .request_id,
      winnerId
    );

    const late = await runWebhook(
      db,
      makeWebhookEvent({
        requestId: 'req-expiry-a-001',
        sessionOverrides: {
          id: requestA.stripe_checkout_session_id,
          payment_status: 'paid',
          payment_intent: 'pi_late_after_expiry',
        },
      })
    );
    assert.notEqual(late.statusCode, 200);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('order').size, 0);
  });

  it('G: URL retrieval never expires from local time alone', async () => {
    const makeUrlHandler = (db, session, { throws = false } = {}) =>
      createGetAdditionalPaymentCheckoutUrlHandler({
        db,
        admin: createMockAdmin(),
        logger: createMockLogger(),
        assertAuthenticated: () => USER_UID,
        HttpsError: MockHttpsError,
        stripeFactory: () => ({
          checkout: {
            sessions: {
              retrieve: async () => {
                if (throws) throw new Error('stripe unavailable');
                return session;
              },
            },
          },
        }),
        getStripeSecretKey: () => 'sk_test',
        now: () => NOW,
      });

    const cases = [
      {
        label: 'open',
        session: { id: 'cs_test_1', url: 'https://stripe.test/open', status: 'open', payment_status: 'unpaid' },
        expectedReason: null,
        expectedCanPay: true,
        expectedStatus: ADDITIONAL_PAYMENT_STATUS.PENDING,
      },
      {
        label: 'paid',
        session: {
          id: 'cs_test_1',
          url: 'https://stripe.test/paid',
          status: 'complete',
          payment_status: 'paid',
          payment_intent: 'pi_url_paid',
          amount_total: 2000,
          currency: 'gbp',
          mode: 'payment',
        },
        expectedReason: 'already_paid',
        expectedCanPay: false,
        expectedStatus: ADDITIONAL_PAYMENT_STATUS.PENDING,
      },
      {
        label: 'complete unpaid',
        session: {
          id: 'cs_test_1',
          status: 'complete',
          payment_status: 'unpaid',
          amount_total: 2000,
          currency: 'gbp',
          mode: 'payment',
        },
        expectedReason: 'processing',
        expectedCanPay: false,
        expectedStatus: ADDITIONAL_PAYMENT_STATUS.PENDING,
      },
      {
        label: 'expired',
        session: {
          id: 'cs_test_1',
          status: 'expired',
          payment_status: 'unpaid',
          amount_total: 2000,
          currency: 'gbp',
          mode: 'payment',
        },
        expectedReason: 'expired',
        expectedCanPay: false,
        expectedStatus: ADDITIONAL_PAYMENT_STATUS.EXPIRED,
      },
    ];

    for (const testCase of cases) {
      const db = new MemoryDB();
      const refs = seed(db);
      seedRequest(db, refs, { expires_at_millis: NOW - 1000 });
      const handler = makeUrlHandler(db, testCase.session);
      const result = await handler({
        auth: { uid: USER_UID },
        data: { requestId: 'req-additional-001' },
      });

      assert.equal(result.can_pay, testCase.expectedCanPay, testCase.label);
      if (testCase.expectedReason) {
        assert.equal(result.reason, testCase.expectedReason, testCase.label);
      }
      assert.equal(
        db.snapshot(
          ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
          'req-additional-001'
        ).data().payment_status,
        testCase.expectedStatus,
        testCase.label
      );
    }

    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs, { expires_at_millis: NOW - 1000 });
    const failingHandler = makeUrlHandler(db, null, { throws: true });
    await assert.rejects(
      failingHandler({
        auth: { uid: USER_UID },
        data: { requestId: 'req-additional-001' },
      }),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-additional-001').data()
        .payment_status,
      ADDITIONAL_PAYMENT_STATUS.PENDING
    );
  });
});

describe('participant and admin payment request access', () => {
  const seedInternalRequest = (db, refs, overrides = {}) =>
    seedRequest(db, refs, {
      reason: 'internal admin note',
      failure_reason: 'internal failure detail',
      fulfillment_error: 'internal fulfillment detail',
      fulfillment_attempts: 4,
      stripe_payment_intent_id: 'pi_participant_secret',
      order_id: db.collection('order').doc('o-internal'),
      issued_ticket_count: 2,
      ...overrides,
    });

  const assertParticipantResponse = (request) => {
    assert.deepEqual(Object.keys(request).sort(), PARTICIPANT_PAYMENT_REQUEST_KEYS);
    const serialized = JSON.stringify(request);
    assert.equal(serialized.includes('internal admin note'), false);
    assert.equal(serialized.includes('internal failure detail'), false);
    assert.equal(serialized.includes('internal fulfillment detail'), false);
    assert.equal(serialized.includes('pi_participant_secret'), false);
    assert.equal('initiated_by' in request, false);
    assert.equal('reason' in request, false);
    assert.equal('failure_reason' in request, false);
    assert.equal('fulfillment_error' in request, false);
    assert.equal('fulfillment_attempts' in request, false);
    assert.equal('user_id' in request, false);
    assert.equal('competition_id' in request, false);
    assert.equal('order_id' in request, false);
  };

  const makeUrlHandler = (db, retrieve) =>
    createGetAdditionalPaymentCheckoutUrlHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      assertAuthenticated: (request) => {
        if (!request.auth?.uid) throw new MockHttpsError('unauthenticated', 'login');
        return request.auth.uid;
      },
      HttpsError: MockHttpsError,
      stripeFactory: () => ({
        checkout: {
          sessions: {
            retrieve: async (sessionId) => retrieve(sessionId),
          },
        },
      }),
      getStripeSecretKey: () => 'sk_test',
      now: () => NOW,
    });

  it('allows the owner and an admin to retrieve a checkout URL with separate response boundaries', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedInternalRequest(db, refs);

    const handler = createGetAdditionalPaymentCheckoutUrlHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      assertAuthenticated: (request) => {
        if (!request.auth?.uid) throw new MockHttpsError('unauthenticated', 'login');
        return request.auth.uid;
      },
      HttpsError: MockHttpsError,
      stripeFactory: makeStripe().factory,
      getStripeSecretKey: () => 'sk_test',
      now: () => NOW,
    });

    const owner = await handler({ auth: { uid: USER_UID }, data: { requestId: 'req-additional-001' } });
    assert.equal(owner.can_pay, true);
    assert.equal(owner.url, 'https://stripe.test/cs_test_1');
    assertParticipantResponse(owner.request);

    const admin = await handler({ auth: { uid: ADMIN_UID }, data: { requestId: 'req-additional-001' } });
    assert.equal(admin.can_pay, true);
    assert.equal(admin.request.initiated_by, ADMIN_UID);
    assert.equal(admin.request.reason, 'internal admin note');
    assert.equal(admin.request.failure_reason, 'internal failure detail');
    assert.equal(admin.request.fulfillment_error, 'internal fulfillment detail');
    assert.equal(admin.request.fulfillment_attempts, 4);
    assert.equal(admin.request.stripe_payment_intent_id, undefined);

    await assert.rejects(
      handler({ auth: { uid: 'u2' }, data: { requestId: 'req-additional-001' } }),
      (error) => error.code === 'permission-denied'
    );
  });

  it('lists only the authenticated participant requests with the participant allowlist', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedInternalRequest(db, refs);
    db.setDocument('user', 'u2', { display_name: 'Other User' });
    db.setDocument(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-other', {
      ...db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-additional-001').data(),
      request_id: 'req-other',
      user_ref: db.collection('user').doc('u2'),
    });

    const handler = createGetMyAdditionalPaymentRequestsHandler({
      db,
      assertAuthenticated: () => USER_UID,
      now: () => NOW,
    });
    const result = await handler({ auth: { uid: USER_UID } });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].request_id, 'req-additional-001');
    assert.equal(result.requests[0].competition_title, 'Additional Payment Competition');
    assert.equal(result.requests[0].requested_ticket_quantity, 2);
    assert.equal(result.requests[0].total_amount, 20);
    assert.equal(result.requests[0].currency, 'GBP');
    assert.equal(result.requests[0].payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(
      result.requests[0].fulfillment_status,
      ADDITIONAL_PAYMENT_FULFILLMENT.PENDING
    );
    assert.equal(result.requests[0].can_pay, true);
    assertParticipantResponse(result.requests[0]);
  });

  it('admin listing retains the full admin response fields', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedInternalRequest(db, refs);

    const handler = createListAdditionalPaymentRequestsHandler({
      db,
      assertAdmin: makeAssertAdmin(db),
      HttpsError: MockHttpsError,
      now: () => NOW,
    });

    const result = await handler({
      auth: { uid: ADMIN_UID },
      data: { competitionId: 'c1' },
    });
    assert.equal(result.requests.length, 1);
    const adminRequest = result.requests[0];
    assert.equal(adminRequest.request_id, 'req-additional-001');
    assert.equal(adminRequest.user_id, USER_UID);
    assert.equal(adminRequest.competition_id, 'c1');
    assert.equal(adminRequest.initiated_by, ADMIN_UID);
    assert.equal(adminRequest.reason, 'internal admin note');
    assert.equal(adminRequest.failure_reason, 'internal failure detail');
    assert.equal(adminRequest.fulfillment_error, 'internal fulfillment detail');
    assert.equal(adminRequest.fulfillment_attempts, 4);
    assert.equal(adminRequest.order_id, 'o-internal');
    assert.equal(adminRequest.unit_price, 10);
    assert.equal(adminRequest.unit_amount_minor, 1000);
    assert.equal(adminRequest.total_amount_minor, 2000);

    await assert.rejects(
      handler({ auth: { uid: USER_UID }, data: { competitionId: 'c1' } }),
      (error) => error.code === 'permission-denied'
    );
  });

  it('participant checkout URL branches expose only the participant allowlist', async () => {
    const cases = [
      {
        label: 'open',
        session: {
          id: 'cs_test_1',
          url: 'https://stripe.test/open',
          status: 'open',
          payment_status: 'unpaid',
        },
        expectedReason: null,
        expectedCanPay: true,
      },
      {
        label: 'paid',
        session: {
          id: 'cs_test_1',
          url: 'https://stripe.test/paid',
          status: 'complete',
          payment_status: 'paid',
          payment_intent: 'pi_url_paid',
          amount_total: 2000,
          currency: 'gbp',
          mode: 'payment',
        },
        expectedReason: 'already_paid',
        expectedCanPay: false,
      },
      {
        label: 'complete unpaid',
        session: {
          id: 'cs_test_1',
          status: 'complete',
          payment_status: 'unpaid',
          amount_total: 2000,
          currency: 'gbp',
          mode: 'payment',
        },
        expectedReason: 'processing',
        expectedCanPay: false,
      },
      {
        label: 'expired',
        session: {
          id: 'cs_test_1',
          status: 'expired',
          payment_status: 'unpaid',
          amount_total: 2000,
          currency: 'gbp',
          mode: 'payment',
        },
        expectedReason: 'expired',
        expectedCanPay: false,
      },
    ];

    for (const testCase of cases) {
      const db = new MemoryDB();
      const refs = seed(db);
      seedInternalRequest(db, refs, { expires_at_millis: NOW - 1000 });
      const handler = makeUrlHandler(db, () => testCase.session);
      const result = await handler({
        auth: { uid: USER_UID },
        data: { requestId: 'req-additional-001' },
      });

      assert.equal(result.can_pay, testCase.expectedCanPay, testCase.label);
      if (testCase.expectedReason) {
        assert.equal(result.reason, testCase.expectedReason, testCase.label);
      }
      assertParticipantResponse(result.request);
    }
  });

  it('participant checkout URL unavailable and retrieval-failure paths do not leak internals', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedInternalRequest(db, refs, { stripe_checkout_session_id: '' });
    const noSessionHandler = makeUrlHandler(db, () => {
      throw new Error('should not be called');
    });
    await assert.rejects(
      noSessionHandler({
        auth: { uid: USER_UID },
        data: { requestId: 'req-additional-001' },
      }),
      (error) =>
        error.code === 'failed-precondition' &&
        !error.message.includes('internal admin note') &&
        !error.message.includes('internal failure detail') &&
        !error.message.includes('pi_participant_secret')
    );

    const expiredDb = new MemoryDB();
    const expiredRefs = seed(expiredDb);
    seedInternalRequest(expiredDb, expiredRefs, {
      stripe_checkout_session_id: '',
      expires_at_millis: NOW - 1000,
    });
    const expiredHandler = makeUrlHandler(expiredDb, () => {
      throw new Error('should not be called');
    });
    const expiredResult = await expiredHandler({
      auth: { uid: USER_UID },
      data: { requestId: 'req-additional-001' },
    });
    assert.equal(expiredResult.can_pay, false);
    assert.equal(expiredResult.reason, 'expired');
    assertParticipantResponse(expiredResult.request);

    const failingDb = new MemoryDB();
    const failingRefs = seed(failingDb);
    seedInternalRequest(failingDb, failingRefs);
    const failingHandler = makeUrlHandler(failingDb, () => {
      throw new Error('stripe internal failure detail');
    });
    await assert.rejects(
      failingHandler({
        auth: { uid: USER_UID },
        data: { requestId: 'req-additional-001' },
      }),
      (error) =>
        error.code === 'failed-precondition' &&
        !error.message.includes('stripe internal failure detail') &&
        !error.message.includes('internal admin note')
    );
  });
});

describe('additional payment webhook settlement and fulfillment', () => {
  it('fulfills exactly the requested paid tickets after verified settlement', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);

    const result = await runWebhook(db, makeWebhookEvent());

    assert.equal(result.statusCode, 200);
    assert.equal(result.body, 'Additional payment processed.');

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
    assert.equal(request.issued_ticket_count, 2);
    assert.equal(request.stripe_payment_intent_id, 'pi_additional_1');
    assert.ok(request.order_id);

    const orderId = request.order_id.id;
    const order = db.snapshot('order', orderId).data();
    assert.equal(order.status, 'paid');
    assert.equal(order.order_type, 'additional_payment');
    assert.equal(order.additional_payment_request_id, 'req-additional-001');
    assert.equal(order.total_ticket, 2);
    assert.equal(order.paid_ticket, 2);
    assert.equal(order.free_ticket, 0);
    assert.equal(order.free_used, 0);
    assert.equal(order.total_amount, 20);
    assert.equal(order.stripe_status, 'paid');
    assert.equal(order.stripe_payment_intent_id, 'pi_additional_1');
    assert.equal(order.fulfillment_status, 'fulfilled');

    const tickets = Array.from(db.collectionStore('ticket').values());
    assert.equal(tickets.length, 2);
    tickets.forEach((ticket) => {
      assert.equal(ticket.allocation_type, 'paid');
      assert.equal(ticket.status, 'active');
      assert.equal(ticket.order_id.id, orderId);
    });
    assert.equal(new Set(tickets.map((ticket) => ticket.ticket_number)).size, 2);

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.stock_quantity, 48);
    assert.equal(competition.sold_tickets, 2);
    assert.equal(competition.last_ticket_sequence, 2);
    assert.equal(competition.participants.length, 1);

    const user = db.snapshot('user', USER_UID).data();
    assert.equal(user.total_tickets_bought, 2);
    assert.equal(user.total_spent, 20);

    assert.equal(db.collections.has('free_ticket_log'), false);
    assert.equal(db.collections.has('referrals'), false);

    const events = auditEvents(db);
    assert.deepEqual(
      events.map((event) => event.action).sort(),
      [
        AUDIT_ACTIONS.PAYMENT_RECEIVED,
        AUDIT_ACTIONS.PAYMENT_REQUEST_FULFILLED,
      ].sort()
    );
    const receipt = events.find((event) => event.action === AUDIT_ACTIONS.PAYMENT_RECEIVED);
    const fulfillment = events.find(
      (event) => event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_FULFILLED
    );
    assert.equal(receipt.actor_type, 'system');
    assert.equal(receipt.related.payment_request_id, 'req-additional-001');
    assert.equal(receipt.after.total_amount, 20);
    assert.equal(fulfillment.related.order_id, orderId);
    assert.equal(fulfillment.after.issued_ticket_count, 2);
    assert.equal(JSON.stringify(events).includes('pi_additional_1'), false);
  });

  it('does not issue tickets on an unpaid completed session', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);

    const result = await runWebhook(
      db,
      makeWebhookEvent({ sessionOverrides: { payment_status: 'unpaid' } })
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body, 'Payment pending.');
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PROCESSING);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.PENDING);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('order').size, 0);
  });

  it('rejects wrong session, amount, and currency without mutating state', async () => {
    const cases = [
      [{ id: 'cs_other' }, '400'],
      [{ amount_total: 1999 }, '400'],
      [{ currency: 'usd' }, '400'],
    ];

    for (const [sessionOverrides, statusCode] of cases) {
      const db = new MemoryDB();
      const refs = seed(db);
      seedRequest(db, refs);
      const before = db.snapshot(
        ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
        'req-additional-001'
      ).data();

      const result = await runWebhook(
        db,
        makeWebhookEvent({ sessionOverrides })
      );

      assert.equal(String(result.statusCode), statusCode);
      assert.deepEqual(
        db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-additional-001').data(),
        before
      );
      assert.equal(db.collectionStore('ticket').size, 0);
    }
  });

  it('handles duplicate deliveries without duplicate tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);

    const first = await runWebhook(db, makeWebhookEvent());
    const second = await runWebhook(db, makeWebhookEvent());

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body, 'Additional payment already processed.');
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(db.collectionStore('order').size, 1);
  });

  it('serializes concurrent deliveries without duplicate tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);

    const results = await Promise.all([
      runWebhook(db, makeWebhookEvent()),
      runWebhook(db, makeWebhookEvent()),
    ]);

    assert.equal(results.every((result) => result.statusCode === 200), true);
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(db.collectionStore('order').size, 1);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
  });

  it('records paid-but-unfulfilled when the competition becomes ineligible before fulfillment', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      status: 'drawing',
    });

    const result = await runWebhook(db, makeWebhookEvent());

    assert.equal(result.statusCode, 500);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FAILED);
    assert.equal(request.fulfillment_attempts, 1);
    assert.equal(typeof request.fulfillment_error, 'string');
    assert.equal(request.stripe_payment_intent_id, 'pi_additional_1');
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('order').size, 0);
    const failed = auditEvents(db).find(
      (event) => event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_FAILED
    );
    assert.equal(failed.actor_type, 'system');
    assert.equal(failed.related.payment_request_id, 'req-additional-001');
  });

  it('retries fulfillment after a paid-unfulfilled state without a second order or tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      stock_quantity: 1,
    });

    const first = await runWebhook(db, makeWebhookEvent());
    assert.equal(first.statusCode, 500);

    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      stock_quantity: 50,
    });

    const second = await runWebhook(db, makeWebhookEvent());
    assert.equal(second.statusCode, 200, second.body);

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
    assert.equal(request.issued_ticket_count, 2);
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(db.collectionStore('order').size, 1);
  });

  it('rejects an invalid Stripe signature before touching an additional payment request', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);
    const before = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();

    const handler = createStripeWebhookHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      runOrderTransaction,
      buildNotificationPayload,
      evaluateCheckoutSettlement,
      SettlementValidationError,
      PAYMENT_SETTLEMENT,
      stripeFactory: () => ({
        webhooks: {
          constructEvent: () => {
            throw new Error('invalid signature');
          },
        },
      }),
      getStripeSecretKey: () => 'sk_test',
      getWebhookSecret: () => 'whsec_test',
    });

    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(body) {
        this.body = body;
        return this;
      },
    };

    await handler(
      { headers: { 'stripe-signature': 'bad' }, rawBody: new TextEncoder().encode('{}') },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body, /Webhook Error: invalid signature/);
    assert.deepEqual(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-additional-001').data(),
      before
    );
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('marks a pending request expired on a verified expiry event', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs);

    const result = await runWebhook(db, {
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { additionalPaymentRequestId: 'req-additional-001' },
        },
      },
    });

    assert.equal(result.statusCode, 200);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-additional-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.EXPIRED);
    assert.equal(db.collectionStore('ticket').size, 0);
    const expired = auditEvents(db).find(
      (event) => event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_EXPIRED
    );
    assert.equal(expired.related.payment_request_id, 'req-additional-001');
  });

  it('never marks an already-paid request expired', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED,
    });

    const result = await runWebhook(db, {
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { additionalPaymentRequestId: 'req-additional-001' },
        },
      },
    });

    assert.equal(result.statusCode, 200);
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-additional-001').data()
        .payment_status,
      ADDITIONAL_PAYMENT_STATUS.PAID
    );
  });
});
