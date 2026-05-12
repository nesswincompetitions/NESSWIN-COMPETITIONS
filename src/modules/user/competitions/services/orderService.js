import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  increment,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { createAppNotification } from '@/shared/services/notificationService';

// ─── Pricing Helper (mirrors backend orderPricingService) ─────────────────────

/**
 * Returns discount rate, free tickets, and pack type for a given quantity.
 * Mirrors the backend `getOrderPricing` function exactly.
 * @param {number} ticketQuantity
 */
function getOrderPricing(ticketQuantity) {
  if (ticketQuantity === 15) return { discount: 0.1, freeTickets: 1, packType: 'Pack Prestige' };
  if (ticketQuantity === 20) return { discount: 0.15, freeTickets: 2, packType: 'Pack Elite' };
  if (ticketQuantity === 25) return { discount: 0.2, freeTickets: 2, packType: 'Pack Gold' };
  if (ticketQuantity === 50) return { discount: 0.25, freeTickets: 5, packType: 'Pack Diamond' };
  return { discount: 0, freeTickets: Math.floor(ticketQuantity / 10), packType: 'Manual' };
}

// ─── MODULE 2: Checkout Transaction ──────────────────────────────────────────

/**
 * Processes a ticket order atomically using runTransaction.
 * Guarantees: no duplicate ticket numbers, no partial writes, no overselling.
 *
 * ALL reads happen before ALL writes (Firebase SDK requirement).
 *
 * @param {Object} params
 * @param {string} params.competitionId
 * @param {string} params.competitionTitle  - Used for prefix generation
 * @param {number} params.ticketQuantity    - Tickets the user wants to buy
 * @param {string} params.questionId        - The question they answered
 * @param {Object} params.questionAnswer    - The full question_answer Map to store on the order
 * @param {Object} params.currentUser       - Firebase Auth user
 * @param {number} [params.freeTicketsToUse] - How many free_tickets from the wallet to apply
 *
 * @returns {Promise<{ orderId: string, tickets: Array, totalAmount: number, packType: string, freeTickets: number }>}
 */
export const processOrder = async ({
  competitionId,
  competitionTitle,
  ticketQuantity,
  questionId,
  questionAnswer,
  currentUser,
  freeTicketsToUse = 0,
  referralsToBurn = [],
}) => {
  const uid = currentUser.uid;

  // ── Input validation ───────────────────────────────────────────────────────
  const qty = Number(ticketQuantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive integer.');
  }
  if (qty > 100) {
    throw new Error('Maximum 100 tickets per order.');
  }
  if (!competitionId || !questionId) {
    throw new Error('competitionId and questionId are required.');
  }

  // ── Pre-defined refs (created outside transaction) ─────────────────────────
  const userRef = doc(db, 'user', uid);
  const competitionRef = doc(db, 'competition', competitionId);
  const orderRef = doc(collection(db, 'order'));                        // auto-id

  // ── Pricing math (pure function — no I/O) ──────────────────────────────────
  const { discount, freeTickets: packBonusTickets, packType } = getOrderPricing(qty);

  // freeTicketsToUse is validated inside the transaction against the DB balance
  const clampedReferralTickets = Math.max(0, Math.floor(freeTicketsToUse));
  const totalTicketsToGenerate = qty + packBonusTickets + clampedReferralTickets;

  // ── Prepare ticket refs ahead of the transaction ───────────────────────
  const ticketRefs = Array.from({ length: totalTicketsToGenerate }, () =>
    doc(collection(db, 'ticket'))
  );

  // ── runTransaction ─────────────────────────────────────────────────────────
  const result = await runTransaction(db, async (transaction) => {

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 1: READS — all reads MUST precede all writes
    // ════════════════════════════════════════════════════════════════════════

    const compSnap = await transaction.get(competitionRef);

    if (!compSnap.exists()) {
      throw new Error('Competition not found.');
    }

    const compData = compSnap.data();

    if (compData.status !== 'active') {
      throw new Error('This competition is no longer active.');
    }

    // Safety check: Reject order if current time has passed the draw date
    // even if the status is still "active"
    const now = new Date();
    if (compData.draw_date && compData.draw_date.toDate() <= now) {
      throw new Error('This competition has already closed for entries.');
    }

    // Read user doc to verify user exists and to update stats later
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User not found.');

    // Fetch referral docs to ensure they are valid and not yet issued
    const referralRefs = referralsToBurn.map(refData => doc(db, 'referrals', refData.id));
    const referralSnaps = await Promise.all(referralRefs.map(ref => transaction.get(ref)));
    
    let validReferralsCount = 0;
    referralSnaps.forEach((snap, idx) => {
      if (!snap.exists()) throw new Error(`Referral ${referralsToBurn[idx].id} not found.`);
      if (snap.data().reward_issued) throw new Error(`Referral ${referralsToBurn[idx].id} was already used.`);
      if (snap.data().referrer_id?.path !== userRef.path) throw new Error(`Referral ${referralsToBurn[idx].id} does not belong to you.`);
      validReferralsCount++;
    });

    if (clampedReferralTickets > 0 && validReferralsCount < clampedReferralTickets) {
      throw new Error(`Not enough valid referral tickets found.`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2: MATH & VALIDATION (local, no I/O)
    // ════════════════════════════════════════════════════════════════════════

    const currentStock = Number(compData.stock_quantity || 0);
    if (currentStock < totalTicketsToGenerate) {
      throw new Error(
        `Out of stock. Only ${currentStock} ticket${currentStock === 1 ? '' : 's'} remaining.`
      );
    }

    // Ticket sequence math
    const lastSeq = Number(compData.last_ticket_sequence) || 0;
    const startSeq = lastSeq + 1;
    const endSeq = lastSeq + totalTicketsToGenerate;

    // Competition prefix from title ("Mega Diamond Draw" → "MDD")
    const title = competitionTitle || compData.title || 'TKT';
    const prefix = title
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w[0].toUpperCase())
      .join('') || 'TKT';

    // Pricing
    const ticketPrice = Number(compData.ticket_price || 0);
    const subtotal = qty * ticketPrice;
    const discountAmount = subtotal * discount;
    const totalAmount = subtotal - discountAmount;

    const newStock = currentStock - totalTicketsToGenerate;
    const newStatus = newStock === 0 ? 'sold_out' : 'active';

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 3: WRITES (all atomic — any failure rolls everything back)
    // ════════════════════════════════════════════════════════════════════════

    // Write 1 — Update competition
    transaction.update(competitionRef, {
      stock_quantity: increment(-totalTicketsToGenerate),
      sold_tickets: increment(totalTicketsToGenerate),
      last_ticket_sequence: endSeq,
      status: newStatus,
      participants: arrayUnion(userRef),
      updated_at: serverTimestamp(),
    });

    // Write 2 — Create order document
    transaction.set(orderRef, {
      competition_id: competitionRef,
      user_ref: userRef,
      total_ticket: qty,
      free_ticket: packBonusTickets + clampedReferralTickets,
      pack_type: packType,
      discount_percent: Math.round(discount * 100),
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      currency: 'GBP',
      status: 'paid',
      is_winner: false,
      stripe_payment_intent_id: '',
      stripe_status: 'mock',
      question_answer: questionAnswer,
      created_at: serverTimestamp(),
      paid_at: serverTimestamp(),
    });

    // Write 3 — Create ticket documents (loop)
    const ticketResults = [];
    for (let i = 0; i < totalTicketsToGenerate; i++) {
      const ticketNumber = startSeq + i;
      const ticketSequence = `${prefix}${String(ticketNumber).padStart(3, '0')}`;
      const ticketRef = ticketRefs[i];

      transaction.set(ticketRef, {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
        ticket_number: ticketNumber,
        ticket_sequence: ticketSequence,
        status: 'active',
        is_winner: false,
        created_at: serverTimestamp(),
      });

      ticketResults.push({
        ticketId: ticketRef.id,
        ticketNumber,
        ticketSequence,
      });
    }

    // Write 4 — Log pack bonus tickets (if any)
    if (packBonusTickets > 0) {
      const freeTicketLogRef = doc(collection(db, 'free_ticket_log'));
      transaction.set(freeTicketLogRef, {
        user_id: userRef,
        order_id: orderRef,
        competition_id: competitionRef,
        quantity: packBonusTickets,
        reason: `${packType} Bonus`,
        created_at: serverTimestamp(),
      });
    }

    // Write 5 — Burn referrals
    if (clampedReferralTickets > 0) {
      // Burn exactly clampedReferralTickets
      const refsToBurn = referralRefs.slice(0, clampedReferralTickets);
      
      refsToBurn.forEach(ref => {
        transaction.update(ref, {
          reward_issued: true,
          reward_issued_at: serverTimestamp()
        });
      });

      const referralLogRef = doc(collection(db, 'free_ticket_log'));
      transaction.set(referralLogRef, {
        user_id: userRef,
        order_id: orderRef,
        competition_id: competitionRef,
        quantity: clampedReferralTickets,
        reason: 'referral',
        created_at: serverTimestamp(),
      });
    }

    // Write 6 — Update user stats
    // free_tickets  = wallet balance → only decremented when referral tickets are SPENT
    //                                  (incremented separately by referralService when a referral is claimed)
    // total_free_tickets = lifetime stat → always incremented by pack bonus tickets
    transaction.update(userRef, {
      total_tickets_bought: increment(qty),
      // Decrement wallet balance only when referral free-tickets are burned in this order
      ...(clampedReferralTickets > 0 && { free_tickets: increment(-clampedReferralTickets) }),
      // Pack bonus tickets count toward the lifetime total (they are already generated in this order)
      ...(packBonusTickets > 0 && { total_free_tickets: increment(packBonusTickets) }),
      total_spent: increment(totalAmount),
      updated_at: serverTimestamp(),
    });

    return {
      orderId: orderRef.id,
      tickets: ticketResults,
      totalAmount,
      packType,
      freeTickets: packBonusTickets + clampedReferralTickets,
    };
  });

  // ── Step 2: Fire push notification (non-blocking) ─────────────────────────
  // Called OUTSIDE the transaction so a notification failure can never roll
  // back the order. createAppNotification swallows its own errors internally.
  // The doc triggers FlutterFlow's sendUserPushNotificationsTrigger CF for FCM delivery.
  createAppNotification({
    currentUserRef: userRef,
    competitionRef,
    orderRef,
    competitionTitle: competitionTitle || '',
  });

  return result;
};
