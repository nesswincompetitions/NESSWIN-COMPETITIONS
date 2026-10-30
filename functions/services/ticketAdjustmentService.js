import {
  ADJUSTMENT_MAX_TICKETS,
  getCompetitionAdjustmentBlock,
  getCompetitionInventoryBlock,
  getReferenceId,
  isFiniteNonNegativeInteger,
  normalizeAdjustmentReason,
  normalizeRequestId,
  normalizeStatus,
} from "./ticketAdjustmentPolicy.js";
import {
  TICKET_ADJUSTMENTS_COLLECTION,
  adjustmentReplayMatches,
  buildTicketAdjustmentRecord,
} from "./ticketAdjustmentAudit.js";
import { formatTicketSequence, generateTicketPrefix } from "./orderTransactionService.js";
import { normalizeTicketStatus } from "./ticketEligibility.js";

function normalizeQuantity(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function buildOrderSnapshot(orderData) {
  return {
    total_ticket: Number(orderData.total_ticket || 0),
    paid_ticket: Number(orderData.paid_ticket || 0),
    free_ticket: Number(orderData.free_ticket || 0),
    free_used: Number(orderData.free_used || 0),
    total_amount: Number(orderData.total_amount || 0),
    currency: orderData.currency || "GBP",
    status: orderData.status || "",
    stripe_status: orderData.stripe_status || "",
  };
}

function buildInventorySnapshot(competitionData, capacityRemaining = null) {
  return {
    stock_quantity: competitionData.stock_quantity,
    sold_tickets: competitionData.sold_tickets,
    total_tickets: competitionData.total_tickets,
    last_ticket_sequence: competitionData.last_ticket_sequence,
    capacity_remaining: capacityRemaining,
    status: competitionData.status,
  };
}

function assertOrderEligibility(orderData, userId, competitionId, HttpsError) {
  if (getReferenceId(orderData.user_ref) !== userId) {
    throw new HttpsError("failed-precondition", "The order does not belong to the specified user.");
  }
  if (getReferenceId(orderData.competition_id) !== competitionId) {
    throw new HttpsError("failed-precondition", "The order does not belong to the specified competition.");
  }
  if (normalizeStatus(orderData.status) !== "paid") {
    throw new HttpsError("failed-precondition", "Tickets can only be added to a paid order.");
  }
  if (orderData.is_winner === true) {
    throw new HttpsError("failed-precondition", "Tickets cannot be added to a winning order.");
  }
}

function validateInventory(competitionData, quantity, HttpsError) {
  const inventoryBlock = getCompetitionInventoryBlock(competitionData);
  if (inventoryBlock) {
    throw new HttpsError("failed-precondition", inventoryBlock);
  }

  const stock = competitionData.stock_quantity;
  const sold = competitionData.sold_tickets;
  const lastSequence = competitionData.last_ticket_sequence;
  const total = competitionData.total_tickets;

  if (!isFiniteNonNegativeInteger(total) || total <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Competition capacity is malformed, so tickets cannot be allocated safely."
    );
  }
  if (sold > total) {
    throw new HttpsError(
      "failed-precondition",
      "Competition sold count exceeds configured capacity. Repair the counters before adding tickets."
    );
  }
  if (stock > total) {
    throw new HttpsError(
      "failed-precondition",
      "Competition stock exceeds configured capacity. Repair the counters before adding tickets."
    );
  }

  // Existing admin edits can reset stock independently of sold count. The
  // configured capacity remaining is total - sold; use the smaller of that and
  // stored stock. Do not repair or rewrite the stored counters here.
  const capacityRemaining = Math.min(stock, total - sold);
  if (quantity > capacityRemaining) {
    throw new HttpsError(
      "failed-precondition",
      `Only ${capacityRemaining} ticket${capacityRemaining === 1 ? "" : "s"} remain in the configured capacity or stock.`
    );
  }

  return { stock, sold, lastSequence, total, capacityRemaining };
}

async function readSequenceState(transaction, db, competitionId, competitionRef, counters, HttpsError) {
  // Check the highest numbered ticket for each supported reference format. This
  // bounded check catches stale or duplicated maximums without scanning history;
  // lower-number anomalies still require data repair.
  const queryValues = [
    competitionRef,
    competitionId,
    `competition/${competitionId}`,
    `/competition/${competitionId}`,
  ];
  const snapshots = await Promise.all(
    queryValues.map((value) =>
      transaction.get(
        db.collection("ticket")
          .where("competition_id", "==", value)
          .orderBy("ticket_number", "desc")
          .limit(2)
      )
    )
  );

  let maxTicketNumber = null;
  let maxOccurrences = 0;
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnap) => {
      const ticket = docSnap.data();
      const ticketNumber = ticket?.ticket_number;
      if (!isFiniteNonNegativeInteger(ticketNumber)) {
        throw new HttpsError(
          "failed-precondition",
          "A competition ticket has a malformed number, so the sequence cannot be verified safely."
        );
      }
      if (typeof ticket?.ticket_sequence !== "string" || !ticket.ticket_sequence.trim()) {
        throw new HttpsError(
          "failed-precondition",
          "A competition ticket has a malformed sequence, so the sequence cannot be verified safely."
        );
      }
      if (maxTicketNumber === null || ticketNumber > maxTicketNumber) {
        maxTicketNumber = ticketNumber;
        maxOccurrences = 1;
      } else if (ticketNumber === maxTicketNumber) {
        maxOccurrences += 1;
      }
    });
  });

  if (maxTicketNumber === null) {
    if (counters.lastSequence !== 0 || counters.sold !== 0) {
      throw new HttpsError(
        "failed-precondition",
        "Competition counters indicate issued tickets but no ticket records were found. Repair the sequence before adding tickets."
      );
    }
    return 0;
  }

  if (maxOccurrences > 1) {
    throw new HttpsError(
      "failed-precondition",
      "The highest competition ticket number is duplicated. Repair the ticket sequence before adding tickets."
    );
  }

  if (maxTicketNumber !== counters.lastSequence || counters.sold !== counters.lastSequence) {
    throw new HttpsError(
      "failed-precondition",
      "Competition ticket sequence is inconsistent with issued tickets. Repair the counters before adding tickets."
    );
  }

  return maxTicketNumber;
}

async function countActiveOrderTickets(transaction, db, orderRef) {
  const snapshot = await transaction.get(
    db.collection("ticket").where("order_id", "==", orderRef)
  );
  return snapshot.docs.filter(
    (docSnap) => normalizeTicketStatus(docSnap.data()?.status) === "active"
  ).length;
}

export function createIncreaseUserCompetitionTicketsHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
}) {
  return async function handleIncreaseUserCompetitionTickets(request) {
    const adminUid = await assertAdmin(request);
    const { userId, competitionId, orderId, quantity, reason, requestId } = request.data || {};

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }
    if (!competitionId || typeof competitionId !== "string") {
      throw new HttpsError("invalid-argument", "competitionId is required.");
    }
    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "orderId is required.");
    }

    const addQuantity = normalizeQuantity(quantity);
    if (!addQuantity) {
      throw new HttpsError("invalid-argument", "quantity must be a positive integer.");
    }
    if (addQuantity > ADJUSTMENT_MAX_TICKETS) {
      throw new HttpsError(
        "invalid-argument",
        `Maximum ${ADJUSTMENT_MAX_TICKETS} tickets can be added per request.`
      );
    }

    const reasonText = normalizeAdjustmentReason(reason);
    if (!reasonText) {
      throw new HttpsError("invalid-argument", "A reason is required to add tickets.");
    }

    const normalizedRequestId = normalizeRequestId(requestId);
    if (!normalizedRequestId) {
      throw new HttpsError("invalid-argument", "A valid requestId is required.");
    }

    const userRef = db.collection("user").doc(userId);
    const competitionRef = db.collection("competition").doc(competitionId);
    const orderRef = db.collection("order").doc(orderId);
    const adminRef = db.collection("user").doc(adminUid);
    const replayExpectation = {
      operation: "ticket_increase",
      source: "admin_order_increase",
      direction: "increase",
      quantity: addQuantity,
      reason: reasonText,
      userRef,
      competitionRef,
      primaryOrderRef: orderRef,
    };

    // A completed request remains replayable even if the competition has since
    // entered a blocked draw or finality state. Authorization already ran above.
    const existingAdjustment = await db.collection(TICKET_ADJUSTMENTS_COLLECTION)
      .doc(normalizedRequestId)
      .get();
    if (existingAdjustment.exists) {
      const existing = existingAdjustment.data();
      if (!adjustmentReplayMatches(existing, replayExpectation)) {
        throw new HttpsError(
          "failed-precondition",
          "This request ID was already used for a different ticket adjustment."
        );
      }
      return { ...existing.result, idempotentReplay: true };
    }

    const [userSnap, competitionSnap, orderSnap] = await Promise.all([
      userRef.get(),
      competitionRef.get(),
      orderRef.get(),
    ]);

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    if (!competitionSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const preflightBlock = getCompetitionAdjustmentBlock(competitionSnap.data(), {
      allowSoldOut: false,
      requireDrawDate: true,
    });
    if (preflightBlock) {
      throw new HttpsError("failed-precondition", preflightBlock);
    }
    assertOrderEligibility(orderSnap.data(), userId, competitionId, HttpsError);

    const result = await db.runTransaction(async (transaction) => {
      const adjustmentRef = db.collection(TICKET_ADJUSTMENTS_COLLECTION).doc(normalizedRequestId);
      const existingAdjustment = await transaction.get(adjustmentRef);
      if (existingAdjustment.exists) {
        const existing = existingAdjustment.data();
        if (!adjustmentReplayMatches(existing, replayExpectation)) {
          throw new HttpsError(
            "failed-precondition",
            "This request ID was already used for a different ticket adjustment."
          );
        }
        return { ...existing.result, idempotentReplay: true };
      }

      const [freshCompetitionSnap, freshOrderSnap, freshUserSnap] = await Promise.all([
        transaction.get(competitionRef),
        transaction.get(orderRef),
        transaction.get(userRef),
      ]);

      if (!freshUserSnap.exists) {
        throw new HttpsError("not-found", "User not found.");
      }
      if (!freshCompetitionSnap.exists) {
        throw new HttpsError("not-found", "Competition not found.");
      }
      if (!freshOrderSnap.exists) {
        throw new HttpsError("not-found", "Order not found.");
      }

      const freshCompetition = freshCompetitionSnap.data();
      const freshOrder = freshOrderSnap.data();

      const freshBlock = getCompetitionAdjustmentBlock(freshCompetition, {
        allowSoldOut: false,
        requireDrawDate: true,
      });
      if (freshBlock) {
        throw new HttpsError("failed-precondition", freshBlock);
      }
      assertOrderEligibility(freshOrder, userId, competitionId, HttpsError);

      const { stock, sold, lastSequence, total, capacityRemaining } = validateInventory(
        freshCompetition,
        addQuantity,
        HttpsError
      );

      await readSequenceState(
        transaction,
        db,
        competitionId,
        competitionRef,
        { lastSequence, sold },
        HttpsError
      );

      const activeCountBefore = await countActiveOrderTickets(transaction, db, orderRef);
      const newStock = stock - addQuantity;
      const newSold = sold + addQuantity;
      const newCapacityRemaining = Math.min(newStock, total - newSold);
      const endSequence = lastSequence + addQuantity;
      const prefix = generateTicketPrefix(freshCompetition.title || "");

      const ticketIds = [];
      const ticketNumbers = [];
      const ticketSequences = [];
      const now = admin.firestore.FieldValue.serverTimestamp();

      for (let index = 0; index < addQuantity; index++) {
        const ticketRef = db.collection("ticket").doc();
        const ticketNumber = lastSequence + index + 1;
        const ticketSequence = formatTicketSequence(prefix, ticketNumber);

        transaction.set(ticketRef, {
          competition_id: competitionRef,
          user_id: userRef,
          order_id: orderRef,
          ticket_number: ticketNumber,
          ticket_sequence: ticketSequence,
          status: "active",
          is_winner: false,
          allocation_type: "admin_adjustment",
          adjustment_ref: adjustmentRef,
          granted_by: adminRef,
          created_at: now,
        });

        ticketIds.push(ticketRef.id);
        ticketNumbers.push(ticketNumber);
        ticketSequences.push(ticketSequence);
      }

      // sold_tickets is the gross allocation counter. total_tickets is the
      // configured capacity and is intentionally left unchanged.
      transaction.update(competitionRef, {
        stock_quantity: admin.firestore.FieldValue.increment(-addQuantity),
        sold_tickets: admin.firestore.FieldValue.increment(addQuantity),
        last_ticket_sequence: endSequence,
        status: newStock === 0 || newSold === total ? "sold_out" : "active",
        participants: admin.firestore.FieldValue.arrayUnion(userRef),
        updated_at: now,
      });

      const inventoryBefore = buildInventorySnapshot(freshCompetition, capacityRemaining);
      const inventoryAfter = {
        stock_quantity: newStock,
        sold_tickets: newSold,
        total_tickets: total,
        last_ticket_sequence: endSequence,
        capacity_remaining: newCapacityRemaining,
        status: newStock === 0 || newSold === total ? "sold_out" : "active",
      };

      const result = {
        success: true,
        complete: true,
        operation: "ticket_increase",
        orderId,
        competitionId,
        userId,
        addedCount: addQuantity,
        ticketIds,
        ticketNumbers,
        ticketSequences,
        activeTicketCountBefore: activeCountBefore,
        activeTicketCountAfter: activeCountBefore + addQuantity,
        inventoryBefore,
        inventoryAfter,
        paymentEffect: "none",
      };

      transaction.set(
        adjustmentRef,
        buildTicketAdjustmentRecord({
          operation: "ticket_increase",
          source: "admin_order_increase",
          userRef,
          competitionRef,
          orderRefs: [orderRef],
          primaryOrderRef: orderRef,
          quantity: addQuantity,
          direction: "increase",
          ticketIds,
          ticketNumbers,
          ticketSequences,
          quantityScope: "order_active_tickets",
          previousQuantity: activeCountBefore,
          newQuantity: activeCountBefore + addQuantity,
          // The increase targets one order; record order-scoped active counts.
          activeCountScope: "order",
          activeCountBefore,
          activeCountAfter: activeCountBefore + addQuantity,
          inventoryBefore,
          inventoryAfter,
          orderSnapshot: buildOrderSnapshot(freshOrder),
          reason: reasonText,
          adminRef,
          requestId: normalizedRequestId,
          result,
          serverNow: now,
        })
      );

      return result;
    });

    logger.info(
      `[increaseUserCompetitionTickets] admin=${adminUid} user=${userId} competition=${competitionId} order=${orderId} added=${result.addedCount}`
    );

    return result;
  };
}
