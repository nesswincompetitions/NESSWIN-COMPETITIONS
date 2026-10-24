export const INVALIDATION_MAX_TICKETS = 400;

const PROTECTED_COMPETITION_STATUSES = new Set([
  "drawing",
  "winner_announced",
  "completed",
  "end",
  "closed",
]);

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getReferenceId(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const parts = value.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
  }
  return value.id || null;
}

function isWinnerTicket(data) {
  return data?.is_winner === true || normalizeStatus(data?.status) === "winner";
}

function competitionHasFinality(data) {
  return PROTECTED_COMPETITION_STATUSES.has(normalizeStatus(data?.status)) ||
    Boolean(data?.winner_ref) ||
    Boolean(data?.winner_ticket_ref);
}

function ticketBelongsToUser(data, userId) {
  return [data?.user_id, data?.user_ref, data?.user]
    .some((value) => getReferenceId(value) === userId);
}

function ticketBelongsToCompetition(data, competitionId) {
  return getReferenceId(data?.competition_id) === competitionId;
}

async function fetchUserTicketDocs(db, userId, userRef) {
  const queries = [
    db.collection("ticket").where("user_id", "==", userRef).get(),
    db.collection("ticket").where("user_id", "==", userId).get(),
    db.collection("ticket").where("user_id", "==", `/user/${userId}`).get(),
    db.collection("ticket").where("user_ref", "==", userRef).get(),
    db.collection("ticket").where("user", "==", userRef).get(),
  ];

  const snapshots = await Promise.all(queries);
  const uniqueDocs = new Map();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnap) => {
      if (!uniqueDocs.has(docSnap.id)) {
        uniqueDocs.set(docSnap.id, docSnap);
      }
    });
  });

  return Array.from(uniqueDocs.values());
}

export function createInvalidateUserCompetitionTicketsHandler({
  db,
  admin,
  logger,
  assertAdmin,
  HttpsError,
}) {
  return async function handleInvalidateUserCompetitionTickets(request) {
    const adminUid = await assertAdmin(request);
    const { userId, competitionId, reason } = request.data || {};

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required.");
    }
    if (!competitionId || typeof competitionId !== "string") {
      throw new HttpsError("invalid-argument", "competitionId is required.");
    }
    const reasonText = typeof reason === "string" ? reason.trim() : "";
    if (!reasonText) {
      throw new HttpsError("invalid-argument", "A reason is required to invalidate tickets.");
    }

    const userRef = db.collection("user").doc(userId);
    const competitionRef = db.collection("competition").doc(competitionId);
    const adminRef = db.collection("user").doc(adminUid);

    const [userSnap, competitionSnap] = await Promise.all([
      userRef.get(),
      competitionRef.get(),
    ]);

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    if (!competitionSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }
    if (competitionHasFinality(competitionSnap.data())) {
      throw new HttpsError(
        "failed-precondition",
        "Tickets cannot be invalidated after the draw has started or a winner has been declared."
      );
    }

    const userTicketDocs = await fetchUserTicketDocs(db, userId, userRef);
    const relevantTickets = userTicketDocs.filter((docSnap) =>
      ticketBelongsToCompetition(docSnap.data(), competitionId)
    );

    if (relevantTickets.length > INVALIDATION_MAX_TICKETS) {
      throw new HttpsError(
        "failed-precondition",
        `This user has ${relevantTickets.length} tickets in this competition. The safe limit for one invalidation request is ${INVALIDATION_MAX_TICKETS}. No tickets were changed.`
      );
    }

    if (relevantTickets.length === 0) {
      return {
        success: true,
        complete: true,
        invalidatedCount: 0,
        alreadyInvalidCount: 0,
        cancelledCount: 0,
        skippedCount: 0,
        totalRelevantCount: 0,
        ticketIds: [],
        ticketSequences: [],
      };
    }

    const result = await db.runTransaction(async (transaction) => {
      const freshCompetitionSnap = await transaction.get(competitionRef);

      if (!freshCompetitionSnap.exists) {
        throw new HttpsError("not-found", "Competition not found.");
      }
      if (competitionHasFinality(freshCompetitionSnap.data())) {
        throw new HttpsError(
          "failed-precondition",
          "Tickets cannot be invalidated after the draw has started or a winner has been declared."
        );
      }

      const ticketSnaps = await Promise.all(
        relevantTickets.map((docSnap) => transaction.get(docSnap.ref))
      );

      const toInvalidate = [];
      const alreadyInvalid = [];
      const cancelled = [];
      const skipped = [];

      ticketSnaps.forEach((ticketSnap, index) => {
        const expectedDoc = relevantTickets[index];

        if (!ticketSnap.exists) {
          throw new HttpsError(
            "aborted",
            "A ticket changed while preparing this invalidation. No tickets were changed; retry the request."
          );
        }

        const ticketData = ticketSnap.data();

        if (
          !ticketBelongsToUser(ticketData, userId) ||
          !ticketBelongsToCompetition(ticketData, competitionId)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "A ticket no longer belongs to the selected user and competition. No tickets were changed."
          );
        }

        if (isWinnerTicket(ticketData)) {
          throw new HttpsError(
            "failed-precondition",
            "A winning ticket was found for this user. Winner tickets cannot be invalidated."
          );
        }

        const status = normalizeStatus(ticketData.status);
        if (status === "active") {
          toInvalidate.push({ ref: expectedDoc.ref, sequence: ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id });
        } else if (status === "invalid") {
          alreadyInvalid.push(ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id);
        } else if (status === "cancelled") {
          cancelled.push(ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id);
        } else {
          skipped.push(ticketData.ticket_sequence ?? ticketData.ticket_number ?? expectedDoc.id);
        }
      });

      if (toInvalidate.length === 0) {
        return {
          success: true,
          complete: true,
          invalidatedCount: 0,
          alreadyInvalidCount: alreadyInvalid.length,
          cancelledCount: cancelled.length,
          skippedCount: skipped.length,
          totalRelevantCount: ticketSnaps.length,
          ticketIds: [],
          ticketSequences: [],
        };
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      toInvalidate.forEach(({ ref }) => {
        transaction.update(ref, {
          status: "invalid",
          invalidated_at: now,
          invalidated_by: adminRef,
          invalidation_reason: reasonText,
          status_before_invalidation: "active",
          updated_at: now,
        });
      });

      return {
        success: true,
        complete: true,
        invalidatedCount: toInvalidate.length,
        alreadyInvalidCount: alreadyInvalid.length,
        cancelledCount: cancelled.length,
        skippedCount: skipped.length,
        totalRelevantCount: ticketSnaps.length,
        ticketIds: toInvalidate.map(({ ref }) => ref.id),
        ticketSequences: toInvalidate.map(({ sequence }) => sequence),
      };
    });

    logger.info(
      `[invalidateUserCompetitionTickets] admin=${adminUid} user=${userId} competition=${competitionId} invalidated=${result.invalidatedCount} alreadyInvalid=${result.alreadyInvalidCount} cancelled=${result.cancelledCount} skipped=${result.skippedCount}`
    );

    return result;
  };
}
