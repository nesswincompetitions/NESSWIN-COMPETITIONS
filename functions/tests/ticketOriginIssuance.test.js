import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryDB,
  createMockAdmin,
} from './helpers/memoryFirestore.js';
import {
  DirectPaymentRequiredError,
  runOrderTransaction,
} from '../services/orderTransactionService.js';
import { evaluateCheckoutSettlement } from '../services/stripeSettlementService.js';
import {
  PAYMENT_SETTLEMENT,
  TICKET_ORIGIN,
  countTicketOrigins,
} from '../services/ticketOrigin.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);

function seed(db, referralTypes = [], competitionOverrides = {}) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', 'u1', {
    display_name: 'Test User',
    free_tickets: referralTypes.length,
    total_free_tickets: referralTypes.length,
  });
  db.setDocument('competition', 'c1', {
    title: 'Origin Competition',
    status: 'active',
    draw_date: { toDate: () => FUTURE_DRAW },
    ticket_price: 10,
    total_tickets: 1000,
    stock_quantity: 1000,
    sold_tickets: 0,
    last_ticket_sequence: 0,
    participants: [],
    ...competitionOverrides,
  });
  db.setDocument('skill_attempts', 'u1_c1', { passed: true });
  db.setDocument('order', 'o1', {
    status: 'pending',
    user_ref: userRef,
    competition_id: competitionRef,
  });

  const referrals = referralTypes.map((rewardType, index) => {
    const id = `r${index + 1}`;
    db.setDocument('referrals', id, {
      referrer_id: userRef,
      reward_type: rewardType,
      reward_value: 1,
      reward_issued: false,
      created_at: new Date(),
    });
    return { id };
  });

  return { userRef, competitionRef, referrals };
}

function stripeSettlementContext(totalAmount, paymentStatus = 'paid') {
  const decision = evaluateCheckoutSettlement({
    eventType: 'checkout.session.completed',
    session: {
      id: 'cs_1',
      metadata: { orderId: 'o1' },
      amount_total: Math.round(totalAmount * 100),
      currency: 'gbp',
      payment_status: paymentStatus,
      payment_intent: paymentStatus === 'paid' ? 'pi_1' : null,
      mode: 'payment',
    },
    orderData: {
      status: 'pending',
      stripe_checkout_session_id: 'cs_1',
      total_amount: totalAmount,
      currency: 'GBP',
    },
  });
  return decision.settlementContext;
}

function ticketsFor(db, result) {
  return result.tickets.map((ticket) => ({
    ...ticket,
    data: db.snapshot('ticket', ticket.ticketId).data(),
  }));
}

describe('ticket origin issuance', () => {
  it('assigns paid origin to a paid-only issuance', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 5,
      questionAnswer: {},
      freeTicketsToUse: 0,
      referralsToBurn: [],
      orderId: 'o1',
      paymentSettlement: stripeSettlementContext(50),
    });

    const tickets = ticketsFor(db, result);
    assert.equal(tickets.length, 5);
    assert.deepEqual(
      tickets.map((ticket) => ticket.data.allocation_type),
      Array(5).fill(TICKET_ORIGIN.PAID)
    );
  });

  it('classifies paid, pack bonus, referral credit, and referral-use bonus tickets', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, Array(10).fill('referral'));

    const result = await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 15,
      questionAnswer: {},
      freeTicketsToUse: 10,
      referralsToBurn: referrals,
      orderId: 'o1',
      paymentSettlement: stripeSettlementContext(135),
    });

    const tickets = ticketsFor(db, result);
    assert.equal(tickets.length, 27);
    assert.deepEqual(countTicketOrigins(tickets.map((ticket) => ticket.data.allocation_type)), {
      paid: 15,
      pack_bonus: 1,
      referral_credit: 10,
      referral_use_bonus: 1,
    });

    const order = db.snapshot('order', result.orderId).data();
    assert.equal(order.total_ticket, 27);
    assert.equal(order.paid_ticket, 15);
    assert.equal(order.free_ticket, 2);
    assert.equal(order.free_used, 10);
  });

  it('distinguishes admin bonus credits from organic referral credits', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, ['admin_bonus', 'free_ticket']);

    const result = await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 0,
      questionAnswer: {},
      freeTicketsToUse: 2,
      referralsToBurn: referrals,
    });

    const tickets = ticketsFor(db, result);
    assert.deepEqual(
      tickets.map((ticket) => ticket.data.allocation_type),
      [TICKET_ORIGIN.ADMIN_BONUS, TICKET_ORIGIN.REFERRAL_CREDIT]
    );
  });

  it('classifies pack bonus tickets separately when no referral credits are used', async () => {
    const db = new MemoryDB();
    seed(db);

    const result = await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 10,
      questionAnswer: {},
      freeTicketsToUse: 0,
      referralsToBurn: [],
      orderId: 'o1',
      paymentSettlement: stripeSettlementContext(100),
    });

    const tickets = ticketsFor(db, result);
    assert.deepEqual(countTicketOrigins(tickets.map((ticket) => ticket.data.allocation_type)), {
      paid: 10,
      pack_bonus: 1,
    });
  });

  it('rejects positive-total direct fulfillment without mutating any records', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, ['referral']);
    const beforeOrder = db.snapshot('order', 'o1').data();
    const beforeUser = db.snapshot('user', 'u1').data();
    const beforeCompetition = db.snapshot('competition', 'c1').data();
    const beforeReferral = db.snapshot('referrals', 'r1').data();

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 5,
        questionAnswer: {},
        freeTicketsToUse: 1,
        referralsToBurn: [referrals[0]],
        orderId: 'o1',
      }),
      (error) =>
        error instanceof DirectPaymentRequiredError &&
        /Stripe Checkout/.test(error.message)
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('free_ticket_log').size, 0);
    assert.equal(db.collectionStore('ticket_adjustments').size, 0);
    assert.deepEqual(db.snapshot('order', 'o1').data(), beforeOrder);
    assert.deepEqual(db.snapshot('user', 'u1').data(), beforeUser);
    assert.deepEqual(db.snapshot('competition', 'c1').data(), beforeCompetition);
    assert.deepEqual(db.snapshot('referrals', 'r1').data(), beforeReferral);
  });

  it('rejects zero-total direct fulfillment against a positive pending Stripe order', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, ['referral']);
    const userRef = db.collection('user').doc('u1');
    const competitionRef = db.collection('competition').doc('c1');
    db.setDocument('order', 'o1', {
      status: 'pending',
      user_ref: userRef,
      competition_id: competitionRef,
      total_amount: 50,
      stripe_checkout_session_id: 'cs_1',
    });
    const beforeOrder = db.snapshot('order', 'o1').data();
    const beforeReferral = db.snapshot('referrals', 'r1').data();

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 1,
        referralsToBurn: [referrals[0]],
        orderId: 'o1',
      }),
      (error) =>
        error instanceof DirectPaymentRequiredError &&
        /Stripe Checkout/.test(error.message)
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collectionStore('free_ticket_log').size, 0);
    assert.deepEqual(db.snapshot('order', 'o1').data(), beforeOrder);
    assert.deepEqual(db.snapshot('referrals', 'r1').data(), beforeReferral);
  });

  it('does not issue tickets for an unsupported referral reward type', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, ['other']);

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 1,
        referralsToBurn: referrals,
      }),
      /unsupported reward_type/
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
  });

  it('rejects Stripe settlement strings that were not issued by verified settlement logic', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 5,
        questionAnswer: {},
        freeTicketsToUse: 0,
        referralsToBurn: [],
        paymentSettlement: PAYMENT_SETTLEMENT.STRIPE_PAID,
      }),
      /Invalid payment settlement context/
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
  });

  it('rejects an arbitrary settlement context instead of assigning paid provenance', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 5,
        questionAnswer: {},
        freeTicketsToUse: 0,
        referralsToBurn: [],
        paymentSettlement: 'arbitrary-string',
      }),
      /Invalid payment settlement context/
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.snapshot('order', 'o1').data().status, 'pending');
  });

  it('serializes duplicate fulfillment without issuing duplicate tickets', async () => {
    const db = new MemoryDB();
    seed(db);
    const request = {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 5,
      questionAnswer: {},
      freeTicketsToUse: 0,
      referralsToBurn: [],
      orderId: 'o1',
      paymentSettlement: stripeSettlementContext(50),
    };

    const results = await Promise.allSettled([
      runOrderTransaction(db, createMockAdmin(), request),
      runOrderTransaction(db, createMockAdmin(), request),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(db.collectionStore('ticket').size, 5);
    assert.equal(db.snapshot('order', 'o1').data().status, 'paid');
  });

  it('rejects a verified settlement context bound to a different amount or order', async () => {
    const db = new MemoryDB();
    seed(db);

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 6,
        questionAnswer: {},
        freeTicketsToUse: 0,
        referralsToBurn: [],
        orderId: 'o1',
        paymentSettlement: stripeSettlementContext(50),
      }),
      /Settlement context does not match/
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.snapshot('order', 'o1').data().status, 'pending');

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 5,
        questionAnswer: {},
        freeTicketsToUse: 0,
        referralsToBurn: [],
        orderId: 'o1',
        paymentSettlement: { type: PAYMENT_SETTLEMENT.STRIPE_PAID },
      }),
      /Invalid payment settlement context/
    );
    assert.equal(db.collectionStore('ticket').size, 0);
  });

  it('labels zero-total direct fulfillment as zero_payment', async () => {
    const db = new MemoryDB();
    seed(db, [], { ticket_price: 0 });

    const result = await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 5,
      questionAnswer: {},
      freeTicketsToUse: 0,
      referralsToBurn: [],
    });

    const tickets = ticketsFor(db, result);
    assert.deepEqual(
      tickets.map((ticket) => ticket.data.allocation_type),
      Array(5).fill(TICKET_ORIGIN.ZERO_PAYMENT)
    );
    const order = db.snapshot('order', result.orderId).data();
    assert.equal(order.stripe_status, 'free');
    assert.equal(order.total_amount, 0);
  });

  it('allows zero-total direct fulfillment on an existing zero-amount pending order', async () => {
    const db = new MemoryDB();
    seed(db, [], { ticket_price: 0 });
    const userRef = db.collection('user').doc('u1');
    const competitionRef = db.collection('competition').doc('c1');
    db.setDocument('order', 'o1', {
      status: 'pending',
      user_ref: userRef,
      competition_id: competitionRef,
      total_amount: 0,
    });

    const result = await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 5,
      questionAnswer: {},
      freeTicketsToUse: 0,
      referralsToBurn: [],
      orderId: 'o1',
    });

    const tickets = ticketsFor(db, result);
    assert.deepEqual(
      tickets.map((ticket) => ticket.data.allocation_type),
      Array(5).fill(TICKET_ORIGIN.ZERO_PAYMENT)
    );
    const order = db.snapshot('order', 'o1').data();
    assert.equal(order.status, 'paid');
    assert.equal(order.stripe_status, 'free');
    assert.equal(order.total_amount, 0);
  });
});
