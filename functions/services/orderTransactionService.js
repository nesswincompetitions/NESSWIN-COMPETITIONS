import { getOrderPricing } from "./orderPricingService.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derives a short uppercase prefix from a competition title.
 * Each word's first letter is taken and uppercased.
 *
 * @example
 * generateTicketPrefix("Mega Diamond Draw") // → "MDD"
 * generateTicketPrefix("Tesla Model 3")     // → "TM3"
 *
 * @param {string} title
 * @returns {string}
 */
export function generateTicketPrefix(title) {
  if (!title || typeof title !== "string") return "TKT";

  const prefix = title
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase())
    .join("");

  return prefix || "TKT";
}

/**
 * Builds the formatted ticket sequence string.
 * @param {string} prefix   e.g. "MDD"
 * @param {number} sequence e.g. 7
 * @returns {string}        e.g. "MDD007"
 */
export function formatTicketSequence(prefix, sequence) {
  return `${prefix}${String(sequence).padStart(3, "0")}`;
}

// ─── Main Transaction ──────────────────────────────────────────────────────────

/**
 * runOrderTransaction
 *
 * Executes the complete ticket purchase as an atomic Firestore transaction.
 * ALL reads happen before ALL writes (enforced by Firebase SDK).
 *
 * Flow:
 *   READS  → competition, user, referral docs
 *   MATH   → pricing, stock check, sequence generation (no I/O)
 *   WRITES → competition update, order doc, ticket docs, free_ticket_log, user update
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-admin').firestore.Firestore} admin
 * @param {Object} params
 * @param {string}   params.uid
 * @param {string}   params.competitionId
 * @param {number}   params.ticketQuantity       Paid ticket count
 * @param {Object}   params.questionAnswer        question_answer Map embedded on the order
 * @param {number}   [params.freeTicketsToUse=0]  Referral tickets to burn
 * @param {Array}    [params.referralsToBurn=[]]  Array of { id } referral objects
 *
 * @returns {Promise<{ orderId, tickets, totalAmount, packType, freeTickets }>}
 */
export async function runOrderTransaction(
  db,
  admin,
  {
    uid,
    competitionId,
    ticketQuantity,
    questionAnswer,
    freeTicketsToUse = 0,
    referralsToBurn = [],
  }
) {
  // ── Input validation ─────────────────────────────────────────────────────────
  const qty = Number(ticketQuantity);
  if (!Number.isInteger(qty) || qty < 0) {
    throw new Error("Quantity must be a non-negative integer.");
  }
  if (qty > 100) {
    throw new Error("Maximum 100 tickets per order.");
  }
  if (!competitionId || !uid) {
    throw new Error("competitionId and uid are required.");
  }

  // ── Pre-build document refs (safe to do outside the transaction) ─────────────
  const userRef = db.collection("user").doc(uid);
  const competitionRef = db.collection("competition").doc(competitionId);
  const orderRef = db.collection("order").doc(); // auto-id

  // ── Pricing math (pure — no I/O) ─────────────────────────────────────────────
  const { discount, freeTickets: packBonusTickets, packType } = getOrderPricing(qty);

  const clampedReferralTickets = Math.max(0, Math.floor(freeTicketsToUse));
  const totalTicketsToGenerate = qty + packBonusTickets + clampedReferralTickets;

  if (totalTicketsToGenerate <= 0) {
    throw new Error("At least one ticket must be requested (paid or free).");
  }

  // Pre-build ticket refs outside the transaction (auto-ids don't require I/O)
  const ticketRefs = Array.from({ length: totalTicketsToGenerate }, () =>
    db.collection("ticket").doc()
  );

  // ── Referral refs ─────────────────────────────────────────────────────────────
  const referralRefs = (referralsToBurn || [])
    .slice(0, clampedReferralTickets)
    .map((r) => db.collection("referrals").doc(r.id));

  // ═══════════════════════════════════════════════════════════════════════════════
  // FIRESTORE TRANSACTION
  // ═══════════════════════════════════════════════════════════════════════════════
  const result = await db.runTransaction(async (transaction) => {

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1 — READS (all before any write)
    // ══════════════════════════════════════════════════════════════════════════

    const compSnap = await transaction.get(competitionRef);
    if (!compSnap.exists) throw new Error("Competition not found.");

    const compData = compSnap.data();

    if (compData.status !== "active") {
      throw new Error("This competition is no longer accepting entries.");
    }

    // Server-side draw date check (protects against stale client status)
    const now = new Date();
    if (compData.draw_date && compData.draw_date.toDate() <= now) {
      throw new Error("This competition has already closed for entries.");
    }

    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error("User not found.");

    // Validate each referral doc
    let validReferralCount = 0;
    const referralSnaps = await Promise.all(
      referralRefs.map((ref) => transaction.get(ref))
    );

    for (let i = 0; i < referralSnaps.length; i++) {
      const snap = referralSnaps[i];
      const refId = referralRefs[i].id;

      if (!snap.exists) throw new Error(`Referral ${refId} not found.`);
      if (snap.data().reward_issued) {
        throw new Error(`Referral ${refId} was already redeemed.`);
      }
      if (snap.data().referrer_id?.path !== userRef.path) {
        throw new Error(`Referral ${refId} does not belong to you.`);
      }
      validReferralCount++;
    }

    if (clampedReferralTickets > 0 && validReferralCount < clampedReferralTickets) {
      throw new Error("Not enough valid referral tickets found.");
    }

      // ── Skill Gate Verification ──────────────────────────────────────────
      // Enforce that the user has passed the quiz for this competition.
      const attemptRef = db.collection("skill_attempts").doc(`${uid}_${competitionId}`);
      const attemptSnap = await transaction.get(attemptRef);

      if (!attemptSnap.exists || attemptSnap.data()?.passed !== true) {
        throw new Error("You must pass the skill-gate quiz before entering this competition.");
      }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2 — MATH & VALIDATION (no I/O — pure computation)
    // ══════════════════════════════════════════════════════════════════════════

    const currentStock = Number(compData.stock_quantity || 0);
    if (currentStock < totalTicketsToGenerate) {
      throw new Error(
        `Only ${currentStock} ticket${currentStock === 1 ? "" : "s"} remaining in stock.`
      );
    }

    // Ticket sequence allocation
    const lastSeq = Number(compData.last_ticket_sequence) || 0;
    const startSeq = lastSeq + 1;
    const endSeq = lastSeq + totalTicketsToGenerate;

    // Competition title prefix (e.g. "Mega Diamond Draw" → "MDD")
    const prefix = generateTicketPrefix(compData.title || "");

    // Pricing computation
    const ticketPrice = Number(compData.ticket_price || 0);
    const subtotal = qty * ticketPrice;
    const discountAmount = subtotal * discount;
    const totalAmount = subtotal - discountAmount;

    const newStock = currentStock - totalTicketsToGenerate;
    const newStatus = newStock === 0 ? "sold_out" : "active";

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3 — WRITES (atomic — any failure rolls back everything)
    // ══════════════════════════════════════════════════════════════════════════

    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    // Write 1 — Update competition
    transaction.update(competitionRef, {
      stock_quantity: admin.firestore.FieldValue.increment(-totalTicketsToGenerate),
      sold_tickets: admin.firestore.FieldValue.increment(totalTicketsToGenerate),
      last_ticket_sequence: endSeq,
      status: newStatus,
      participants: admin.firestore.FieldValue.arrayUnion(userRef),
      updated_at: serverNow,
    });

    // Write 2 — Create the order document
    transaction.set(orderRef, {
      competition_id: competitionRef,
      user_ref: userRef,
      total_ticket: totalTicketsToGenerate,
      paid_ticket: qty,
      free_ticket: packBonusTickets,
      free_used: clampedReferralTickets,
      pack_type: packType,
      discount_percent: Math.round(discount * 100),
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      currency: "EUR",
      status: "paid",
      is_winner: false,
      stripe_payment_intent_id: "",
      stripe_status: totalAmount === 0 ? "free" : "mock",
      question_answer: (() => {
        // Explicitly build the Map from the client payload — never blindly trust the shape.
        const qa = questionAnswer || {};
        return {
          question_id: typeof qa.question_id === 'string' ? qa.question_id : '',
          question:    typeof qa.question    === 'string' ? qa.question    : '',
          // image — ensure it's an array of strings
          image: Array.isArray(qa.image)
            ? qa.image.filter((v) => typeof v === 'string')
            : [],
          // option — ensure it's an array of { option_id, option } maps
          option: Array.isArray(qa.option)
            ? qa.option
                .filter((o) => o && typeof o === 'object')
                .map((o) => ({
                  option_id: typeof o.option_id === 'string' ? o.option_id : '',
                  option:    typeof o.option    === 'string' ? o.option    : '',
                }))
            : [],
          // answer — the specific option the user selected
          answer: (() => {
            const a = qa.answer;
            if (!a || typeof a !== 'object') return { option_id: '', option: '' };
            return {
              option_id: typeof a.option_id === 'string' ? a.option_id : '',
              option:    typeof a.option    === 'string' ? a.option    : '',
            };
          })(),
        };
      })(),
      created_at: serverNow,
      paid_at: serverNow,
    });

    // Write 3 — Create individual ticket documents
    const ticketResults = [];
    for (let i = 0; i < totalTicketsToGenerate; i++) {
      const ticketNumber = startSeq + i;
      const ticketSequence = formatTicketSequence(prefix, ticketNumber);
      const ticketRef = ticketRefs[i];

      transaction.set(ticketRef, {
        competition_id: competitionRef,
        user_id: userRef,
        order_id: orderRef,
        ticket_number: ticketNumber,
        ticket_sequence: ticketSequence,
        status: "active",
        is_winner: false,
        created_at: serverNow,
      });

      ticketResults.push({
        ticketId: ticketRef.id,
        ticketNumber,
        ticketSequence,
      });
    }

    // Write 4 — Audit log: pack bonus tickets
    if (packBonusTickets > 0) {
      transaction.set(logRef, {
        user_id: userRef,
        order_id: orderRef,
        competition_id: competitionRef,
        quantity: packBonusTickets,
        reason: "ticket_bonus",
        reward_type: "pack_bonus",
        pack_type: packType,
        created_at: serverNow,
      });
    }

    // Write 5 — Burn referrals + audit logs (grouped by reward_type for proper audit trail)
    if (clampedReferralTickets > 0) {
      // Group referrals by reward_type for separate audit logging
      const referralsByType = {
        admin_bonus: [],
        referral: [],
        other: []
      };

      referralSnaps.forEach((snap, idx) => {
        const refData = snap.data();
        const rewardType = refData.reward_type || 'referral';
        
        // Mark referral as issued
        transaction.update(referralRefs[idx], {
          reward_issued: true,
          reward_issued_at: serverNow,
        });

        // Track for audit logging
        if (rewardType === 'admin_bonus') {
          referralsByType.admin_bonus.push(1);
        } else if (rewardType === 'referral') {
          referralsByType.referral.push(1);
        } else {
          referralsByType.other.push(1);
        }
      });

      // Create separate audit logs for each reward type
      if (referralsByType.admin_bonus.length > 0) {
        transaction.set(adminBonusLogRef, {
          user_id: userRef,
          order_id: orderRef,
          competition_id: competitionRef,
          quantity: referralsByType.admin_bonus.length,
          reason: "admin_bonus",
          reward_type: "admin_bonus",
          created_at: serverNow,
        });
      }

      if (referralsByType.referral.length > 0) {
        transaction.set(referralLogRef, {
          user_id: userRef,
          order_id: orderRef,
          competition_id: competitionRef,
          quantity: referralsByType.referral.length,
          reason: "referral",
          reward_type: "referral",
          created_at: serverNow,
        });
      }

      if (referralsByType.other.length > 0) {
        transaction.set(otherLogRef, {
          user_id: userRef,
          order_id: orderRef,
          competition_id: competitionRef,
          quantity: referralsByType.other.length,
          reason: "free_ticket",
          reward_type: "other",
          created_at: serverNow,
        });
      }
    }

    // Write 6 — Update user stats
    transaction.update(userRef, {
      total_tickets_bought: admin.firestore.FieldValue.increment(qty),
      total_spent: admin.firestore.FieldValue.increment(totalAmount),
      // Deduct referral wallet balance only when referral tickets are burned
      ...(clampedReferralTickets > 0 && {
        free_tickets: admin.firestore.FieldValue.increment(-clampedReferralTickets),
      }),
      // Lifetime free ticket counter — always increment by pack bonus
      ...(packBonusTickets > 0 && {
        total_free_tickets: admin.firestore.FieldValue.increment(packBonusTickets),
      }),
      updated_at: serverNow,
    });

    return {
      orderId: orderRef.id,
      tickets: ticketResults,
      totalAmount,
      packType,
      // Total free tickets awarded/used (pack bonus + referrals)
      freeTickets: packBonusTickets + clampedReferralTickets,
      // Expose components separately so callers can craft distinct notifications
      packBonusTickets,
      referralTicketsUsed: clampedReferralTickets,
    };
  });

  return result;
}
