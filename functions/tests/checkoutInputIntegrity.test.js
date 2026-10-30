import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDB, createMockAdmin } from './helpers/memoryFirestore.js';
import {
  CheckoutValidationError,
  MAX_CHECKOUT_REFERRAL_TICKETS,
  runOrderTransaction,
  validateCheckoutInputs,
} from '../services/orderTransactionService.js';
import { evaluateCheckoutSettlement } from '../services/stripeSettlementService.js';
import { TICKET_ORIGIN, countTicketOrigins } from '../services/ticketOrigin.js';

const FUTURE_DRAW = new Date(Date.now() + 24 * 60 * 60 * 1000);

function seed(
  db,
  {
    freeTickets = 0,
    referralTypes = [],
    ticketPrice = 10,
    totalTickets = 100,
    stockQuantity = 100,
    soldTickets = 0,
    lastTicketSequence = 0,
  } = {}
) {
  const userRef = db.collection('user').doc('u1');
  const competitionRef = db.collection('competition').doc('c1');

  db.setDocument('user', 'u1', {
    display_name: 'Test User',
    free_tickets: freeTickets,
    total_free_tickets: freeTickets,
  });
  db.setDocument('competition', 'c1', {
    title: 'Checkout Integrity Competition',
    status: 'active',
    draw_date: { toDate: () => FUTURE_DRAW },
    ticket_price: ticketPrice,
    total_tickets: totalTickets,
    stock_quantity: stockQuantity,
    sold_tickets: soldTickets,
    last_ticket_sequence: lastTicketSequence,
    participants: [],
  });
  db.setDocument('skill_attempts', 'u1_c1', { passed: true });

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

function stripeSettlementContext({ orderId = 'o1', totalAmount = 50 } = {}) {
  const decision = evaluateCheckoutSettlement({
    eventType: 'checkout.session.completed',
    session: {
      id: 'cs_1',
      metadata: { orderId },
      amount_total: Math.round(totalAmount * 100),
      currency: 'gbp',
      payment_status: 'paid',
      payment_intent: 'pi_1',
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

function referralIds(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `oversized-${index + 1}` }));
}

describe('checkout input validation', () => {
  it('rejects invalid free-ticket values', () => {
    for (const value of [-1, 1.5, '1', null, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      assert.throws(
        () =>
          validateCheckoutInputs({
            ticketQuantity: 1,
            freeTicketsToUse: value,
            referralsToBurn: [{ id: 'r1' }],
          }),
        CheckoutValidationError
      );
    }
  });

  it('rejects non-array referral input when provided', () => {
    for (const value of [null, {}, 'r1', 5]) {
      assert.throws(
        () =>
          validateCheckoutInputs({
            ticketQuantity: 1,
            freeTicketsToUse: 0,
            referralsToBurn: value,
          }),
        CheckoutValidationError
      );
    }
  });

  it('rejects malformed and empty referral ids', () => {
    for (const referral of [null, 'r1', {}, { id: '' }, { id: '   ' }, { id: 'a/b' }, { id: 1 }]) {
      assert.throws(
        () =>
          validateCheckoutInputs({
            ticketQuantity: 0,
            freeTicketsToUse: 1,
            referralsToBurn: [referral],
          }),
        CheckoutValidationError
      );
    }
  });

  it('rejects duplicate referral ids after trimming', () => {
    assert.throws(
      () =>
        validateCheckoutInputs({
          ticketQuantity: 0,
          freeTicketsToUse: 2,
          referralsToBurn: [{ id: 'r1' }, { id: ' r1 ' }],
        }),
      (error) =>
        error instanceof CheckoutValidationError && /duplicate referral ids/.test(error.message)
    );
  });

  it('rejects oversized arrays and excessive paid or free-ticket requests', () => {
    assert.throws(
      () =>
        validateCheckoutInputs({
          ticketQuantity: 101,
          freeTicketsToUse: 0,
          referralsToBurn: [],
        }),
      CheckoutValidationError
    );

    assert.throws(
      () =>
        validateCheckoutInputs({
          ticketQuantity: 0,
          freeTicketsToUse: 1,
          referralsToBurn: referralIds(MAX_CHECKOUT_REFERRAL_TICKETS + 1),
        }),
      CheckoutValidationError
    );

    assert.throws(
      () =>
        validateCheckoutInputs({
          ticketQuantity: 0,
          freeTicketsToUse: MAX_CHECKOUT_REFERRAL_TICKETS + 1,
          referralsToBurn: referralIds(MAX_CHECKOUT_REFERRAL_TICKETS + 1),
        }),
      CheckoutValidationError
    );
  });

  it('rejects mismatched free-ticket and referral counts', () => {
    assert.throws(
      () =>
        validateCheckoutInputs({
          ticketQuantity: 0,
          freeTicketsToUse: 2,
          referralsToBurn: [{ id: 'r1' }],
        }),
      (error) =>
        error instanceof CheckoutValidationError && /must match/.test(error.message)
    );
  });

  it('accepts bounded valid inputs at the maximum referral limit', () => {
    const result = validateCheckoutInputs({
      ticketQuantity: 100,
      freeTicketsToUse: MAX_CHECKOUT_REFERRAL_TICKETS,
      referralsToBurn: referralIds(MAX_CHECKOUT_REFERRAL_TICKETS),
    });

    assert.equal(result.ticketQuantity, 100);
    assert.equal(result.freeTicketsToUse, MAX_CHECKOUT_REFERRAL_TICKETS);
    assert.equal(result.referralIds.length, MAX_CHECKOUT_REFERRAL_TICKETS);
  });

  it('rejects oversized input before allocating ticket documents', async () => {
    const db = new MemoryDB();
    seed(db, { freeTickets: 101 });
    let ticketCollectionCalls = 0;
    const originalCollection = db.collection.bind(db);
    db.collection = (name) => {
      if (name === 'ticket') ticketCollectionCalls += 1;
      return originalCollection(name);
    };

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 101,
        referralsToBurn: referralIds(101),
      }),
      CheckoutValidationError
    );

    assert.equal(ticketCollectionCalls, 0);
    assert.equal(db.collectionStore('ticket').size, 0);
  });
});

describe('referral balance integrity', () => {
  it('consumes referral credits when the stored balance is sufficient', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, {
      freeTickets: 2,
      referralTypes: ['referral', 'referral'],
    });

    const result = await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 0,
      questionAnswer: {},
      freeTicketsToUse: 2,
      referralsToBurn: referrals,
    });

    assert.equal(result.tickets.length, 2);
    assert.deepEqual(
      countTicketOrigins(
        result.tickets.map((ticket) =>
          db.snapshot('ticket', ticket.ticketId).data().allocation_type
        )
      ),
      { [TICKET_ORIGIN.REFERRAL_CREDIT]: 2 }
    );
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 0);
    assert.equal(db.snapshot('order', result.orderId).data().free_used, 2);
    for (const referral of referrals) {
      assert.equal(db.snapshot('referrals', referral.id).data().reward_issued, true);
    }
  });

  it('rejects insufficient balance without mutating balance, referrals, or tickets', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, {
      freeTickets: 1,
      referralTypes: ['referral', 'referral'],
    });
    const beforeReferrals = referrals.map((referral) => ({
      id: referral.id,
      data: db.snapshot('referrals', referral.id).data(),
    }));

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 2,
        referralsToBurn: referrals,
      }),
      (error) =>
        error instanceof CheckoutValidationError &&
        error.code === 'failed-precondition' &&
        /Insufficient free-ticket balance/.test(error.message)
    );

    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 1);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.collections.has('order'), false);
    for (const { id, data } of beforeReferrals) {
      assert.deepEqual(db.snapshot('referrals', id).data(), data);
    }
  });

  it('rejects malformed stored balances without repair or mutation', async () => {
    for (const balance of [-1, 1.5, '1', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const db = new MemoryDB();
      const { referrals } = seed(db, {
        freeTickets: balance,
        referralTypes: ['referral'],
      });

      await assert.rejects(
        runOrderTransaction(db, createMockAdmin(), {
          uid: 'u1',
          competitionId: 'c1',
          ticketQuantity: 0,
          questionAnswer: {},
          freeTicketsToUse: 1,
          referralsToBurn: referrals,
        }),
        (error) =>
          error instanceof CheckoutValidationError &&
          error.code === 'failed-precondition' &&
          /stored free-ticket balance is invalid/.test(error.message)
      );

      assert.equal(db.collectionStore('ticket').size, 0);
      assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, false);
    }
  });

  it('rejects a missing stored balance without repair or mutation', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, {
      freeTickets: 1,
      referralTypes: ['referral'],
    });
    db.setDocument('user', 'u1', { display_name: 'Test User' });

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 1,
        referralsToBurn: referrals,
      }),
      (error) =>
        error instanceof CheckoutValidationError &&
        error.code === 'failed-precondition' &&
        /stored free-ticket balance is invalid/.test(error.message)
    );

    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, false);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, undefined);
  });

  it('serializes concurrent checkouts against the same balance', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, {
      freeTickets: 1,
      referralTypes: ['referral', 'referral'],
    });

    const request = (referral) =>
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 1,
        referralsToBurn: [referral],
      });

    const results = await Promise.allSettled([request(referrals[0]), request(referrals[1])]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 0);
    assert.equal(db.collectionStore('ticket').size, 1);
    assert.equal(
      Array.from(db.collectionStore('referrals').values()).filter(
        (referral) => referral.reward_issued === true
      ).length,
      1
    );
  });
});

describe('referral integrity', () => {
  it('rejects duplicate referrals before any write', async () => {
    const db = new MemoryDB();
    seed(db, { freeTickets: 2, referralTypes: ['referral', 'referral'] });

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 2,
        referralsToBurn: [{ id: 'r1' }, { id: 'r1' }],
      }),
      (error) =>
        error instanceof CheckoutValidationError && /duplicate referral ids/.test(error.message)
    );

    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 2);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.snapshot('referrals', 'r1').data().reward_issued, false);
  });

  it('does not allow one referral credit to be consumed twice', async () => {
    const db = new MemoryDB();
    const { referrals } = seed(db, {
      freeTickets: 2,
      referralTypes: ['referral'],
    });

    await runOrderTransaction(db, createMockAdmin(), {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 0,
      questionAnswer: {},
      freeTicketsToUse: 1,
      referralsToBurn: referrals,
    });

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 0,
        questionAnswer: {},
        freeTicketsToUse: 1,
        referralsToBurn: referrals,
      }),
      /already redeemed/
    );

    assert.equal(db.collectionStore('ticket').size, 1);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 1);
  });

  it('keeps used, revoked, and malformed referrals rejected', async () => {
    const states = [
      { reward_issued: true },
      { reward_revoked: true },
      { reward_issued: 'no' },
    ];

    for (const override of states) {
      const db = new MemoryDB();
      const { referrals } = seed(db, {
        freeTickets: 1,
        referralTypes: ['referral'],
      });
      const userRef = db.collection('user').doc('u1');
      db.setDocument('referrals', 'r1', {
        referrer_id: userRef,
        reward_type: 'referral',
        reward_value: 1,
        reward_issued: false,
        created_at: new Date(),
        ...override,
      });

      await assert.rejects(
        runOrderTransaction(db, createMockAdmin(), {
          uid: 'u1',
          competitionId: 'c1',
          ticketQuantity: 0,
          questionAnswer: {},
          freeTicketsToUse: 1,
          referralsToBurn: referrals,
        }),
        /redeemed|revoked|malformed/
      );

      assert.equal(db.collectionStore('ticket').size, 0);
      assert.equal(db.snapshot('user', 'u1').data().free_tickets, 1);
    }
  });
});

describe('webhook persisted-input safety', () => {
  it('rejects malformed persisted checkout inputs before fulfillment writes', async () => {
    const db = new MemoryDB();
    const { userRef, competitionRef, referrals } = seed(db, {
      freeTickets: 2,
      referralTypes: ['referral', 'referral'],
    });
    db.setDocument('order', 'o1', {
      status: 'pending',
      user_ref: userRef,
      competition_id: competitionRef,
      total_amount: 50,
      stripe_checkout_session_id: 'cs_1',
      ticket_quantity: 5,
      free_tickets_to_use: 2,
      referrals_to_burn: [{ id: referrals[0].id }],
    });
    const beforeOrder = db.snapshot('order', 'o1').data();

    await assert.rejects(
      runOrderTransaction(db, createMockAdmin(), {
        uid: 'u1',
        competitionId: 'c1',
        ticketQuantity: 5,
        questionAnswer: {},
        freeTicketsToUse: 2,
        referralsToBurn: [{ id: referrals[0].id }],
        orderId: 'o1',
        paymentSettlement: stripeSettlementContext({ totalAmount: 50 }),
      }),
      CheckoutValidationError
    );

    assert.deepEqual(db.snapshot('order', 'o1').data(), beforeOrder);
    assert.equal(db.collectionStore('ticket').size, 0);
    assert.equal(db.snapshot('referrals', referrals[0].id).data().reward_issued, false);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 2);
  });

  it('does not consume referral credits or issue tickets twice on duplicate webhook delivery', async () => {
    const db = new MemoryDB();
    const { userRef, competitionRef, referrals } = seed(db, {
      freeTickets: 1,
      referralTypes: ['referral'],
    });
    db.setDocument('order', 'o1', {
      status: 'pending',
      user_ref: userRef,
      competition_id: competitionRef,
      total_amount: 50,
      stripe_checkout_session_id: 'cs_1',
      ticket_quantity: 5,
      free_tickets_to_use: 1,
      referrals_to_burn: [{ id: referrals[0].id }],
    });
    const request = {
      uid: 'u1',
      competitionId: 'c1',
      ticketQuantity: 5,
      questionAnswer: {},
      freeTicketsToUse: 1,
      referralsToBurn: [{ id: referrals[0].id }],
      orderId: 'o1',
      paymentSettlement: stripeSettlementContext({ totalAmount: 50 }),
    };

    const results = await Promise.allSettled([
      runOrderTransaction(db, createMockAdmin(), request),
      runOrderTransaction(db, createMockAdmin(), request),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(db.collectionStore('ticket').size, 6);
    assert.equal(db.snapshot('referrals', referrals[0].id).data().reward_issued, true);
    assert.equal(db.snapshot('user', 'u1').data().free_tickets, 0);
    assert.deepEqual(
      countTicketOrigins(
        Array.from(db.collectionStore('ticket').values()).map(
          (ticket) => ticket.allocation_type
        )
      ),
      {
        [TICKET_ORIGIN.PAID]: 5,
        [TICKET_ORIGIN.REFERRAL_CREDIT]: 1,
      }
    );
  });
});
