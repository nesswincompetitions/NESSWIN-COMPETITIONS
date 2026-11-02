import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  createRefundOrderHandler,
  createGetOrderRefundEligibilityHandler,
  processRefundWebhookEvent,
} from '../services/refundOrderService.js';

const ADMIN_UID = 'admin1';
const REQUEST_ID = 'refund-request-001';

function seed(db, overrides = {}) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', 'u1', { role: 'user', free_tickets: 0 });
  db.setDocument('competition', 'c1', { title: 'Refund Competition', status: 'active' });
  db.setDocument('order', 'o1', {
    user_ref: userRef,
    competition_id: competitionRef,
    status: 'paid',
    total_ticket: 4,
    paid_ticket: 4,
    free_ticket: 0,
    free_used: 0,
    total_amount: 100,
    currency: 'GBP',
    stripe_status: 'paid',
    stripe_payment_intent_id: 'pi_1',
    is_winner: false,
    ...(overrides.order || {}),
  });
  db.setDocument('ticket', 't1', {
    order_id: orderRef,
    user_id: userRef,
    competition_id: competitionRef,
    ticket_number: 1,
    ticket_sequence: 'REF001',
    status: 'active',
    is_winner: false,
    allocation_type: 'paid',
  });
  db.setDocument('ticket', 't2', {
    order_id: orderRef,
    user_id: userRef,
    competition_id: competitionRef,
    ticket_number: 2,
    ticket_sequence: 'REF002',
    status: 'invalid',
    is_winner: false,
    allocation_type: 'paid',
  });

  return { userRef, competitionRef, orderRef };
}

function makeStripe({
  paymentIntent = {
    id: 'pi_1',
    object: 'payment_intent',
    status: 'succeeded',
    amount_received: 10000,
    amount: 10000,
    currency: 'gbp',
    latest_charge: 'ch_1',
  },
  refunds = [],
  createResult = null,
  createError = null,
  createErrorAfterResult = null,
  createDelayMs = 0,
  listError = null,
  retrieveResult = null,
} = {}) {
  const calls = {
    create: [],
    list: [],
    retrievePaymentIntent: [],
    retrieveRefund: [],
    retrieveSession: [],
  };
  const refundList = [...refunds];

  const stripe = {
    paymentIntents: {
      retrieve: async (id) => {
        calls.retrievePaymentIntent.push(id);
        return { ...paymentIntent, id };
      },
    },
    refunds: {
      list: async (params) => {
        calls.list.push(params);
        if (listError) throw listError;
        const matching = refundList.filter(
          (refund) =>
            !params.payment_intent ||
            refund.payment_intent === params.payment_intent
        );
        return { data: matching, has_more: false };
      },
      create: async (payload, options) => {
        calls.create.push({ payload, options });
        if (createDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, createDelayMs));
        }
        if (createError) throw createError;
        const result = createResult || {
          id: 're_created',
          object: 'refund',
          amount: payload.amount,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: payload.payment_intent,
          metadata: payload.metadata,
        };
        refundList.push(result);
        if (createErrorAfterResult) throw createErrorAfterResult;
        return result;
      },
      retrieve: async (id) => {
        calls.retrieveRefund.push(id);
        if (retrieveResult) return retrieveResult;
        return refundList.find((refund) => refund.id === id) || {
          id,
          status: 'succeeded',
          amount: 0,
          currency: 'gbp',
          payment_intent: 'pi_1',
          metadata: {},
        };
      },
    },
    checkout: {
      sessions: {
        retrieve: async (id) => {
          calls.retrieveSession.push(id);
          return { id, payment_intent: 'pi_1' };
        },
      },
    },
  };

  return { stripe, calls, refundList };
}

function seedWebhookReservation(db, recordOverrides = {}, orderOverrides = {}) {
  const record = {
    request_id: 'refund-webhook-001',
    refund_id: null,
    amount_minor: 3000,
    currency: 'GBP',
    status: 'pending',
    reason: 'webhook test',
    actor_uid: ADMIN_UID,
    payment_intent_id: 'pi_1',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...recordOverrides,
  };
  const holdsReservation = ['pending', 'requires_action'].includes(record.status);
  db.setDocument('order', 'o1', {
    ...db.snapshot('order', 'o1').data(),
    refunds: [record],
    refund_reserved_amount_minor: holdsReservation ? record.amount_minor : 0,
    refund_status: holdsReservation ? 'pending' : undefined,
    ...orderOverrides,
  });
  return record;
}

function makeHandler(db, stripe) {
  return createRefundOrderHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: async () => ADMIN_UID,
    HttpsError: MockHttpsError,
    stripeFactory: () => stripe,
    getStripeSecretKey: () => 'sk_test_123',
  });
}

function makeEligibilityHandler(db, stripe) {
  return createGetOrderRefundEligibilityHandler({
    db,
    assertAdmin: async () => ADMIN_UID,
    HttpsError: MockHttpsError,
    stripeFactory: () => stripe,
    getStripeSecretKey: () => 'sk_test_123',
  });
}

function refundRequest(overrides = {}) {
  return {
    auth: { uid: ADMIN_UID },
    data: {
      orderId: 'o1',
      amountMinor: 3000,
      reason: 'customer goodwill',
      requestId: REQUEST_ID,
      ...overrides,
    },
  };
}

function requestWithReason(reason) {
  return refundRequest({ reason });
}

function ticketStatuses(db) {
  const result = {};
  db.collectionStore('ticket').forEach((data, id) => {
    result[id] = data.status;
  });
  return result;
}

describe('admin Stripe refund', () => {
  it('issues a partial Stripe refund and preserves tickets and transaction history', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createResult: {
        id: 're_partial',
        object: 'refund',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });
    const ticketsBefore = ticketStatuses(db);

    const result = await makeHandler(db, stripe)(refundRequest());

    assert.equal(result.success, true);
    assert.equal(result.status, 'succeeded');
    assert.equal(result.refundId, 're_partial');
    assert.equal(result.amountMinor, 3000);
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].payload.payment_intent, 'pi_1');
    assert.equal(calls.create[0].payload.amount, 3000);
    assert.equal(calls.create[0].payload.metadata.orderId, 'o1');
    assert.equal(calls.create[0].payload.metadata.refundRequestId, REQUEST_ID);
    assert.equal(
      calls.create[0].options.idempotencyKey,
      `refund_o1_${REQUEST_ID}`
    );

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.refund_status, 'partial');
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refunded_amount, 30);
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.total_amount, 100);
    assert.equal(order.total_ticket, 4);
    assert.equal(order.stripe_payment_intent_id, 'pi_1');
    assert.equal(order.refunds.length, 1);
    assert.equal(order.refunds[0].refund_id, 're_partial');
    assert.equal(order.refunds[0].status, 'succeeded');
    assert.equal(order.refunds[0].amount_minor, 3000);
    assert.deepEqual(ticketStatuses(db), ticketsBefore);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'active');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');

    const audits = [...db.collectionStore('admin_audit_events').values()];
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'refund.issued');
    assert.equal(audits[0].entity_type, 'refund');
    assert.equal(audits[0].actor_uid, ADMIN_UID);
    assert.equal(audits[0].related.order_id, 'o1');
    assert.equal(audits[0].related.refund_id, 're_partial');
    assert.equal(audits[0].after.refund_amount_minor, 3000);
    assert.equal(audits[0].after.refund_status, 'succeeded');
  });

  it('refunds the full remaining amount and marks the order refunded', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      refunds: [
        {
          id: 're_previous',
          amount: 2500,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: 'pi_1',
          metadata: {},
        },
      ],
      createResult: {
        id: 're_full',
        object: 'refund',
        amount: 7500,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });

    const handler = makeHandler(db, stripe);
    const result = await handler(
      refundRequest({ amountMinor: 7500 })
    );

    assert.equal(result.success, true);
    assert.equal(result.previouslyRefundedMinor, 2500);
    assert.equal(result.remainingRefundableMinor, 0);
    const replay = await handler(refundRequest({ amountMinor: 7500 }));
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.refundId, 're_full');
    assert.equal(calls.create.length, 1);
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'Refunded');
    assert.equal(order.payment_status, 'refunded');
    assert.equal(order.refund_status, 'refunded');
    assert.equal(order.refunded_amount_minor, 10000);
    assert.equal(order.refunded_amount, 100);
    assert.equal(order.refund_reserved_amount_minor, 0);
  });

  it('rejects a refund above the verified remaining refundable amount', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      refunds: [
        {
          id: 're_existing',
          amount: 2000,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: 'pi_1',
          metadata: {},
        },
      ],
    });
    const orderBefore = db.snapshot('order', 'o1').data();

    await assert.rejects(
      makeHandler(db, stripe)(refundRequest({ amountMinor: 8001 })),
      (error) =>
        error.code === 'failed-precondition' &&
        /remaining refundable amount/.test(error.message)
    );

    assert.equal(calls.create.length, 0);
    assert.deepEqual(db.snapshot('order', 'o1').data(), orderBefore);
  });

  it('does not mark an order refunded when Stripe rejects the refund', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createError: Object.assign(new Error('card issuer declined the refund'), {
        type: 'StripeCardError',
        code: 'card_declined',
        statusCode: 402,
      }),
    });

    await assert.rejects(
      makeHandler(db, stripe)(refundRequest()),
      (error) =>
        error.code === 'failed-precondition' &&
        /Stripe rejected the refund/.test(error.message)
    );

    assert.equal(calls.create.length, 1);
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.refunded_amount_minor, undefined);
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.refund_status, null);
    assert.equal(order.refunds.length, 1);
    assert.equal(order.refunds[0].status, 'failed');
    assert.match(order.refunds[0].failure_reason, /declined/);
    assert.equal(db.collectionStore('admin_audit_events').size, 0);
  });

  it('reconciles a refund created by Stripe when the client receives a timeout', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls, refundList } = makeStripe({
      createResult: {
        id: 're_timeout_created',
        object: 'refund',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
      createErrorAfterResult: Object.assign(new Error('request timeout'), {
        type: 'StripeConnectionError',
        code: 'timeout',
      }),
    });

    const result = await makeHandler(db, stripe)(refundRequest());

    assert.equal(calls.create.length, 1);
    assert.equal(refundList.length, 1);
    assert.equal(result.success, true);
    assert.equal(result.status, 'succeeded');
    assert.equal(result.idempotentReplay, true);
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.refunds[0].status, 'succeeded');
    assert.equal(order.refunds[0].refund_id, 're_timeout_created');
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refund_reserved_amount_minor, 0);
  });

  it('preserves the reservation when a Stripe outcome is uncertain', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createError: Object.assign(new Error('connection reset'), {
        type: 'StripeConnectionError',
        code: 'econnreset',
      }),
      listError: null,
    });
    const handler = makeHandler(db, stripe);

    const result = await handler(refundRequest());

    assert.equal(result.success, false);
    assert.equal(result.pending, true);
    assert.equal(result.status, 'uncertain');
    assert.equal(result.requestId, REQUEST_ID);
    assert.equal(calls.create.length, 1);
    let order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.refunds[0].status, 'pending');
    assert.equal(order.refund_reserved_amount_minor, 3000);
    assert.equal(order.refunded_amount_minor, undefined);
    assert.equal(db.collectionStore('admin_audit_events').size, 0);

    const retried = await handler(refundRequest());
    assert.equal(retried.status, 'pending');
    assert.equal(retried.requestId, REQUEST_ID);
    assert.equal(calls.create.length, 1);
    order = db.snapshot('order', 'o1').data();
    assert.equal(order.refunds[0].status, 'pending');
    assert.equal(order.refund_reserved_amount_minor, 3000);
  });

  it('rejects the same request ID with a different amount', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createResult: {
        id: 're_same_request',
        object: 'refund',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });
    const handler = makeHandler(db, stripe);

    await handler(refundRequest({ amountMinor: 3000 }));
    await assert.rejects(
      handler(refundRequest({ amountMinor: 4000 })),
      (error) =>
        error.code === 'failed-precondition' &&
        /different refund amount/.test(error.message)
    );

    assert.equal(calls.create.length, 1);
    assert.equal(db.snapshot('order', 'o1').data().refunds.length, 1);
    assert.equal(db.snapshot('order', 'o1').data().refunded_amount_minor, 3000);
  });

  it('serializes concurrent invocations with the same request ID to one Stripe submission', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createDelayMs: 15,
      createResult: {
        id: 're_concurrent_same',
        object: 'refund',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });
    const handler = makeHandler(db, stripe);

    const results = await Promise.all([
      handler(refundRequest()),
      handler(refundRequest()),
    ]);

    assert.equal(calls.create.length, 1);
    assert.equal(
      results.filter((result) => result.status === 'succeeded').length,
      1
    );
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.refunds.length, 1);
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refund_reserved_amount_minor, 0);
  });

  it('does not release a reservation claimed by another invocation', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe } = makeStripe();
    stripe.refunds.create = async () => {
      const order = db.snapshot('order', 'o1').data();
      const records = [...order.refunds];
      records[0] = {
        ...records[0],
        submission_token: 'another-invocation-token',
      };
      db.setDocument('order', 'o1', { ...order, refunds: records });
      throw Object.assign(new Error('invalid request'), {
        type: 'StripeInvalidRequestError',
        statusCode: 400,
      });
    };

    await assert.rejects(
      makeHandler(db, stripe)(refundRequest()),
      (error) => error.code === 'failed-precondition'
    );

    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.refunds[0].status, 'pending');
    assert.equal(order.refund_reserved_amount_minor, 3000);
    assert.equal(order.refunds[0].submission_token, 'another-invocation-token');
  });

  it('includes prior Stripe refunds in concurrent reservation capacity checks', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      refunds: [
        {
          id: 're_external_prior',
          amount: 4000,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: 'pi_1',
          metadata: {},
        },
      ],
      createDelayMs: 10,
      createResult: {
        id: 're_after_prior',
        object: 'refund',
        amount: 4000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: 'refund-concurrent-a',
          adminUid: ADMIN_UID,
        },
      },
    });
    const handler = makeHandler(db, stripe);

    const results = await Promise.allSettled([
      handler(refundRequest({ amountMinor: 4000, requestId: 'refund-concurrent-a' })),
      handler(refundRequest({ amountMinor: 4000, requestId: 'refund-concurrent-b' })),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(calls.create.length, 1);
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.refunded_amount_minor, 8000);
  });

  it('accepts idempotent replay when the normalized reason matches', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createResult: {
        id: 're_same_reason',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });
    const handler = makeHandler(db, stripe);

    const first = await handler(refundRequest({ reason: 'customer goodwill' }));
    const replay = await handler(requestWithReason('  customer goodwill  '));

    assert.equal(first.success, true);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(calls.create.length, 1);
    assert.equal(db.snapshot('order', 'o1').data().refunds.length, 1);
  });

  it('rejects reuse of a completed request ID with a different normalized reason', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createResult: {
        id: 're_reason_conflict',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });
    const handler = makeHandler(db, stripe);

    await handler(refundRequest({ reason: 'customer goodwill' }));
    await assert.rejects(
      handler(refundRequest({ reason: 'different reason' })),
      (error) =>
        error.code === 'failed-precondition' &&
        /different refund reason/.test(error.message)
    );

    assert.equal(calls.create.length, 1);
    assert.equal(db.snapshot('order', 'o1').data().refunds.length, 1);
  });

  it('rejects reuse of an existing request ID with a different currency', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('order', 'o1', {
      ...db.snapshot('order', 'o1').data(),
      refunds: [
        {
          request_id: REQUEST_ID,
          refund_id: 're_currency',
          amount_minor: 3000,
          currency: 'USD',
          status: 'succeeded',
          reason: 'customer goodwill',
          actor_uid: ADMIN_UID,
          payment_intent_id: 'pi_1',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    });
    const { stripe, calls } = makeStripe();

    await assert.rejects(
      makeHandler(db, stripe)(refundRequest()),
      (error) =>
        error.code === 'failed-precondition' &&
        /different refund currency/.test(error.message)
    );
    assert.equal(calls.create.length, 0);
  });

  it('replays a duplicate admin request without issuing a second Stripe refund', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls } = makeStripe({
      createResult: {
        id: 're_once',
        object: 'refund',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });
    const handler = makeHandler(db, stripe);

    const first = await handler(refundRequest());
    const second = await handler(refundRequest());

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.idempotentReplay, true);
    assert.equal(calls.create.length, 1);
    assert.equal(db.snapshot('order', 'o1').data().refunds.length, 1);
    assert.equal(db.snapshot('order', 'o1').data().refunded_amount_minor, 3000);
  });

  it('reconciles a Stripe success whose Firestore persistence initially failed', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe, calls, refundList } = makeStripe({
      createResult: {
        id: 're_reconcile',
        object: 'refund',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: REQUEST_ID,
          adminUid: ADMIN_UID,
        },
      },
    });
    const handler = makeHandler(db, stripe);
    const originalRunTransaction = db.runTransaction.bind(db);
    let transactionCalls = 0;
    db.runTransaction = async (fn) => {
      transactionCalls += 1;
      if (transactionCalls === 2) {
        throw new Error('simulated Firestore persistence failure');
      }
      return originalRunTransaction(fn);
    };

    await assert.rejects(
      handler(refundRequest()),
      (error) =>
        error.code === 'aborted' &&
        /Retry the same request ID to reconcile/.test(error.message)
    );

    assert.equal(calls.create.length, 1);
    assert.equal(refundList.length, 1);
    let order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.refunds.length, 1);
    assert.equal(order.refunds[0].status, 'pending');
    assert.equal(order.refunds[0].refund_id, null);
    assert.equal(order.refund_reserved_amount_minor, 3000);

    db.runTransaction = originalRunTransaction;
    const retried = await handler(refundRequest());

    assert.equal(retried.success, true);
    assert.equal(retried.idempotentReplay, true);
    assert.equal(calls.create.length, 1);
    order = db.snapshot('order', 'o1').data();
    assert.equal(order.refunds[0].status, 'succeeded');
    assert.equal(order.refunds[0].refund_id, 're_reconcile');
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(db.collectionStore('admin_audit_events').size, 1);
  });

  it('exposes verified refund eligibility without trusting current ticket prices', async () => {
    const db = new MemoryDB();
    seed(db);
    const { stripe } = makeStripe({
      refunds: [
        {
          id: 're_old',
          amount: 1500,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: 'pi_1',
          metadata: {},
        },
        {
          id: 're_failed',
          amount: 9999,
          currency: 'gbp',
          status: 'failed',
          payment_intent: 'pi_1',
          metadata: {},
        },
      ],
    });

    const eligibility = await makeEligibilityHandler(db, stripe)({
      auth: { uid: ADMIN_UID },
      data: { orderId: 'o1' },
    });

    assert.equal(eligibility.originalAmountMinor, 10000);
    assert.equal(eligibility.previouslyRefundedMinor, 1500);
    assert.equal(eligibility.remainingRefundableMinor, 8500);
    assert.equal(eligibility.currency, 'GBP');
    assert.match(eligibility.calculationBasis, /original settled Stripe PaymentIntent/);
  });
});

describe('Stripe refund webhook reconciliation', () => {
  it('records a Stripe-confirmed refund without changing tickets', async () => {
    const db = new MemoryDB();
    seed(db);
    db.setDocument('order', 'o1', {
      ...db.snapshot('order', 'o1').data(),
      refunds: [
        {
          request_id: 'refund-webhook-001',
          refund_id: null,
          amount_minor: 3000,
          currency: 'GBP',
          status: 'pending',
          reason: 'webhook test',
          actor_uid: ADMIN_UID,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      refund_reserved_amount_minor: 3000,
      refund_status: 'pending',
    });
    const { stripe } = makeStripe();
    const ticketsBefore = ticketStatuses(db);

    const outcome = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event: {
        type: 'refund.updated',
        data: {
          object: {
            id: 're_webhook',
            object: 'refund',
            amount: 3000,
            currency: 'gbp',
            status: 'succeeded',
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
              adminUid: ADMIN_UID,
              adminReason: 'webhook test',
            },
          },
        },
      },
    });

    assert.equal(outcome.statusCode, 200);
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.refund_status, 'partial');
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.refunds[0].status, 'succeeded');
    assert.equal(order.refunds[0].refund_id, 're_webhook');
    assert.deepEqual(ticketStatuses(db), ticketsBefore);
    assert.equal(db.collectionStore('admin_audit_events').size, 1);

    const duplicate = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event: {
        type: 'refund.updated',
        data: {
          object: {
            id: 're_webhook',
            object: 'refund',
            amount: 3000,
            currency: 'gbp',
            status: 'succeeded',
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
              adminUid: ADMIN_UID,
              adminReason: 'webhook test',
            },
          },
        },
      },
    });

    assert.equal(duplicate.statusCode, 200);
    assert.equal(db.snapshot('order', 'o1').data().refunded_amount_minor, 3000);
    assert.equal(db.collectionStore('admin_audit_events').size, 1);
  });

  it('rejects a refund event whose Stripe refund ID does not match the reservation', async () => {
    const db = new MemoryDB();
    seed(db);
    seedWebhookReservation(db, { refund_id: 're_expected' });
    const before = db.snapshot('order', 'o1').data();
    const { stripe } = makeStripe();

    const outcome = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event: {
        type: 'refund.updated',
        data: {
          object: {
            id: 're_other',
            amount: 3000,
            currency: 'gbp',
            status: 'succeeded',
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
            },
          },
        },
      },
    });

    assert.equal(outcome.statusCode, 400);
    assert.deepEqual(db.snapshot('order', 'o1').data(), before);
    assert.equal(db.collectionStore('admin_audit_events').size, 0);
  });

  it('rejects refund events with mismatched amount, currency, or PaymentIntent', async () => {
    const cases = [
      { field: 'amount', value: 2000 },
      { field: 'currency', value: 'usd' },
      { field: 'payment_intent', value: 'pi_other' },
    ];

    for (const testCase of cases) {
      const db = new MemoryDB();
      seed(db);
      seedWebhookReservation(db);
      const before = db.snapshot('order', 'o1').data();
      const { stripe } = makeStripe();

      const outcome = await processRefundWebhookEvent({
        db,
        admin: createMockAdmin(),
        logger: createMockLogger(),
        stripe,
        event: {
          type: 'refund.updated',
          data: {
            object: {
              id: 're_webhook',
              amount: testCase.field === 'amount' ? testCase.value : 3000,
              currency: testCase.field === 'currency' ? testCase.value : 'gbp',
              status: 'succeeded',
              payment_intent:
                testCase.field === 'payment_intent' ? testCase.value : 'pi_1',
              metadata: {
                orderId: 'o1',
                refundRequestId: 'refund-webhook-001',
              },
            },
          },
        },
      });

      assert.equal(outcome.statusCode, 400, testCase.field);
      assert.deepEqual(db.snapshot('order', 'o1').data(), before, testCase.field);
      assert.equal(db.collectionStore('admin_audit_events').size, 0, testCase.field);
    }
  });

  it('uses the stored reservation actor instead of Stripe metadata for audit attribution', async () => {
    const db = new MemoryDB();
    seed(db);
    seedWebhookReservation(db, { actor_uid: 'admin_reserved' });
    const { stripe } = makeStripe();

    const outcome = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event: {
        type: 'refund.updated',
        data: {
          object: {
            id: 're_actor',
            amount: 3000,
            currency: 'gbp',
            status: 'succeeded',
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
              adminUid: 'admin_from_metadata',
              adminReason: 'metadata reason',
            },
          },
        },
      },
    });

    assert.equal(outcome.statusCode, 200);
    const audits = [...db.collectionStore('admin_audit_events').values()];
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor_uid, 'admin_reserved');
    assert.equal(audits[0].reason, 'webhook test');
  });

  it('keeps a pending refund pending until Stripe confirms it', async () => {
    const db = new MemoryDB();
    seed(db);
    seedWebhookReservation(db);
    const { stripe } = makeStripe();

    const pendingOutcome = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event: {
        type: 'refund.created',
        data: {
          object: {
            id: 're_pending',
            amount: 3000,
            currency: 'gbp',
            status: 'pending',
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
              adminUid: 'ignored_metadata_actor',
            },
          },
        },
      },
    });

    assert.equal(pendingOutcome.statusCode, 200);
    let order = db.snapshot('order', 'o1').data();
    assert.equal(order.refund_status, 'pending');
    assert.equal(order.refunded_amount_minor, 0);
    assert.equal(order.refund_reserved_amount_minor, 3000);
    assert.equal(order.refunds[0].status, 'pending');
    assert.equal(order.refunds[0].refund_id, 're_pending');

    const confirmedOutcome = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event: {
        type: 'refund.updated',
        data: {
          object: {
            id: 're_pending',
            amount: 3000,
            currency: 'gbp',
            status: 'succeeded',
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
            },
          },
        },
      },
    });

    assert.equal(confirmedOutcome.statusCode, 200);
    order = db.snapshot('order', 'o1').data();
    assert.equal(order.refund_status, 'partial');
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.refunds[0].status, 'succeeded');
  });

  it('releases a requires_action reservation and completes it exactly once on success', async () => {
    const db = new MemoryDB();
    seed(db);
    seedWebhookReservation(db, {
      refund_id: 're_requires_action',
      status: 'requires_action',
    });
    const { stripe, calls } = makeStripe({
      refunds: [
        {
          id: 're_requires_action',
          amount: 3000,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: 'pi_1',
          metadata: {
            orderId: 'o1',
            refundRequestId: 'refund-webhook-001',
          },
        },
      ],
      createResult: {
        id: 're_followup',
        amount: 3000,
        currency: 'gbp',
        status: 'succeeded',
        payment_intent: 'pi_1',
        metadata: {
          orderId: 'o1',
          refundRequestId: 'refund-followup-001',
          adminUid: ADMIN_UID,
        },
      },
    });

    const event = {
      type: 'refund.updated',
      data: {
        object: {
          id: 're_requires_action',
          amount: 3000,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: 'pi_1',
          metadata: {
            orderId: 'o1',
            refundRequestId: 'refund-webhook-001',
          },
        },
      },
    };

    const outcome = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event,
    });

    assert.equal(outcome.statusCode, 200);
    let order = db.snapshot('order', 'o1').data();
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refund_status, 'partial');
    assert.equal(order.refunds[0].status, 'succeeded');
    const auditCount = db.collectionStore('admin_audit_events').size;

    const duplicate = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event,
    });
    assert.equal(duplicate.statusCode, 200);
    order = db.snapshot('order', 'o1').data();
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(db.collectionStore('admin_audit_events').size, auditCount);

    const followup = await makeHandler(db, stripe)(
      refundRequest({
        amountMinor: 3000,
        reason: 'follow-up refund',
        requestId: 'refund-followup-001',
      })
    );
    assert.equal(followup.success, true);
    assert.equal(calls.create.length, 1);
    order = db.snapshot('order', 'o1').data();
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.refunded_amount_minor, 6000);
    assert.equal(order.refund_status, 'partial');
  });

  for (const terminalStatus of ['failed', 'canceled']) {
    it(`releases a requires_action reservation on ${terminalStatus} without completing refunds`, async () => {
      const db = new MemoryDB();
      seed(db);
      seedWebhookReservation(db, {
        refund_id: 're_requires_action_terminal',
        status: 'requires_action',
      });
      const { stripe } = makeStripe();
      const event = {
        type: 'refund.updated',
        data: {
          object: {
            id: 're_requires_action_terminal',
            amount: 3000,
            currency: 'gbp',
            status: terminalStatus,
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
            },
          },
        },
      };

      const outcome = await processRefundWebhookEvent({
        db,
        admin: createMockAdmin(),
        logger: createMockLogger(),
        stripe,
        event,
      });

      assert.equal(outcome.statusCode, 200);
      let order = db.snapshot('order', 'o1').data();
      assert.equal(order.refund_reserved_amount_minor, 0);
      assert.equal(order.refunded_amount_minor, 0);
      assert.equal(order.refund_status, null);
      assert.equal(order.refunds[0].status, terminalStatus);
      const auditCount = db.collectionStore('admin_audit_events').size;

      const duplicate = await processRefundWebhookEvent({
        db,
        admin: createMockAdmin(),
        logger: createMockLogger(),
        stripe,
        event,
      });
      assert.equal(duplicate.statusCode, 200);
      order = db.snapshot('order', 'o1').data();
      assert.equal(order.refund_reserved_amount_minor, 0);
      assert.equal(order.refunded_amount_minor, 0);
      assert.equal(db.collectionStore('admin_audit_events').size, auditCount);
    });
  }

  it('reconciles a requires_action reservation through the direct handler', async () => {
    const db = new MemoryDB();
    seed(db);
    seedWebhookReservation(db, {
      refund_id: 're_direct_action',
      status: 'requires_action',
    });
    const { stripe } = makeStripe({
      refunds: [
        {
          id: 're_direct_action',
          amount: 3000,
          currency: 'gbp',
          status: 'succeeded',
          payment_intent: 'pi_1',
          metadata: {
            orderId: 'o1',
            refundRequestId: 'refund-webhook-001',
          },
        },
      ],
    });

    const result = await makeHandler(db, stripe)(
      refundRequest({
        requestId: 'refund-webhook-001',
        reason: 'webhook test',
      })
    );

    assert.equal(result.status, 'succeeded');
    assert.equal(result.idempotentReplay, true);
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.refund_reserved_amount_minor, 0);
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refund_status, 'partial');
    assert.equal(order.refunds[0].status, 'succeeded');
  });

  it('does not regress a succeeded refund on an out-of-order pending event', async () => {
    const db = new MemoryDB();
    seed(db);
    seedWebhookReservation(db, {
      refund_id: 're_terminal',
      status: 'succeeded',
    });
    db.setDocument('order', 'o1', {
      ...db.snapshot('order', 'o1').data(),
      refunded_amount_minor: 3000,
      refunded_amount: 30,
      refund_reserved_amount_minor: 0,
      refund_status: 'partial',
    });
    const auditCountBefore = db.collectionStore('admin_audit_events').size;
    const { stripe } = makeStripe();

    const outcome = await processRefundWebhookEvent({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      stripe,
      event: {
        type: 'refund.updated',
        data: {
          object: {
            id: 're_terminal',
            amount: 3000,
            currency: 'gbp',
            status: 'pending',
            payment_intent: 'pi_1',
            metadata: {
              orderId: 'o1',
              refundRequestId: 'refund-webhook-001',
            },
          },
        },
      },
    });

    assert.equal(outcome.statusCode, 200);
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.refund_status, 'partial');
    assert.equal(order.refunded_amount_minor, 3000);
    assert.equal(order.refunds[0].status, 'succeeded');
    assert.equal(db.collectionStore('admin_audit_events').size, auditCountBefore);
  });
});
