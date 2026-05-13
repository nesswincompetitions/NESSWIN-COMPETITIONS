/**
 * orderService.js
 *
 * Thin client-side wrapper around the `processOrder` Cloud Function.
 *
 * All transaction logic (Firestore reads/writes, ticket generation, referral
 * burning, audit logging) now runs server-side inside the Cloud Function.
 * This approach allows Firestore Security Rules to fully lock down the
 * `order/`, `ticket/`, and `free_ticket_log/` collections.
 *
 * @module orderService
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

const processOrderFn = httpsCallable(functions, 'processOrder');

/**
 * processOrder
 *
 * Delegates the full ticket purchase transaction to the `processOrder`
 * Cloud Function. Validates inputs client-side before calling the server.
 *
 * @param {Object} params
 * @param {string} params.competitionId
 * @param {number} params.ticketQuantity       Paid tickets requested
 * @param {Object} params.questionAnswer        question_answer Map (embedded on order doc)
 * @param {number} [params.freeTicketsToUse=0] Referral tickets to redeem
 * @param {Array}  [params.referralsToBurn=[]] Array of { id } referral objects to burn
 *
 * @returns {Promise<{ orderId, tickets, totalAmount, packType, freeTickets }>}
 */
export async function processOrder({
  competitionId,
  ticketQuantity,
  questionAnswer,
  freeTicketsToUse = 0,
  referralsToBurn = [],
}) {
  // ── Client-side input guard (duplicate of server validation — fail fast) ──
  if (!competitionId || typeof competitionId !== 'string') {
    throw new Error('competitionId is required.');
  }

  const qty = Number(ticketQuantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive integer.');
  }
  if (qty > 100) {
    throw new Error('Maximum 100 tickets per order.');
  }

  // ── Delegate to Cloud Function ────────────────────────────────────────────
  const { data } = await processOrderFn({
    competitionId,
    ticketQuantity: qty,
    questionAnswer: questionAnswer || {},
    freeTicketsToUse: Number(freeTicketsToUse) || 0,
    referralsToBurn: (referralsToBurn || []).map((r) => ({ id: r.id })),
  });

  return data;
}
