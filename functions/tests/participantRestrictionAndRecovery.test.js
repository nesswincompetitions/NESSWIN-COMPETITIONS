import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  MockHttpsError,
  createMockAdmin,
  createMockLogger,
} from './helpers/memoryFirestore.js';
import {
  createInvalidateUserCompetitionTicketsHandler,
  PARTICIPANT_REMOVAL_MODES,
} from '../services/ticketInvalidationService.js';
import {
  ADDITIONAL_PAYMENT_FULFILLMENT,
  ADDITIONAL_PAYMENT_LOCKS_COLLECTION,
  ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
  ADDITIONAL_PAYMENT_STATUS,
  createAdditionalPaymentRequestHandler,
  createGetAdditionalPaymentCheckoutUrlHandler,
  createRecoverAdditionalPaymentFulfillmentHandler,
  enforceAdditionalPaymentRestriction,
} from '../services/additionalPaymentService.js';
import {
  runOrderTransaction,
  validateCheckoutPreflight,
} from '../services/orderTransactionService.js';
import { createVerifiedStripeSettlementContext } from '../services/stripeSettlementService.js';
import { PAYMENT_SETTLEMENT } from '../services/ticketOrigin.js';
import {
  ADMIN_AUDIT_COLLECTION,
  AUDIT_ACTIONS,
} from '../services/adminAuditService.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const NOW = Date.now();
const ADMIN_UID = 'admin1';
const USER_UID = 'u1';

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

function seed(db, { competition = {}, otherCompetition = {}, tickets = null } = {}) {
  const userRef = db.collection('user').doc(USER_UID);
  const adminRef = db.collection('user').doc(ADMIN_UID);
  const competitionRef = db.collection('competition').doc('c1');
  const otherCompetitionRef = db.collection('competition').doc('c2');
  const orderRef = db.collection('order').doc('o1');

  db.setDocument('user', USER_UID, {
    display_name: 'Participant',
    is_active: true,
    free_tickets: 0,
    total_tickets_bought: 0,
    total_spent: 0,
  });
  db.setDocument('user', ADMIN_UID, { role: 'admin' });

  const baseCompetition = {
    title: 'Competition One',
    status: 'active',
    draw_date: FUTURE_DRAW,
    ticket_price: 10,
    total_tickets: 100,
    stock_quantity: 100,
    sold_tickets: 0,
    last_ticket_sequence: 0,
    participants: [userRef],
  };
  db.setDocument('competition', 'c1', { ...baseCompetition, ...competition });
  db.setDocument('competition', 'c2', {
    ...baseCompetition,
    title: 'Competition Two',
    participants: [userRef],
    ...otherCompetition,
  });

  db.setDocument('skill_attempts', `${USER_UID}_c1`, { passed: true });
  db.setDocument('skill_attempts', `${USER_UID}_c2`, { passed: true });

  const defaultTickets = [
    {
      id: 't1',
      data: {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
        ticket_number: 1,
        ticket_sequence: 'C001',
        status: 'active',
        is_winner: false,
        allocation_type: 'paid',
      },
    },
    {
      id: 't2',
      data: {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
        ticket_number: 2,
        ticket_sequence: 'C002',
        status: 'active',
        is_winner: false,
        allocation_type: 'paid',
      },
    },
  ];

  (tickets || defaultTickets).forEach(({ id, data }) => {
    db.setDocument('ticket', id, data);
  });

  return { userRef, adminRef, competitionRef, otherCompetitionRef, orderRef };
}

function makeRemovalHandler(db, options = {}) {
  return createInvalidateUserCompetitionTicketsHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
    ...options,
  });
}

function removalRequest({ mode = PARTICIPANT_REMOVAL_MODES.INVALIDATE_ONLY, requestId = 'req-removal-001' } = {}) {
  return {
    auth: { uid: ADMIN_UID },
    data: {
      userId: USER_UID,
      competitionId: 'c1',
      reason: 'Administrative participant removal',
      requestId,
      mode,
    },
  };
}

function seedPaymentRequest(db, refs, overrides = {}) {
  db.setDocument(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-pay-001', {
    request_id: 'req-pay-001',
    user_ref: refs.userRef,
    competition_id: refs.competitionRef,
    competition_title: 'Competition One',
    initiated_by: refs.adminRef,
    requested_ticket_quantity: 2,
    unit_price: 10,
    unit_amount_minor: 1000,
    total_amount: 20,
    total_amount_minor: 2000,
    currency: 'GBP',
    payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
    fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FAILED,
    stripe_checkout_session_id: 'cs_pay_001',
    stripe_payment_intent_id: 'pi_pay_001',
    order_id: null,
    issued_ticket_count: 0,
    reason: 'Additional tickets',
    expires_at_millis: NOW + 60 * 60 * 1000,
    stripe_expires_at: Math.floor(NOW / 1000) + 3600,
    fulfillment_attempts: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });
  db.setDocument(
    ADDITIONAL_PAYMENT_LOCKS_COLLECTION,
    `${USER_UID}_c1`,
    {
      request_id: 'req-pay-001',
      user_id: USER_UID,
      competition_id: 'c1',
      expires_at_millis: NOW + 60 * 60 * 1000,
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      created_at: NOW,
      updated_at: NOW,
    }
  );
}

function paidSession() {
  return {
    id: 'cs_pay_001',
    metadata: { additionalPaymentRequestId: 'req-pay-001' },
    status: 'complete',
    payment_status: 'paid',
    payment_intent: 'pi_pay_001',
    amount_total: 2000,
    currency: 'gbp',
    mode: 'payment',
  };
}

function makeStripeForSession(session, { expireImpl, createImpl, retrieveImpl } = {}) {
  const calls = { retrieve: [], expire: [], create: [] };
  const factory = () => ({
    checkout: {
      sessions: {
        create: async (params, options) => {
          calls.create.push({ params, options });
          if (createImpl) return createImpl(params, options);
          return {
            id: 'cs_created',
            url: 'https://stripe.test/cs_created',
            status: 'open',
            payment_status: 'unpaid',
          };
        },
        retrieve: async (id) => {
          calls.retrieve.push(id);
          if (retrieveImpl) return retrieveImpl(id);
          return typeof session === 'function' ? session(id) : session;
        },
        expire: async (id) => {
          calls.expire.push(id);
          if (expireImpl) return expireImpl(id);
          return { id, status: 'expired', payment_status: 'unpaid' };
        },
      },
    },
  });
  return { factory, calls };
}

function makeCreateHandler(db, stripe) {
  return createAdditionalPaymentRequestHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
    stripeFactory: stripe.factory,
    getStripeSecretKey: () => 'sk_test',
    getAppOrigins: () => 'https://app.test',
    now: () => NOW,
  });
}

function additionalPaymentCreateRequest(overrides = {}) {
  return {
    auth: { uid: ADMIN_UID },
    data: {
      userId: USER_UID,
      competitionId: 'c1',
      ticketQuantity: 2,
      reason: 'Additional tickets',
      requestId: 'req-new-additional',
      origin: 'https://app.test',
      ...overrides,
    },
  };
}

function makeUrlHandler(db, stripe) {
  return createGetAdditionalPaymentCheckoutUrlHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAuthenticated: (request) => request.auth.uid,
    HttpsError: MockHttpsError,
    stripeFactory: stripe.factory,
    getStripeSecretKey: () => 'sk_test',
    now: () => NOW,
  });
}

function makeRecoveryHandler(db, stripe = makeStripeForSession(paidSession())) {
  return createRecoverAdditionalPaymentFulfillmentHandler({
    db,
    admin: createMockAdmin(),
    logger: createMockLogger(),
    assertAdmin: makeAssertAdmin(db),
    HttpsError: MockHttpsError,
    stripeFactory: stripe.factory,
    getStripeSecretKey: () => 'sk_test',
  });
}

function recoveryRequest(requestId = 'req-pay-001') {
  return { auth: { uid: ADMIN_UID }, data: { requestId } };
}

function auditEvents(db) {
  return Array.from(db.collectionStore(ADMIN_AUDIT_COLLECTION).values());
}

describe('participant removal modes', () => {
  it('invalidate_only invalidates tickets without restricting future purchases', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await makeRemovalHandler(db)(
      removalRequest({ mode: PARTICIPANT_REMOVAL_MODES.INVALIDATE_ONLY })
    );

    assert.equal(result.complete, true);
    assert.equal(result.restrictedFutureParticipation, false);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');
    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.restricted_participants ?? undefined, undefined);
    assert.equal(db.snapshot('user', USER_UID).data().is_active, true);

    const preflight = await validateCheckoutPreflight(db, {
      uid: USER_UID,
      competitionId: 'c1',
      ticketQuantity: 1,
      nowMillis: NOW,
    });
    assert.equal(preflight.checkoutInput.ticketQuantity, 1);
  });

  it('remove_and_block invalidates tickets, writes restriction and audit, and blocks checkout', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await makeRemovalHandler(db)(
      removalRequest({ mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK })
    );

    assert.equal(result.complete, true);
    assert.equal(result.restrictedFutureParticipation, true);
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't2').data().status, 'invalid');

    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.restricted_participants.length, 1);
    assert.equal(competition.restricted_participants[0].path, `user/${USER_UID}`);
    assert.equal(competition.stock_quantity, 100);
    assert.equal(competition.sold_tickets, 0);
    assert.equal(competition.last_ticket_sequence, 0);
    assert.equal(db.snapshot('ticket', 't1').data().ticket_number, 1);
    assert.equal(db.snapshot('ticket', 't2').data().ticket_number, 2);
    assert.equal(db.collectionStore('order').size, 0);

    const restrictionEvent = auditEvents(db).find(
      (event) => event.action === AUDIT_ACTIONS.PARTICIPANT_RESTRICTED
    );
    assert.ok(restrictionEvent);
    assert.equal(restrictionEvent.actor_uid, ADMIN_UID);
    assert.equal(restrictionEvent.related.user_id, USER_UID);
    assert.equal(restrictionEvent.related.competition_id, 'c1');

    await assert.rejects(
      validateCheckoutPreflight(db, {
        uid: USER_UID,
        competitionId: 'c1',
        ticketQuantity: 1,
        nowMillis: NOW,
      }),
      (error) =>
        error.code === 'failed-precondition' && /blocked from this competition/.test(error.message)
    );

    assert.equal(db.snapshot('user', USER_UID).data().is_active, true);
    assert.equal(db.snapshot('user', USER_UID).data().is_deleted, undefined);
  });

  it('remove_and_block can restrict a participant with no active tickets', async () => {
    const db = new MemoryDB();
    seed(db, { tickets: [] });

    const result = await makeRemovalHandler(db)(
      removalRequest({
        mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
        requestId: 'req-removal-noop',
      })
    );

    assert.equal(result.complete, true);
    assert.equal(result.restrictedFutureParticipation, true);
    const competition = db.snapshot('competition', 'c1').data();
    assert.equal(competition.restricted_participants.length, 1);
  });

  it('restriction is scoped to one competition and does not affect the account', async () => {
    const db = new MemoryDB();
    seed(db);

    await makeRemovalHandler(db)(
      removalRequest({ mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK })
    );

    await assert.rejects(
      validateCheckoutPreflight(db, {
        uid: USER_UID,
        competitionId: 'c1',
        ticketQuantity: 1,
        nowMillis: NOW,
      }),
      (error) => error.code === 'failed-precondition'
    );

    const otherPreflight = await validateCheckoutPreflight(db, {
      uid: USER_UID,
      competitionId: 'c2',
      ticketQuantity: 1,
      nowMillis: NOW,
    });
    assert.equal(otherPreflight.checkoutInput.ticketQuantity, 1);
    assert.equal(db.snapshot('user', USER_UID).data().is_active, true);
  });

  it('blocks the trusted fulfillment transaction, not only preflight', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      restricted_participants: [refs.userRef],
    });

    const orderId = db.collection('order').doc().id;
    const settlement = createVerifiedStripeSettlementContext(
      PAYMENT_SETTLEMENT.STRIPE_PAID,
      {
        orderId,
        amountMinor: 1000,
        currency: 'gbp',
        paymentIntentId: 'pi_blocked',
      }
    );

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: USER_UID,
        competitionId: 'c1',
        ticketQuantity: 1,
        questionAnswer: {},
        freeTicketsToUse: 0,
        referralsToBurn: [],
        orderId,
        paymentSettlement: settlement,
      }),
      /blocked from this competition/
    );

    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(db.snapshot('order', orderId).exists, false);
  });

  it('blocks additional-payment request creation for a restricted participant', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      restricted_participants: [refs.userRef],
    });
    const stripe = makeStripeForSession(paidSession());
    const handler = createAdditionalPaymentRequestHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      assertAdmin: makeAssertAdmin(db),
      HttpsError: MockHttpsError,
      stripeFactory: stripe.factory,
      getStripeSecretKey: () => 'sk_test',
      getAppOrigins: () => 'https://app.test',
      now: () => NOW,
    });

    await assert.rejects(
      handler({
        auth: { uid: ADMIN_UID },
        data: {
          userId: USER_UID,
          competitionId: 'c1',
          ticketQuantity: 2,
          reason: 'Should be blocked',
          requestId: 'req-pay-blocked',
          origin: 'https://app.test',
        },
      }),
      (error) =>
        error.code === 'failed-precondition' && /blocked from this competition/.test(error.message)
    );

    assert.equal(
      db.collectionStore(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION).size,
      0
    );
    assert.equal(stripe.calls.retrieve.length, 0);
  });

  it('replays a completed remove_and_block request after the draw is protected', async () => {
    const db = new MemoryDB();
    seed(db);
    const handler = makeRemovalHandler(db);
    const request = removalRequest({
      mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
      requestId: 'req-removal-replay',
    });

    const first = await handler(request);
    assert.equal(first.complete, true);

    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      status: 'drawing',
    });

    const replay = await handler(request);
    assert.equal(replay.complete, true);
    assert.equal(replay.restrictedFutureParticipation, true);
    assert.equal(
      db.snapshot('competition', 'c1').data().restricted_participants.length,
      1
    );
  });

  it('does not create a checkout link when replaying a request after restriction', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
      stripe_checkout_session_id: '',
      stripe_payment_intent_id: '',
    });
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      restricted_participants: [refs.userRef],
    });
    const stripe = makeStripeForSession(paidSession());
    const handler = createAdditionalPaymentRequestHandler({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      assertAdmin: makeAssertAdmin(db),
      HttpsError: MockHttpsError,
      stripeFactory: stripe.factory,
      getStripeSecretKey: () => 'sk_test',
      getAppOrigins: () => 'https://app.test',
      now: () => NOW,
    });

    await assert.rejects(
      handler({
        auth: { uid: ADMIN_UID },
        data: {
          userId: USER_UID,
          competitionId: 'c1',
          ticketQuantity: 2,
          reason: 'Additional tickets',
          requestId: 'req-pay-001',
          origin: 'https://app.test',
        },
      }),
      (error) =>
        error.code === 'failed-precondition' && /blocked from this competition/.test(error.message)
    );

    assert.equal(stripe.calls.create.length, 0);
    assert.equal(
      db.snapshot(ADDITIONAL_PAYMENT_REQUESTS_COLLECTION, 'req-pay-001').data()
        .stripe_checkout_session_id,
      ''
    );
  });

  it('does not apply a restriction when a winning ticket exists', async () => {
    const db = new MemoryDB();
    const userRef = db.collection('user').doc(USER_UID);
    const competitionRef = db.collection('competition').doc('c1');
    const orderRef = db.collection('order').doc('o1');
    seed(db, {
      tickets: [
        {
          id: 'tWin',
          data: {
            competition_id: competitionRef,
            user_id: userRef,
            order_id: orderRef,
            ticket_number: 1,
            ticket_sequence: 'C001',
            status: 'winner',
            is_winner: true,
            allocation_type: 'paid',
          },
        },
      ],
    });

    await assert.rejects(
      makeRemovalHandler(db)(
        removalRequest({
          mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
          requestId: 'req-removal-winner',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(
      db.snapshot('competition', 'c1').data().restricted_participants ?? undefined,
      undefined
    );
  });

  it('does not apply a restriction after the draw has started', async () => {
    const db = new MemoryDB();
    seed(db, { competition: { status: 'drawing' } });

    await assert.rejects(
      makeRemovalHandler(db)(
        removalRequest({
          mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
          requestId: 'req-removal-draw',
        })
      ),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(
      db.snapshot('competition', 'c1').data().restricted_participants ?? undefined,
      undefined
    );
  });

  it('invalidates tickets committed immediately before the restriction fence', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.beforeTransaction = async () => {
      db.setDocument('ticket', 'tRace', {
        competition_id: refs.competitionRef,
        user_id: refs.userRef,
        order_id: refs.orderRef,
        ticket_number: 3,
        ticket_sequence: 'C003',
        status: 'active',
        is_winner: false,
        allocation_type: 'paid',
      });
    };

    const result = await makeRemovalHandler(db)(
      removalRequest({
        mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
        requestId: 'req-removal-race',
      })
    );

    assert.equal(result.complete, true);
    assert.equal(db.snapshot('ticket', 'tRace').data().status, 'invalid');
    assert.equal(db.snapshot('ticket', 't1').data().status, 'invalid');
  });

  it('expires an outstanding open additional-payment session during restriction', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
      stripe_checkout_session_id: 'cs_pay_001',
      stripe_payment_intent_id: '',
    });
    const stripe = makeStripeForSession({
      id: 'cs_pay_001',
      status: 'open',
      payment_status: 'unpaid',
      amount_total: 2000,
      currency: 'gbp',
      mode: 'payment',
    });

    await makeRemovalHandler(db, {
      stripeFactory: stripe.factory,
      getStripeSecretKey: () => 'sk_test',
    })(
      removalRequest({
        mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
        requestId: 'req-removal-expire',
      })
    );

    assert.deepEqual(stripe.calls.expire, ['cs_pay_001']);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.EXPIRED);
  });

  it('preserves a paid-but-unfulfilled state when a paid session races restriction', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    });
    const stripe = makeStripeForSession(paidSession());

    await makeRemovalHandler(db, {
      stripeFactory: stripe.factory,
      getStripeSecretKey: () => 'sk_test',
    })(
      removalRequest({
        mode: PARTICIPANT_REMOVAL_MODES.REMOVE_AND_BLOCK,
        requestId: 'req-removal-paid',
      })
    );

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(
      request.fulfillment_status,
      ADDITIONAL_PAYMENT_FULFILLMENT.FAILED
    );
    assert.equal(db.collectionStore('order').size, 0);
    assert.equal(db.collectionStore('ticket').size, 2);
  });
});

describe('additional payment recovery', () => {
  it('recovers a verified paid-but-unfulfilled request without charging again', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs);
    const stripe = makeStripeForSession(paidSession());

    const result = await makeRecoveryHandler(db, stripe)(
      recoveryRequest()
    );

    assert.equal(result.outcome, 'fulfilled');
    assert.equal(result.recovered, true);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
    assert.equal(request.issued_ticket_count, 2);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(db.collectionStore('ticket').size, 4);
    assert.equal(stripe.calls.expire.length, 0);
    assert.equal(stripe.calls.create.length, 0);
    assert.equal(stripe.calls.retrieve.length, 1);

    const recoveryEvent = auditEvents(db).find(
      (event) => event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_RECOVERY_ATTEMPTED
    );
    assert.ok(recoveryEvent);
    assert.equal(recoveryEvent.actor_uid, ADMIN_UID);
    assert.equal(recoveryEvent.related.payment_request_id, 'req-pay-001');
  });

  it('rejects a pending + pending request before contacting Stripe', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    });
    const stripe = makeStripeForSession(paidSession());

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(
      request.fulfillment_status,
      ADDITIONAL_PAYMENT_FULFILLMENT.PENDING
    );
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(stripe.calls.retrieve.length, 0);
    const refusal = auditEvents(db).find(
      (event) =>
        event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_RECOVERY_ATTEMPTED &&
        event.after.outcome === 'refused_invalid_state'
    );
    assert.ok(refusal);
  });

  it('rejects a paid + pending request', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PAID,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
    });
    const stripe = makeStripeForSession(paidSession());

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore('ticket').size, 2);
    const refusal = auditEvents(db).find(
      (event) =>
        event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_RECOVERY_ATTEMPTED &&
        event.after.outcome === 'refused_invalid_state'
    );
    assert.ok(refusal);
  });

  it('rejects a pending + failed request', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FAILED,
    });
    const stripe = makeStripeForSession(paidSession());

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore('ticket').size, 2);
    const refusal = auditEvents(db).find(
      (event) =>
        event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_RECOVERY_ATTEMPTED &&
        event.after.outcome === 'refused_invalid_state'
    );
    assert.ok(refusal);
  });

  it('rejects paid + failed without a stored Stripe session', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, { stripe_checkout_session_id: '' });
    const stripe = makeStripeForSession(paidSession());

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(stripe.calls.retrieve.length, 0);
    const refusal = auditEvents(db).find(
      (event) =>
        event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_RECOVERY_ATTEMPTED &&
        event.after.outcome === 'refused_no_session'
    );
    assert.ok(refusal);
  });

  it('rejects a mismatched Stripe session', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs);
    const stripe = makeStripeForSession({
      ...paidSession(),
      id: 'cs_other',
    });

    await assert.rejects(
      makeRecoveryHandler(db, stripe)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(db.collectionStore('ticket').size, 2);
    const refusal = auditEvents(db).find(
      (event) =>
        event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_RECOVERY_ATTEMPTED &&
        event.after.outcome === 'refused_session_mismatch'
    );
    assert.ok(refusal);
  });

  it('rejects an unauthorized caller', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs);
    const stripe = makeStripeForSession(paidSession());

    await assert.rejects(
      makeRecoveryHandler(db, stripe)({
        auth: { uid: USER_UID },
        data: { requestId: 'req-pay-001' },
      }),
      (error) => error.code === 'permission-denied'
    );

    assert.equal(stripe.calls.retrieve.length, 0);
    assert.equal(db.collectionStore('ticket').size, 2);
  });

  it('preserves fail-closed behavior during a protected draw', async () => {
    const db = new MemoryDB();
    const refs = seed(db, { competition: { status: 'drawing' } });
    seedPaymentRequest(db, refs);

    await assert.rejects(
      makeRecoveryHandler(db)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FAILED);
    assert.equal(db.collectionStore('order').size, 0);
    assert.equal(db.collectionStore('ticket').size, 2);
  });

  it('returns an idempotent already-fulfilled result without new tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED,
      issued_ticket_count: 2,
    });

    const result = await makeRecoveryHandler(db)(recoveryRequest());

    assert.equal(result.outcome, 'already_fulfilled');
    assert.equal(result.recovered, false);
    assert.equal(db.collectionStore('ticket').size, 2);
    assert.equal(db.collectionStore('order').size, 0);
    const recoveryEvent = auditEvents(db).find(
      (event) => event.action === AUDIT_ACTIONS.PAYMENT_REQUEST_RECOVERY_ATTEMPTED
    );
    assert.equal(recoveryEvent.after.outcome, 'already_fulfilled');
  });

  it('serializes concurrent recovery attempts without duplicate orders or tickets', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs);
    const handler = makeRecoveryHandler(db);

    const results = await Promise.allSettled([
      handler(recoveryRequest()),
      handler(recoveryRequest()),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === 'fulfilled'
    );
    assert.equal(fulfilled.length, 2);
    assert.equal(db.collectionStore('order').size, 1);
    assert.equal(db.collectionStore('ticket').size, 4);
    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FULFILLED);
  });

  it('keeps the request paid-but-unfulfilled when stock is insufficient', async () => {
    const db = new MemoryDB();
    const refs = seed(db, { competition: { stock_quantity: 1 } });
    seedPaymentRequest(db, refs);

    await assert.rejects(
      makeRecoveryHandler(db)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(request.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FAILED);
    assert.equal(request.fulfillment_attempts, 2);
    assert.equal(db.collectionStore('order').size, 0);
    assert.equal(db.collectionStore('ticket').size, 2);
  });

  it('refuses recovery for a competition-restricted participant', async () => {
    const db = new MemoryDB();
    const refs = seed(db, {
      competition: { restricted_participants: [] },
    });
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      restricted_participants: [refs.userRef],
    });
    seedPaymentRequest(db, refs);

    await assert.rejects(
      makeRecoveryHandler(db)(recoveryRequest()),
      (error) => error.code === 'failed-precondition'
    );

    const request = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(request.fulfillment_status, ADDITIONAL_PAYMENT_FULFILLMENT.FAILED);
    assert.equal(db.collectionStore('order').size, 0);
    assert.equal(db.collectionStore('ticket').size, 2);
  });

  it('preserves original orders and does not create referral or bonus records', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    db.setDocument('order', 'originalOrder', {
      status: 'paid',
      user_ref: refs.userRef,
      competition_id: refs.competitionRef,
      total_amount: 50,
      total_ticket: 5,
    });
    seedPaymentRequest(db, refs);

    await makeRecoveryHandler(db)(recoveryRequest());

    const original = db.snapshot('order', 'originalOrder').data();
    assert.equal(original.total_amount, 50);
    assert.equal(original.total_ticket, 5);
    assert.equal(db.collections.has('referrals'), false);
    assert.equal(db.collections.has('free_ticket_log'), false);
  });
});

describe('enforceAdditionalPaymentRestriction', () => {
  it('returns no_active_request when the participant has no outstanding payment lock', async () => {
    const db = new MemoryDB();
    seed(db);

    const outcome = await enforceAdditionalPaymentRestriction({
      db,
      admin: createMockAdmin(),
      logger: createMockLogger(),
      userId: USER_UID,
      competitionId: 'c1',
      HttpsError: MockHttpsError,
      stripeFactory: makeStripeForSession(paidSession()).factory,
      getStripeSecretKey: () => 'sk_test',
    });

    assert.equal(outcome.handled, false);
    assert.equal(outcome.outcome, 'no_active_request');
  });
});

describe('additional payment session creation against participant restriction', () => {
  function restrictC1(db, refs) {
    db.setDocument('competition', 'c1', {
      ...db.snapshot('competition', 'c1').data(),
      restricted_participants: [refs.userRef],
    });
  }

  it('does not return a URL when restriction commits during session creation', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    const stripe = makeStripeForSession(null, {
      createImpl: async () => {
        restrictC1(db, refs);
        return {
          id: 'cs_race_create',
          url: 'https://stripe.test/cs_race_create',
          status: 'open',
          payment_status: 'unpaid',
        };
      },
    });
    const handler = makeCreateHandler(db, stripe);
    const request = additionalPaymentCreateRequest();

    await assert.rejects(
      handler(request),
      (error) =>
        error.code === 'failed-precondition' &&
        /blocked from this competition/.test(error.message)
    );

    const stored = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-new-additional'
    ).data();
    assert.equal(stored.stripe_checkout_session_id, 'cs_race_create');
    assert.equal(stored.payment_status, ADDITIONAL_PAYMENT_STATUS.EXPIRED);
    assert.deepEqual(stripe.calls.expire, ['cs_race_create']);

    await assert.rejects(
      handler(request),
      (error) => error.code === 'failed-precondition'
    );
    assert.equal(stripe.calls.create.length, 1);
  });

  it('does not return a URL when restriction commits after session persistence', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    const stripe = makeStripeForSession(null);
    const handler = makeCreateHandler(db, stripe);

    const originalApply = db.applyWrites.bind(db);
    let injected = false;
    db.applyWrites = (writes) => {
      originalApply(writes);
      if (
        !injected &&
        writes.some(
          (write) =>
            write.path === 'additional_payment_requests/req-new-additional' &&
            write.data?.stripe_checkout_session_id === 'cs_created'
        )
      ) {
        injected = true;
        restrictC1(db, refs);
      }
    };

    await assert.rejects(
      handler(additionalPaymentCreateRequest()),
      (error) =>
        error.code === 'failed-precondition' &&
        /blocked from this competition/.test(error.message)
    );

    assert.equal(injected, true);
    const stored = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-new-additional'
    ).data();
    assert.equal(stored.stripe_checkout_session_id, 'cs_created');
    assert.equal(stored.payment_status, ADDITIONAL_PAYMENT_STATUS.EXPIRED);
    assert.deepEqual(stripe.calls.expire, ['cs_created']);
  });

  it('does not return a URL when restriction commits during existing-session retrieval', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    seedPaymentRequest(db, refs, {
      payment_status: ADDITIONAL_PAYMENT_STATUS.PENDING,
      fulfillment_status: ADDITIONAL_PAYMENT_FULFILLMENT.PENDING,
      stripe_checkout_session_id: 'cs_open_001',
      stripe_payment_intent_id: '',
    });
    const stripe = makeStripeForSession(null, {
      retrieveImpl: async (id) => {
        restrictC1(db, refs);
        return {
          id,
          url: 'https://stripe.test/cs_open_001',
          status: 'open',
          payment_status: 'unpaid',
        };
      },
    });
    const handler = makeUrlHandler(db, stripe);

    const result = await handler({
      auth: { uid: USER_UID },
      data: { requestId: 'req-pay-001' },
    });

    assert.equal(result.can_pay, false);
    assert.equal(result.reason, 'restricted');
    assert.equal(result.url, undefined);
    assert.deepEqual(stripe.calls.expire, ['cs_open_001']);
    const stored = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-pay-001'
    ).data();
    assert.equal(stored.payment_status, ADDITIONAL_PAYMENT_STATUS.EXPIRED);
  });

  it('does not downgrade a pending request when session expiration fails', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    const stripe = makeStripeForSession(null, {
      createImpl: async () => {
        restrictC1(db, refs);
        return {
          id: 'cs_expire_fail',
          url: 'https://stripe.test/cs_expire_fail',
          status: 'open',
          payment_status: 'unpaid',
        };
      },
      expireImpl: async () => {
        throw new Error('expire unavailable');
      },
    });

    await assert.rejects(
      makeCreateHandler(db, stripe)(additionalPaymentCreateRequest()),
      (error) => error.code === 'failed-precondition'
    );

    assert.deepEqual(stripe.calls.expire, ['cs_expire_fail']);
    const stored = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-new-additional'
    ).data();
    assert.equal(stored.payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(stored.stripe_checkout_session_id, 'cs_expire_fail');
  });

  it('preserves a paid session as paid-but-unfulfilled when restriction is detected', async () => {
    const db = new MemoryDB();
    const refs = seed(db);
    const stripe = makeStripeForSession(null, {
      createImpl: async () => {
        restrictC1(db, refs);
        return {
          id: 'cs_paid_race',
          url: 'https://stripe.test/cs_paid_race',
          status: 'complete',
          payment_status: 'paid',
          payment_intent: 'pi_paid_race',
          amount_total: 2000,
          currency: 'gbp',
          mode: 'payment',
          metadata: { additionalPaymentRequestId: 'req-new-additional' },
        };
      },
    });

    await assert.rejects(
      makeCreateHandler(db, stripe)(additionalPaymentCreateRequest()),
      (error) => error.code === 'failed-precondition'
    );

    assert.equal(stripe.calls.expire.length, 0);
    const stored = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-new-additional'
    ).data();
    assert.equal(stored.payment_status, ADDITIONAL_PAYMENT_STATUS.PAID);
    assert.equal(
      stored.fulfillment_status,
      ADDITIONAL_PAYMENT_FULFILLMENT.FAILED
    );
    assert.equal(stored.stripe_payment_intent_id, 'pi_paid_race');
    assert.equal(db.collectionStore('order').size, 0);
    assert.equal(db.collectionStore('ticket').size, 2);
  });

  it('keeps unrestricted session creation unchanged', async () => {
    const db = new MemoryDB();
    seed(db);
    const stripe = makeStripeForSession(null);

    const result = await makeCreateHandler(db, stripe)(
      additionalPaymentCreateRequest()
    );

    assert.equal(result.sessionUrl, 'https://stripe.test/cs_created');
    assert.equal(stripe.calls.expire.length, 0);
    const stored = db.snapshot(
      ADDITIONAL_PAYMENT_REQUESTS_COLLECTION,
      'req-new-additional'
    ).data();
    assert.equal(stored.payment_status, ADDITIONAL_PAYMENT_STATUS.PENDING);
    assert.equal(stored.stripe_checkout_session_id, 'cs_created');
  });
});
