export const REVOKE_MAX_IDS = 5000;
export const REVOKE_PREVALIDATION_GROUP = 500;
export const REVOKE_MAX_CREDITS_PER_CHUNK = 250;
export const REVOKE_TYPE = "admin_bonus";

function hasSupportedCreditValue(data) {
  return typeof data?.reward_value === "number" &&
    Number.isInteger(data.reward_value) &&
    data.reward_value === 1;
}

function inspectCreditState(data) {
  // Existing grant/referral writers omit reward_revoked for active credits;
  // absence therefore retains the established meaning of false. A present
  // non-boolean value remains malformed and is never treated as eligible.
  const rewardRevoked = data?.reward_revoked === undefined ? false : data.reward_revoked;
  if (typeof data?.reward_issued !== "boolean" || typeof rewardRevoked !== "boolean") {
    return { state: "invalid", problem: "credit has malformed issuance/revocation flags" };
  }
  if (data.reward_issued && rewardRevoked) {
    return { state: "invalid", problem: "credit has contradictory issued and revoked flags" };
  }
  if (data.reward_issued) return { state: "redeemed" };
  if (rewardRevoked) return { state: "revoked" };
  return { state: "eligible" };
}

function buildRevokeAbort(type, message, meta = {}) {
  return Object.assign(new Error(message), { __revokeAbortType: type, __meta: meta });
}

/**
 * Builds the revokeAdminBonus callable handler with injected dependencies so the
 * transaction/accounting logic can be exercised without Firebase credentials.
 *
 * The backend is authoritative for eligibility. Every submitted credit ID is
 * attributed exactly once across the response counters.
 */
export function createRevokeAdminBonusHandler({ db, admin, logger, assertAdmin, HttpsError }) {
  return async function handleRevokeAdminBonus(request) {
    const adminUid = await assertAdmin(request);

    const { userId, creditIds, reason } = request.data || {};

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }
    const reasonText = typeof reason === "string" ? reason.trim() : "";
    if (!reasonText) {
      throw new HttpsError("invalid-argument", "A reason is required to revoke credits.");
    }
    if (!Array.isArray(creditIds) || creditIds.length === 0) {
      throw new HttpsError("invalid-argument", "creditIds must be a non-empty array.");
    }
    if (creditIds.length > REVOKE_MAX_IDS) {
      throw new HttpsError("invalid-argument", `Maximum ${REVOKE_MAX_IDS} credits per revocation request.`);
    }
    if (creditIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new HttpsError("invalid-argument", "creditIds must contain non-empty string values.");
    }

    const uniqueIds = [...new Set(creditIds.map((id) => id.trim()))];
    if (uniqueIds.length === 0) {
      throw new HttpsError("invalid-argument", "No valid credit IDs remain after deduplication.");
    }

    const userRef = db.collection("user").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    const adminRef = db.collection("user").doc(adminUid);

    const chunkPlan = [];
    for (let i = 0; i < uniqueIds.length; i += REVOKE_MAX_CREDITS_PER_CHUNK) {
      chunkPlan.push(uniqueIds.slice(i, i + REVOKE_MAX_CREDITS_PER_CHUNK));
    }

    // Read-only prevalidation (<=500 reads per round, no writes). Any invalid ID
    // rejects the entire request before the first mutation.
    const invalidCredits = [];
    const eligibleSet = new Set();
    const redeemedBeforePrevalidation = new Set();
    const revokedBeforePrevalidation = new Set();
    for (let i = 0; i < uniqueIds.length; i += REVOKE_PREVALIDATION_GROUP) {
      const groupIds = uniqueIds.slice(i, i + REVOKE_PREVALIDATION_GROUP);
      const groupSnaps = await Promise.all(
        groupIds.map((id) => db.collection("referrals").doc(id).get())
      );
      groupIds.forEach((id, idx) => {
        const snap = groupSnaps[idx];
        const data = snap.exists ? snap.data() : null;
        let problem = null;
        if (!snap.exists) {
          problem = "credit not found";
        } else if (data.referrer_id?.path !== userRef.path) {
          problem = "credit belongs to another user";
        } else if ((data.reward_type || "") !== REVOKE_TYPE) {
          problem = "credit is not an admin bonus credit";
        } else if (!hasSupportedCreditValue(data)) {
          problem = "credit has unsupported reward_value; expected 1";
        } else {
          const state = inspectCreditState(data);
          if (state.state === "invalid") {
            problem = state.problem;
          } else if (state.state === "redeemed") {
            redeemedBeforePrevalidation.add(id);
          } else if (state.state === "revoked") {
            revokedBeforePrevalidation.add(id);
          } else {
            eligibleSet.add(id);
          }
        }
        if (problem) invalidCredits.push({ id, problem });
      });
    }

    if (invalidCredits.length > 0) {
      const listed = invalidCredits.slice(0, 25).map((x) => `${x.id}: ${x.problem}`).join("; ");
      throw new HttpsError(
        "failed-precondition",
        `Revocation rejected before any changes were made (${invalidCredits.length} invalid credit ID(s)): ${listed}${invalidCredits.length > 25 ? "; ..." : ""}`
      );
    }

    // Attempt-level exact accounting. Every submitted ID is attributed exactly once:
    //   committedRevokedIds  -> revoked by this invocation
    //   windowRedeemedIds    -> eligible at prevalidation, redeemed before its chunk read it (skip)
    //   windowRevokedIds     -> eligible at prevalidation, already revoked when its chunk read it (skip)
    //   redeemedBeforePrevalidation / revokedBeforePrevalidation -> skipped prevalidation-level
    // Chunks that never classified (operational failure / never attempted) leave their
    // credits in the prevalidation classification untouched.
    const committedRevokedIds = new Set();
    const windowRedeemedIds = new Set();
    const windowRevokedIds = new Set();
    const stateChangeInvalidIds = new Set();
    const stateChanges = [];
    let driftDetected = false;
    let driftObservedBalance = null;
    let stateChangeFailed = false;
    let balanceInvalid = false;
    let operationalError = null;

    for (let i = 0; i < chunkPlan.length; i++) {
      const chunkIds = chunkPlan[i];

      try {
        const chunkResult = await db.runTransaction(async (transaction) => {
          const creditSnaps = await Promise.all(
            chunkIds.map((id) => transaction.get(db.collection("referrals").doc(id)))
          );

          const toRevoke = [];
          const chunkStateChanges = [];
          const chunkRedeemedIds = [];
          const chunkRevokedIds = [];

          creditSnaps.forEach((snap, idx) => {
            const id = chunkIds[idx];
            const data = snap.exists ? snap.data() : null;
            if (!snap.exists) {
              chunkStateChanges.push({ id, problem: "credit missing after prevalidation" });
              return;
            }
            if (data.referrer_id?.path !== userRef.path) {
              chunkStateChanges.push({ id, problem: "credit ownership changed after prevalidation" });
              return;
            }
            if ((data.reward_type || "") !== REVOKE_TYPE) {
              chunkStateChanges.push({ id, problem: "credit reward type changed after prevalidation" });
              return;
            }
            if (!hasSupportedCreditValue(data)) {
              chunkStateChanges.push({ id, problem: "credit reward_value changed or is unsupported; expected 1" });
              return;
            }
            const state = inspectCreditState(data);
            if (state.state === "invalid") {
              chunkStateChanges.push({ id, problem: state.problem });
              return;
            }
            if (state.state === "redeemed") {
              chunkRedeemedIds.push(id);
              return;
            }
            if (state.state === "revoked") {
              chunkRevokedIds.push(id);
              return;
            }
            toRevoke.push(snap.ref);
          });

          const freshUserSnap = await transaction.get(userRef);
          if (!freshUserSnap.exists) {
            throw buildRevokeAbort("state_change", "The target user document no longer exists.", {
              changes: [{ id: userId, problem: "user document missing after prevalidation" }],
              eligible: toRevoke.length,
              redeemedIds: chunkRedeemedIds,
              revokedIds: chunkRevokedIds,
            });
          }

          if (chunkStateChanges.length > 0) {
            throw buildRevokeAbort("state_change", "Credit state changed after prevalidation.", {
              changes: chunkStateChanges,
              eligible: toRevoke.length,
              redeemedIds: chunkRedeemedIds,
              revokedIds: chunkRevokedIds,
            });
          }

          if (toRevoke.length === 0) {
            return { revokedIds: [], eligible: 0, redeemedIds: chunkRedeemedIds, priorRevokedIds: chunkRevokedIds };
          }

          // Balance must be a stored Firestore number that is finite, non-negative,
          // and sufficient. Malformed stored data must not be coerced into a
          // valid balance.
          const rawBalance = freshUserSnap.data()?.free_tickets;
          if (typeof rawBalance !== "number" || !Number.isFinite(rawBalance) || rawBalance < 0) {
            throw buildRevokeAbort("invalid_balance", `free_tickets balance invalid or inconsistent: refusing to decrement from stored value ${typeof rawBalance === "number" ? String(rawBalance) : JSON.stringify(rawBalance)}.`, {
              eligible: toRevoke.length,
              redeemedIds: chunkRedeemedIds,
              revokedIds: chunkRevokedIds,
            });
          }
          if (rawBalance < toRevoke.length) {
            throw buildRevokeAbort("drift", `free_tickets balance drift detected: observed ${rawBalance}, cannot support revoking ${toRevoke.length}.`, {
              observedBalance: rawBalance,
              eligible: toRevoke.length,
              redeemedIds: chunkRedeemedIds,
              revokedIds: chunkRevokedIds,
            });
          }

          const serverTs = admin.firestore.FieldValue.serverTimestamp();
          toRevoke.forEach((ref) => {
            transaction.update(ref, {
              reward_revoked: true,
              revoked_at: serverTs,
              revoked_by: adminRef,
              revoke_reason: reasonText,
            });
          });

          transaction.update(userRef, {
            free_tickets: admin.firestore.FieldValue.increment(-toRevoke.length),
            updated_at: serverTs,
          });

          return {
            revokedIds: toRevoke.map((r) => r.id),
            eligible: toRevoke.length,
            redeemedIds: chunkRedeemedIds,
            priorRevokedIds: chunkRevokedIds,
          };
        });

        chunkResult.revokedIds.forEach((id) => committedRevokedIds.add(id));
        (chunkResult.redeemedIds ?? []).forEach((id) => {
          if (eligibleSet.has(id)) windowRedeemedIds.add(id);
        });
        (chunkResult.priorRevokedIds ?? []).forEach((id) => {
          if (eligibleSet.has(id)) windowRevokedIds.add(id);
        });
      } catch (chunkErr) {
        const abortType = chunkErr?.__revokeAbortType;
        if (abortType === "state_change" || abortType === "drift" || abortType === "invalid_balance") {
          const meta = chunkErr.__meta ?? {};
          if (abortType === "drift") {
            driftDetected = true;
            driftObservedBalance = meta.observedBalance ?? null;
          } else if (abortType === "invalid_balance") {
            balanceInvalid = true;
          } else {
            stateChangeFailed = true;
          }
          (meta.redeemedIds ?? []).forEach((id) => {
            if (eligibleSet.has(id)) windowRedeemedIds.add(id);
          });
          (meta.revokedIds ?? []).forEach((id) => {
            if (eligibleSet.has(id)) windowRevokedIds.add(id);
          });
          (meta.changes ?? []).forEach((change) => {
            stateChanges.push(change);
            if (change?.id && eligibleSet.has(change.id)) stateChangeInvalidIds.add(change.id);
          });
          if (driftObservedBalance !== null) {
            logger.warn(`[revokeAdminBonus] drift: observed free_tickets=${driftObservedBalance} for user=${userId}`);
          }
          if (balanceInvalid) {
            logger.error(`[revokeAdminBonus] invalid balance refused for user=${userId}`);
          }
          // Conflicting state or balance requires intervention. Stop attempting
          // later chunks so the response reflects exactly what committed.
          break;
        }
        operationalError = chunkErr;
        if (committedRevokedIds.size === 0) {
          logger.error("[revokeAdminBonus] First chunk failed with no prior committed chunks:", chunkErr?.message || chunkErr);
          throw new HttpsError(
            "aborted",
            `No credits were revoked: the first chunk failed (${chunkErr?.message || "unknown transaction error"}). You can safely retry.`
          );
        }
        logger.error("[revokeAdminBonus] Chunk failed after committing earlier chunks:", chunkErr?.message || chunkErr);
        break;
      }
    }

    const skippedRedeemed = redeemedBeforePrevalidation.size + windowRedeemedIds.size;
    const skippedRevoked = revokedBeforePrevalidation.size + windowRevokedIds.size;
    const remainingCount = Math.max(
      0,
      eligibleSet.size -
        committedRevokedIds.size -
        windowRedeemedIds.size -
        windowRevokedIds.size -
        stateChangeInvalidIds.size
    );
    const complete =
      remainingCount === 0 &&
      !driftDetected &&
      !stateChangeFailed &&
      !balanceInvalid &&
      !operationalError;
    const newlyRevoked = committedRevokedIds.size;
    // A non-credit state change (e.g. the user document disappeared) cannot be
    // fixed by resubmitting the same credit IDs.
    const hasUnretryableStateChange = stateChanges.some((change) => !eligibleSet.has(change?.id));
    const retryable =
      remainingCount > 0 &&
      !driftDetected &&
      !balanceInvalid &&
      !hasUnretryableStateChange;
    const retryableCreditIds = [...eligibleSet].filter((id) =>
      !committedRevokedIds.has(id) &&
      !windowRedeemedIds.has(id) &&
      !windowRevokedIds.has(id) &&
      !stateChangeInvalidIds.has(id)
    );
    // retryableCreditIds is a response-time candidate set derived from the
    // prevalidation and attempted-chunk classifications. It is not a claim
    // about the live state of unprocessed chunks; every retry re-runs the same
    // backend validation and transaction checks before mutating anything.
    const outcome = complete
      ? "complete"
      : newlyRevoked > 0
        ? "partial"
        : "blocked";
    const success = outcome === "complete";

    let message;
    if (complete) {
      message = newlyRevoked > 0
        ? `Revoked ${newlyRevoked} credit${newlyRevoked !== 1 ? "s" : ""} successfully.`
        : "No credits needed to be revoked; the requested credits are already redeemed or revoked.";
    } else if (newlyRevoked > 0) {
      message = `Partial completion: ${newlyRevoked} of ${eligibleSet.size} eligible credit(s) revoked.`;
    } else {
      message = "No credits were revoked in this request.";
    }

    if (driftDetected) {
      message += ` free_tickets balance drift detected${driftObservedBalance !== null ? ` (observed ${driftObservedBalance})` : ""}; the balance requires reconciliation before the remaining ${remainingCount} credit(s) can be safely revoked.`;
    }
    if (balanceInvalid) {
      message += " The stored free_tickets balance is invalid; revocation stopped without any decrement. Resolve the balance and retry after reconciliation.";
    }
    if (stateChangeFailed) {
      if (stateChangeInvalidIds.size > 0) {
        message += ` ${stateChangeInvalidIds.size} credit(s) failed state validation and are excluded from retry.`;
      } else {
        message += ` Credit state changed after prevalidation (${stateChanges[0]?.problem || "unknown reason"}).`;
      }
    }
    if (operationalError) {
      message += ` A later chunk failed; the remaining ${remainingCount} credit(s) can be retried.`;
    } else if (!driftDetected && !balanceInvalid && remainingCount > 0) {
      message += ` The remaining ${remainingCount} credit(s) remain revocable on retry.`;
    }
    if (skippedRedeemed > 0) {
      message += ` Skipped ${skippedRedeemed} credit(s) already redeemed into competition tickets.`;
    }
    if (skippedRevoked > 0) {
      message += ` Skipped ${skippedRevoked} credit(s) already revoked.`;
    }

    logger.info(
      `[revokeAdminBonus] Admin ${adminUid} newly revoked ${newlyRevoked} credit(s) for user=${userId} (skippedRevoked=${skippedRevoked}, complete=${complete})`
    );

    return {
      success,
      complete,
      outcome,
      message,
      revokedCount: newlyRevoked,
      eligibleCount: eligibleSet.size,
      remainingCount,
      retryable,
      retryableCreditIds,
      skippedRedeemed,
      skippedRevoked,
      drift: driftDetected,
      driftObservedBalance,
      balanceInvalid,
      stateChangeCount: stateChangeInvalidIds.size,
      stateChanges,
    };
  };
}
