import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  orderBy,
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { db, functions } from '@/config/firebase';

// ── Cloud Function callable ────────────────────────────────────────────────────
const processOrderFn = httpsCallable(functions, 'processOrder');

// ── Pricing helper (mirrors backend — used for UI-only computation) ────────────
function getOrderPricing(qty) {
  if (qty === 15) return { discount: 0.1,  freeTickets: 1, packType: 'Pack Prestige' };
  if (qty === 20) return { discount: 0.15, freeTickets: 2, packType: 'Pack Elite' };
  if (qty === 25) return { discount: 0.2,  freeTickets: 2, packType: 'Pack Gold' };
  if (qty === 50) return { discount: 0.25, freeTickets: 5, packType: 'Pack Diamond' };
  return { discount: 0, freeTickets: Math.floor(qty / 10), packType: 'Single' };
}

/**
 * useCheckout
 *
 * Focused hook for ticket selection + order submission state.
 * Intentionally decoupled from skill gate logic (handled by useCompetitionCheckout).
 *
 * Key computed values:
 *   bonusTickets   = pack bonus tickets (server-mirrored, display-only)
 *   totalTickets   = paidTicketQty + referralTicketsToUse + bonusTickets
 *   totalAmount    = paid subtotal − pack discount (referral tickets are free)
 *   isZeroPayment  = totalAmount === 0  → bypasses Stripe, shows "Claim" button
 *
 * @param {Object} params
 * @param {Object}   params.currentUser       Firebase auth user
 * @param {Object}   params.competition       Competition document (id, title, ticketPrice, etc.)
 * @param {Array}    params.pendingReferrals  Array of pending referral docs { id, ... }
 * @param {string}   params.resolvedQuestionId  question ID from skill gate
 * @param {Object}   params.questionAnswerMap   question_answer Map from skill gate
 * @param {Function} [params.onSuccess]       Called with order result after success
 */
export function useCheckout({
  currentUser,
  competition,
  pendingReferrals = [],
  resolvedQuestionId,
  questionAnswerMap,
  onSuccess,
}) {
  // ── Selection state ───────────────────────────────────────────────────────────
  const [paidTicketQty, setPaidTicketQty]       = useState(0);
  const [referralTicketsToUse, setReferralTickets] = useState(0);

  // ── Order state ───────────────────────────────────────────────────────────────
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [orderResult, setOrderResult]    = useState(null);

  // ── Derived / computed values ─────────────────────────────────────────────────
  const ticketPrice = Number(competition?.ticketPrice || 0);
  const { discount, freeTickets: bonusTickets } = getOrderPricing(paidTicketQty);

  const subtotal      = paidTicketQty * ticketPrice;
  const discountAmt   = subtotal * discount;
  const totalAmount   = subtotal - discountAmt;
  const totalTickets  = paidTicketQty + referralTicketsToUse + bonusTickets;
  const isZeroPayment = totalAmount === 0;

  // Maximum referral tickets the user can actually use
  const maxReferralTickets = pendingReferrals.length;

  // ── Setters with guards ───────────────────────────────────────────────────────
  const handleSetPaidQty = useCallback((qty) => {
    // Toggle: clicking the same count again resets to 0
    setPaidTicketQty((prev) => (prev === qty ? 0 : qty));
  }, []);

  const handleSetReferralQty = useCallback((qty) => {
    // Toggle: clicking the same count again resets to 0
    setReferralTickets((prev) => (prev === qty ? 0 : qty));
  }, []);

  const resetOrder = useCallback(() => {
    setOrderResult(null);
    setCheckoutError('');
  }, []);

  // ── Submit order ──────────────────────────────────────────────────────────────
  const submitOrder = useCallback(async () => {
    if (!currentUser) {
      toast.error('You must be logged in.');
      return;
    }
    if (!competition?.id) {
      toast.error('Competition not found.');
      return;
    }
    if (totalTickets <= 0) {
      toast.error('Please select at least one ticket.');
      return;
    }

    setIsProcessing(true);
    setCheckoutError('');

    try {
      const payload = {
        competitionId:    competition.id,
        ticketQuantity:   paidTicketQty,
        questionAnswer:   questionAnswerMap || {},
        freeTicketsToUse: referralTicketsToUse,
        referralsToBurn:  pendingReferrals
          .slice(0, referralTicketsToUse)
          .map((r) => ({ id: r.id })),
      };

      const { data: result } = await processOrderFn(payload);

      setOrderResult(result);
      toast.success(`${result.tickets.length} ticket${result.tickets.length > 1 ? 's' : ''} confirmed! 🎉`);

      if (onSuccess) onSuccess(result);
    } catch (err) {
      const msg = err?.message || 'Order failed. Please try again.';
      setCheckoutError(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [
    currentUser,
    competition,
    paidTicketQty,
    referralTicketsToUse,
    pendingReferrals,
    questionAnswerMap,
    onSuccess,
  ]);

  // ── Refresh user's tickets after an order ─────────────────────────────────────
  const refreshUserTickets = useCallback(async () => {
    if (!currentUser?.uid || !competition?.id) return [];
    try {
      const userRef = doc(db, 'user', currentUser.uid);
      const compRef = doc(db, 'competition', competition.id);
      const q = query(
        collection(db, 'ticket'),
        where('user_id', '==', userRef),
        where('competition_id', '==', compRef),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  }, [currentUser?.uid, competition?.id]);

  return {
    // Selection
    paidTicketQty,
    referralTicketsToUse,
    maxReferralTickets,
    handleSetPaidQty,
    handleSetReferralQty,

    // Computed summary
    bonusTickets,
    totalTickets,
    totalAmount,
    subtotal,
    discountAmt,
    isZeroPayment,

    // Order lifecycle
    isProcessing,
    checkoutError,
    orderResult,
    resetOrder,
    submitOrder,
    refreshUserTickets,
  };
}
