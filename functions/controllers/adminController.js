import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";
import { assertAdmin, toHttpsError } from "../services/functionGuards.js";
import { createRevokeAdminBonusHandler } from "../services/adminBonusRevocationService.js";
import { createInvalidateUserCompetitionTicketsHandler } from "../services/ticketInvalidationService.js";
import {
  createDecreaseUserCompetitionTicketsHandler,
  createIncreaseUserCompetitionTicketsHandler,
} from "../services/ticketAdjustmentService.js";
import { createRefundOrderHandler, createGetOrderRefundEligibilityHandler } from "../services/refundOrderService.js";
import { normalizeRequestId } from "../services/ticketAdjustmentPolicy.js";
import {
  AUDIT_ACTIONS,
  createAdminAuditActor,
  createAdminAuditService,
} from "../services/adminAuditService.js";

const MAX_ADMIN_BONUS_GRANT = 5000;
const ADMIN_BONUS_GRANT_MAX_REASON_LENGTH = 2000;
const ADMIN_BONUS_GRANT_CHUNK_SIZE = 400;
const ADMIN_BONUS_GRANT_LOG_PREFIX = "admin_bonus_grant";

function buildAdminBonusGrantChunkId(requestId, chunkIndex) {
  return `${ADMIN_BONUS_GRANT_LOG_PREFIX}_${requestId}_chunk_${chunkIndex}`;
}

function getAdminBonusGrantChunkCount(quantity) {
  return Math.ceil(quantity / ADMIN_BONUS_GRANT_CHUNK_SIZE);
}

function getAdminBonusGrantChunkSize(quantity, chunkIndex) {
  return Math.min(
    ADMIN_BONUS_GRANT_CHUNK_SIZE,
    quantity - chunkIndex * ADMIN_BONUS_GRANT_CHUNK_SIZE
  );
}

function normalizeAdminBonusGrantReason(reason, HttpsError) {
  if (reason === undefined || reason === null) return "";
  if (typeof reason !== "string") {
    throw new HttpsError("invalid-argument", "reason must be a string.");
  }
  if (reason.length > ADMIN_BONUS_GRANT_MAX_REASON_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `reason must be at most ${ADMIN_BONUS_GRANT_MAX_REASON_LENGTH} characters.`
    );
  }
  return reason;
}

function adminBonusGrantChunkMatches(data, expectation, chunkIndex) {
  return (
    data?.grant_request_id === expectation.requestId &&
    data?.grant_user_id === expectation.userId &&
    Number(data?.grant_requested_quantity) === expectation.quantity &&
    data?.grant_reason === expectation.reason &&
    Number(data?.grant_chunk_count) === expectation.chunkCount &&
    Number(data?.grant_chunk_index) === chunkIndex
  );
}

function buildAdminBonusGrantResult({
  complete,
  grantedQuantity,
  requestedQuantity,
  requestId,
  idempotentReplay = false,
}) {
  const remainingQuantity = Math.max(0, requestedQuantity - grantedQuantity);
  const grantedLabel = `${grantedQuantity} ticket${grantedQuantity === 1 ? "" : "s"}`;
  let message;

  if (complete) {
    message = idempotentReplay
      ? `Granted ${grantedLabel} previously; no additional tickets were issued.`
      : `Granted ${grantedLabel} successfully.`;
  } else {
    message = `Granted ${grantedQuantity} of ${requestedQuantity} ticket${
      requestedQuantity === 1 ? "" : "s"
    }. ${remainingQuantity} remaining; retry with the same request ID to resume.`;
  }

  return {
    success: complete,
    complete,
    grantedQuantity,
    remainingQuantity,
    requestedQuantity,
    requestId,
    idempotentReplay,
    retryable: !complete,
    message,
  };
}

export function createGrantAdminBonusHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
}) {
  const auditService = createAdminAuditService({ db, admin, logger, HttpsError });

  async function executeGrant(request, adminUid) {
    const { userId, quantity, reason = "", requestId } = request.data || {};

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new HttpsError("invalid-argument", "Quantity must be a positive integer.");
    }
    if (qty > MAX_ADMIN_BONUS_GRANT) {
      throw new HttpsError(
        "invalid-argument",
        `Maximum ${MAX_ADMIN_BONUS_GRANT} tickets per grant.`
      );
    }
    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }

    const hasRequestId = requestId !== undefined && requestId !== null;
    const normalizedRequestId = hasRequestId
      ? normalizeRequestId(requestId)
      : db.collection("free_ticket_log").doc().id;
    if (!normalizedRequestId) {
      throw new HttpsError("invalid-argument", "A valid requestId is required.");
    }

    const reasonText = normalizeAdminBonusGrantReason(reason, HttpsError);
    const chunkCount = getAdminBonusGrantChunkCount(qty);
    const expectation = {
      requestId: normalizedRequestId,
      userId,
      quantity: qty,
      reason: reasonText,
      chunkCount,
    };

    const userRef = db.collection("user").doc(userId);
    const adminRef = db.collection("user").doc(adminUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }

    const chunkRefs = Array.from({ length: chunkCount }, (_, chunkIndex) =>
      db
        .collection("free_ticket_log")
        .doc(buildAdminBonusGrantChunkId(normalizedRequestId, chunkIndex))
    );

    async function readGrantProgress() {
      const snapshots = await Promise.all(chunkRefs.map((ref) => ref.get()));
      let grantedQuantity = 0;
      let committedChunks = 0;

      snapshots.forEach((snapshot, chunkIndex) => {
        if (!snapshot.exists) return;
        if (!adminBonusGrantChunkMatches(snapshot.data(), expectation, chunkIndex)) {
          throw new HttpsError(
            "failed-precondition",
            "This request ID was already used for a different admin bonus grant."
          );
        }
        grantedQuantity += getAdminBonusGrantChunkSize(qty, chunkIndex);
        committedChunks += 1;
      });

      return {
        grantedQuantity,
        committedChunks,
        complete: committedChunks === chunkCount,
      };
    }

    const initialProgress = await readGrantProgress();
    if (initialProgress.complete) {
      logger.info(
        `[grantAdminBonus] Replayed completed request=${normalizedRequestId} user=${userId} quantity=${qty}`
      );
      return buildAdminBonusGrantResult({
        complete: true,
        grantedQuantity: initialProgress.grantedQuantity,
        requestedQuantity: qty,
        requestId: normalizedRequestId,
        idempotentReplay: true,
      });
    }

    let newlyCommittedChunks = 0;

    try {
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const chunkSize = getAdminBonusGrantChunkSize(qty, chunkIndex);
        const chunkRef = chunkRefs[chunkIndex];
        const referralRefs = Array.from({ length: chunkSize }, () =>
          db.collection("referrals").doc()
        );

        const chunkResult = await db.runTransaction(async (transaction) => {
          const chunkSnap = await transaction.get(chunkRef);
          const receiptSnap =
            chunkIndex === 0
              ? chunkSnap
              : await transaction.get(chunkRefs[0]);

          if (receiptSnap.exists) {
            const receiptChunkIndex = chunkIndex === 0 ? chunkIndex : 0;
            if (
              !adminBonusGrantChunkMatches(
                receiptSnap.data(),
                expectation,
                receiptChunkIndex
              )
            ) {
              throw new HttpsError(
                "failed-precondition",
                "This request ID was already used for a different admin bonus grant."
              );
            }
          } else if (chunkIndex > 0) {
            throw new HttpsError(
              "failed-precondition",
              "The admin bonus grant receipt is missing, so this request cannot be resumed safely."
            );
          }

          if (chunkSnap.exists) {
            if (!adminBonusGrantChunkMatches(chunkSnap.data(), expectation, chunkIndex)) {
              throw new HttpsError(
                "failed-precondition",
                "This request ID was already used for a different admin bonus grant."
              );
            }
            return { committed: false, chunkSize };
          }

          const freshUserSnap = await transaction.get(userRef);
          if (!freshUserSnap.exists) {
            throw new HttpsError("not-found", "User not found.");
          }

          const freshUser = freshUserSnap.data();
          const balanceBefore = Number.isFinite(freshUser?.free_tickets)
            ? freshUser.free_tickets
            : 0;
          const totalBefore = Number.isFinite(freshUser?.total_free_tickets)
            ? freshUser.total_free_tickets
            : 0;
          const serverTs = admin.firestore.FieldValue.serverTimestamp();
          const isFinalChunk = chunkIndex === chunkCount - 1;

          referralRefs.forEach((referralRef) => {
            transaction.set(referralRef, {
              referrer_id: userRef,
              referred_user_id: adminRef,
              referral_code: "ADMIN_BONUS",
              reward_type: "admin_bonus",
              reward_value: 1,
              reward_issued: false,
              created_at: serverTs,
              grant_request_id: normalizedRequestId,
              grant_user_id: userId,
              grant_requested_quantity: qty,
              grant_chunk_index: chunkIndex,
              grant_chunk_count: chunkCount,
              granted_by: adminRef,
            });
          });

          transaction.update(userRef, {
            free_tickets: admin.firestore.FieldValue.increment(chunkSize),
            total_free_tickets: admin.firestore.FieldValue.increment(chunkSize),
            updated_at: serverTs,
          });

          transaction.set(chunkRef, {
            user_id: userRef,
            quantity: chunkSize,
            reason: reasonText || "Admin Bonus",
            reward_type: "admin_bonus",
            admin_note: reasonText,
            competition_id: null,
            reward_issued: false,
            type: "grant",
            created_at: serverTs,
            grant_request_id: normalizedRequestId,
            grant_user_id: userId,
            grant_requested_quantity: qty,
            grant_quantity: chunkSize,
            grant_chunk_index: chunkIndex,
            grant_chunk_count: chunkCount,
            granted_by: adminRef,
            grant_reason: reasonText,
          });

          if (isFinalChunk) {
            const notifRef = db.collection("ff_user_push_notifications").doc();
            transaction.set(notifRef, {
              user_refs: userRef.path,
              notification_title: `🎁 ${qty} Free Ticket${qty !== 1 ? 's' : ''} Granted!`,
              notification_text: `You've received ${qty} free ticket${qty !== 1 ? 's' : ''} from an admin.${reasonText ? ` Reason: ${reasonText}` : ''}`,
              notification_image_url: "",
              scheduled_time: null,
              notification_sound: "default",
              category: "rewards",
              type: "free_ticket_earned",
              cta_text: "View",
              initial_page_name: "MyTickets",
              parameter_data: JSON.stringify({
                quantity: qty,
                reason: "admin_bonus",
                admin_note: reasonText,
              }),
              status: "",
              is_read: false,
              num_sent: 0,
              sender: userRef,
              chat_ref: null,
              order_ref: null,
              competition_ref: null,
              timestamp: serverTs,
              created_at: serverTs,
            });
          }

          auditService.recordEventInTransaction(
            transaction,
            {
              action: AUDIT_ACTIONS.BONUS_GRANTED,
              entity_type: "bonus_credit",
              entity_id: userId,
              summary: `Granted ${chunkSize} of ${qty} admin bonus credit(s) (chunk ${
                chunkIndex + 1
              }/${chunkCount}).`,
              reason: reasonText,
              before: {
                free_tickets: balanceBefore,
                total_free_tickets: totalBefore,
              },
              after: {
                free_tickets: balanceBefore + chunkSize,
                total_free_tickets: totalBefore + chunkSize,
                quantity: chunkSize,
                reward_type: "admin_bonus",
                reward_value: 1,
                reward_issued: false,
                requested_quantity: qty,
                granted_quantity: chunkSize,
                chunk_index: chunkIndex,
                chunk_count: chunkCount,
                grant_status: isFinalChunk ? "complete" : "chunk_committed",
              },
              related: { user_id: userId },
              source: "admin_bonus_grant",
              correlation_id: normalizedRequestId,
            },
            { actor: createAdminAuditActor(adminUid) }
          );

          return { committed: true, chunkSize };
        });

        if (chunkResult.committed) {
          newlyCommittedChunks += 1;
        }
      }
    } catch (chunkErr) {
      if (chunkErr instanceof HttpsError && chunkErr.code === "failed-precondition") {
        throw chunkErr;
      }
      logger.error(
        `[grantAdminBonus] Chunk processing failed for request=${normalizedRequestId} user=${userId}`,
        chunkErr
      );
      const progress = await readGrantProgress();
      return buildAdminBonusGrantResult({
        complete: progress.complete,
        grantedQuantity: progress.grantedQuantity,
        requestedQuantity: qty,
        requestId: normalizedRequestId,
        idempotentReplay: progress.complete,
      });
    }

    const progress = await readGrantProgress();
    if (!progress.complete) {
      return buildAdminBonusGrantResult({
        complete: false,
        grantedQuantity: progress.grantedQuantity,
        requestedQuantity: qty,
        requestId: normalizedRequestId,
      });
    }

    logger.info(
      `[grantAdminBonus] Successfully granted all ${qty} tickets to user=${userId} request=${normalizedRequestId}`
    );
    return buildAdminBonusGrantResult({
      complete: true,
      grantedQuantity: progress.grantedQuantity,
      requestedQuantity: qty,
      requestId: normalizedRequestId,
      idempotentReplay: newlyCommittedChunks === 0,
    });
  }

  return async function handleGrantAdminBonus(request) {
    const adminUid = await assertAdmin(request);
    try {
      return await executeGrant(request, adminUid);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("[grantAdminBonus] Error:", err?.message || err);
      throw toHttpsError(err, "Failed to grant admin bonus.");
    }
  };
}

/**
 * Callable: grantAdminBonus
 * Payload: { userId: string, quantity: number, reason?: string, requestId: string }
 */
export const grantAdminBonus = onCall(
  createGrantAdminBonusHandler({ db, admin, logger, assertAdmin, HttpsError })
);

/**
 * Callable: revokeAdminBonus
 * Payload: { userId: string, creditIds: string[], reason: string }
 */
export const revokeAdminBonus = onCall(
  createRevokeAdminBonusHandler({ db, admin, logger, assertAdmin, HttpsError })
);

/**
 * Callable: invalidateUserCompetitionTickets
 * Payload: { userId: string, competitionId: string, reason: string }
 */
export const invalidateUserCompetitionTickets = onCall(
  createInvalidateUserCompetitionTicketsHandler({ db, admin, logger, assertAdmin, HttpsError })
);

/**
 * Callable: increaseUserCompetitionTickets
 * Payload: { userId, competitionId, orderId, quantity, reason, requestId }
 */
export const increaseUserCompetitionTickets = onCall(
  createIncreaseUserCompetitionTicketsHandler({ db, admin, logger, assertAdmin, HttpsError })
);

/**
 * Callable: decreaseUserCompetitionTickets
 * Payload: { userId, competitionId, orderId, origin, quantity, reason, requestId }
 */
export const decreaseUserCompetitionTickets = onCall(
  createDecreaseUserCompetitionTicketsHandler({ db, admin, logger, assertAdmin, HttpsError })
);

/**
 * Callable: getOrderRefundEligibility
 * Payload: { orderId: string }
 */
export const getOrderRefundEligibility = onCall(
  createGetOrderRefundEligibilityHandler({ db, assertAdmin, HttpsError })
);

/**
 * Callable: refundOrder
 * Payload: { orderId, amountMinor, reason, requestId }
 */
export const refundOrder = onCall(
  createRefundOrderHandler({ db, admin, logger, assertAdmin, HttpsError })
);
