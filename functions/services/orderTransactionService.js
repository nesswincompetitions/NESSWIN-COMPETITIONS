import { getOrderPricing } from "./orderPricingService.js";

/**
 * Derives a short uppercase prefix from a competition title.
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
 * @param {string} prefix
 * @param {number} sequence
 * @returns {string}
 */
export function formatTicketSequence(prefix, sequence) {
  return `${prefix}${String(sequence).padStart(3, "0")}`;
}

/**
 * Executes the complete ticket purchase as an atomic Firestore transaction.
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-admin').firestore.Firestore} admin
 * @param {Object} params
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
    orderId = null,
  }
) {
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

  const userRef = db.collection("user").doc(uid);
  const competitionRef = db.collection("competition").doc(competitionId);
  const orderRef = orderId ? db.collection("order").doc(orderId) : db.collection("order").doc();

  const { discount, freeTickets: packBonusTickets, packType } = getOrderPricing(qty);
  const clampedReferralTickets = Math.max(0, Math.floor(freeTicketsToUse));
  const referralBonusTickets = Math.floor(clampedReferralTickets / 10);
  const totalTicketsToGenerate = qty + packBonusTickets + clampedReferralTickets + referralBonusTickets;

  if (totalTicketsToGenerate <= 0) {
    throw new Error("At least one ticket must be requested (paid or free).");
  }

  const ticketRefs = Array.from({ length: totalTicketsToGenerate }, () =>
    db.collection("ticket").doc()
  );

  const referralRefs = (referralsToBurn || [])
    .slice(0, clampedReferralTickets)
    .map((r) => db.collection("referrals").doc(r.id));

  const result = await db.runTransaction(async (transaction) => {
    if (orderId) {
      const orderSnap = await transaction.get(orderRef);
      if (orderSnap.exists) {
        const orderData = orderSnap.data();
        if (orderData.status !== "pending") {
          throw new Error("This order has already been processed or is not in a pending state.");
        }
        if (orderData.user_ref?.path !== userRef.path) {
          throw new Error("This order does not belong to you.");
        }
      }
    }

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

    // Enforce that the user has passed the quiz for this competition.
    const attemptRef = db.collection("skill_attempts").doc(`${uid}_${competitionId}`);
    const attemptSnap = await transaction.get(attemptRef);

    if (!attemptSnap.exists || attemptSnap.data()?.passed !== true) {
      throw new Error("You must pass the skill-gate quiz before entering this competition.");
    }

    let unusedLogs = [];
    if (clampedReferralTickets > 0) {
      const unusedLogsQuerySnap = await db.collection("free_ticket_log")
        .where("user_id", "==", userRef)
        .where("competition_id", "==", null)
        .get();

      // Read each document inside the transaction to lock it and get fresh data
      const unusedLogsSnaps = await Promise.all(
        unusedLogsQuerySnap.docs.map((doc) => transaction.get(doc.ref))
      );

      // Sort in memory to avoid missing index errors in transaction
      unusedLogs = unusedLogsSnaps
        .filter((d) => d.exists)
        .map((d) => ({ id: d.id, ...d.data(), ref: d.ref }))
        .sort((a, b) => {
          const tA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
          const tB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
          return tA - tB;
        });
    }

    const currentStock = Number(compData.stock_quantity || 0);
    if (currentStock < totalTicketsToGenerate) {
      throw new Error(
        `Only ${currentStock} ticket${currentStock === 1 ? "" : "s"} remaining in stock.`
      );
    }

    const lastSeq = Number(compData.last_ticket_sequence) || 0;
    const startSeq = lastSeq + 1;
    const endSeq = lastSeq + totalTicketsToGenerate;

    const prefix = generateTicketPrefix(compData.title || "");

    const ticketPrice = Number(compData.ticket_price || 0);
    const subtotal = qty * ticketPrice;
    const discountAmount = subtotal * discount;
    const totalAmount = subtotal - discountAmount;

    const newStock = currentStock - totalTicketsToGenerate;
    const newStatus = newStock === 0 ? "sold_out" : "active";

    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    transaction.update(competitionRef, {
      stock_quantity: admin.firestore.FieldValue.increment(-totalTicketsToGenerate),
      sold_tickets: admin.firestore.FieldValue.increment(totalTicketsToGenerate),
      last_ticket_sequence: endSeq,
      status: newStatus,
      participants: admin.firestore.FieldValue.arrayUnion(userRef),
      updated_at: serverNow,
    });

    transaction.set(orderRef, {
      competition_id: competitionRef,
      user_ref: userRef,
      total_ticket: totalTicketsToGenerate,
      paid_ticket: qty,
      free_ticket: packBonusTickets + referralBonusTickets,
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
        // Build the Map from the client payload
        const qa = questionAnswer || {};
        return {
          question_id: typeof qa.question_id === 'string' ? qa.question_id : '',
          question:    typeof qa.question    === 'string' ? qa.question    : '',
          image: Array.isArray(qa.image)
            ? qa.image.filter((v) => typeof v === 'string')
            : [],
          option: Array.isArray(qa.option)
            ? qa.option
                .filter((o) => o && typeof o === 'object')
                .map((o) => ({
                  option_id: typeof o.option_id === 'string' ? o.option_id : '',
                  option:    typeof o.option    === 'string' ? o.option    : '',
                }))
            : [],
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

    if (packBonusTickets > 0) {
      const packLogRef = db.collection("free_ticket_log").doc();
      transaction.set(packLogRef, {
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

    if (referralBonusTickets > 0) {
      const refBonusLogRef = db.collection("free_ticket_log").doc();
      transaction.set(refBonusLogRef, {
        user_id: userRef,
        order_id: orderRef,
        competition_id: competitionRef,
        quantity: referralBonusTickets,
        reason: "ticket_bonus",
        reward_type: "referral_use_bonus",
        created_at: serverNow,
      });
    }

    if (clampedReferralTickets > 0) {
      const referralsByType = {
        admin_bonus: 0,
        referral: 0,
        other: 0
      };

      referralSnaps.forEach((snap, idx) => {
        const refData = snap.data();
        const rewardType = refData.reward_type || 'referral';
        
        transaction.update(referralRefs[idx], {
          reward_issued: true,
          reward_issued_at: serverNow,
        });

        if (rewardType === 'admin_bonus') {
          referralsByType.admin_bonus++;
        } else if (rewardType === 'referral') {
          referralsByType.referral++;
        } else {
          referralsByType.other++;
        }
      });

      const processAuditLog = (type, quantity, defaultReason) => {
        if (quantity <= 0) return;
        
        let remaining = quantity;
        const matchingLogs = unusedLogs.filter(l => l.reward_type === type);

        for (const oldLog of matchingLogs) {
          if (remaining <= 0) break;

          if (oldLog.quantity <= remaining) {
            transaction.update(oldLog.ref, {
              competition_id: competitionRef,
              order_id: orderRef,
              updated_at: serverNow
            });
            remaining -= oldLog.quantity;
          } else {
            // Partial log usage - Split it
            transaction.update(oldLog.ref, {
              quantity: oldLog.quantity - remaining,
              updated_at: serverNow
            });
            
            const usedLogRef = db.collection("free_ticket_log").doc();
            transaction.set(usedLogRef, {
              user_id: userRef,
              order_id: orderRef,
              competition_id: competitionRef,
              quantity: remaining,
              reason: oldLog.reason || defaultReason,
              reward_type: type,
              created_at: serverNow
            });
            remaining = 0;
          }
        }

        if (remaining > 0) {
          const newLogRef = db.collection("free_ticket_log").doc();
          transaction.set(newLogRef, {
            user_id: userRef,
            order_id: orderRef,
            competition_id: competitionRef,
            quantity: remaining,
            reason: defaultReason,
            reward_type: type,
            created_at: serverNow,
          });
        }
      };

      processAuditLog('admin_bonus', referralsByType.admin_bonus, 'admin_bonus');
      processAuditLog('referral', referralsByType.referral, 'referral');
      processAuditLog('other', referralsByType.other, 'free_ticket');
    }

    transaction.update(userRef, {
      total_tickets_bought: admin.firestore.FieldValue.increment(qty),
      total_spent: admin.firestore.FieldValue.increment(totalAmount),
      ...(clampedReferralTickets > 0 && {
        free_tickets: admin.firestore.FieldValue.increment(-clampedReferralTickets),
      }),
      ...((packBonusTickets > 0 || referralBonusTickets > 0) && {
        total_free_tickets: admin.firestore.FieldValue.increment(packBonusTickets + referralBonusTickets),
      }),
      updated_at: serverNow,
    });

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    const dashRef = db.doc("system_metrics/dashboard");
    
    transaction.set(dashRef, {
      total_orders: admin.firestore.FieldValue.increment(1),
      total_revenue: admin.firestore.FieldValue.increment(totalAmount),
      total_tickets_sold: admin.firestore.FieldValue.increment(totalTicketsToGenerate),
      tickets_sold_today: admin.firestore.FieldValue.increment(totalTicketsToGenerate),
      updated_at: serverNow
    }, { merge: true });

    const dailyRef = db.collection("system_metrics/dashboard/daily_history").doc(todayStr);
    transaction.set(dailyRef, {
      revenue: admin.firestore.FieldValue.increment(totalAmount),
      tickets_sold: admin.firestore.FieldValue.increment(totalTicketsToGenerate),
      date: todayStr,
      updated_at: serverNow
    }, { merge: true });

    return {
      orderId: orderRef.id,
      tickets: ticketResults,
      totalAmount,
      packType,
      freeTickets: packBonusTickets + clampedReferralTickets + referralBonusTickets,
      packBonusTickets: packBonusTickets + referralBonusTickets,
      referralTicketsUsed: clampedReferralTickets,
    };
  });

  return result;
}
