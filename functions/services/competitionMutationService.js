import {
  getCompetitionMutationBlock,
  normalizeStatus,
} from "./ticketAdjustmentPolicy.js";

const PRIVILEGED_FIELDS = new Set([
  "status",
  "winner_ref",
  "winner_ticket_ref",
  "draw_started_at",
  "draw_task_id",
  "handover_details",
  "sold_tickets",
  "last_ticket_sequence",
  "participants",
  "stock_quantity",
  "created_at",
  "updated_at",
  "deleted_at",
]);

function invalidArgument(HttpsError, message) {
  throw new HttpsError("invalid-argument", message);
}

function requireFields(fields, HttpsError) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    invalidArgument(HttpsError, "fields must be an object.");
  }

  const privileged = Object.keys(fields).filter((key) => PRIVILEGED_FIELDS.has(key));
  if (privileged.length > 0) {
    invalidArgument(
      HttpsError,
      `Privileged competition fields cannot be updated through this operation: ${privileged.join(", ")}.`
    );
  }

  return fields;
}

function buildFieldUpdates(fields, HttpsError) {
  const updates = {};

  for (const key of ["title", "description", "category", "tag", "prize_name", "instagram_live_url"]) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      updates[key] = String(fields[key] || "").trim();
    }
  }

  for (const key of ["ticket_price", "prize_value"]) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      const value = Number(fields[key]);
      if (!Number.isFinite(value) || value < 0) {
        invalidArgument(HttpsError, `${key} must be a non-negative number.`);
      }
      updates[key] = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, "total_tickets")) {
    const totalTickets = Number(fields.total_tickets);
    if (!Number.isInteger(totalTickets) || totalTickets < 0) {
      invalidArgument(HttpsError, "total_tickets must be a non-negative integer.");
    }
    updates.total_tickets = totalTickets;
  }

  if (Object.prototype.hasOwnProperty.call(fields, "included_things")) {
    if (!Array.isArray(fields.included_things)) {
      invalidArgument(HttpsError, "included_things must be an array.");
    }
    updates.included_things = fields.included_things
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (Object.prototype.hasOwnProperty.call(fields, "image")) {
    if (!Array.isArray(fields.image) || fields.image.some((item) => typeof item !== "string")) {
      invalidArgument(HttpsError, "image must be an array of strings.");
    }
    updates.image = fields.image;
  }

  if (Object.prototype.hasOwnProperty.call(fields, "is_featured")) {
    updates.is_featured = fields.is_featured === true;
  }

  return updates;
}

function resolveStatus(existingStatus, { isDraft, totalTickets, soldTickets }, HttpsError) {
  const status = normalizeStatus(existingStatus);

  if (!existingStatus) {
    return isDraft ? "draft" : "active";
  }

  if (status === "draft") {
    if (isDraft) return "draft";
    if (totalTickets === 0 || totalTickets <= soldTickets) return "sold_out";
    return "active";
  }

  if (status === "active" || status === "sold_out" || status === "paused") {
    if (isDraft) {
      throw new HttpsError(
        "failed-precondition",
        "A published competition cannot be moved back to draft."
      );
    }
    if (totalTickets === 0 || totalTickets <= soldTickets) return "sold_out";
    return status === "paused" ? "paused" : "active";
  }

  throw new HttpsError(
    "failed-precondition",
    "Competition details cannot be changed after the draw has started or the competition has closed."
  );
}

export function createSaveCompetitionHandler({ db, admin, logger, assertAdmin, HttpsError }) {
  return async function handleSaveCompetition(request) {
    const adminUid = await assertAdmin(request);
    const data = request.data || {};
    const competitionId = data.competitionId;
    const isDraft = data.isDraft === true;

    if (
      competitionId !== undefined &&
      competitionId !== null &&
      (typeof competitionId !== "string" || !competitionId.trim())
    ) {
      invalidArgument(HttpsError, "competitionId must be a non-empty string when provided.");
    }

    const fields = requireFields(data.fields, HttpsError);
    const fieldUpdates = buildFieldUpdates(fields, HttpsError);

    if (Object.prototype.hasOwnProperty.call(data, "draw_date_millis")) {
      if (data.draw_date_millis !== null) {
        const millis = Number(data.draw_date_millis);
        if (!Number.isFinite(millis)) {
          invalidArgument(HttpsError, "draw_date_millis must be a valid timestamp or null.");
        }
        fieldUpdates.draw_date = new Date(millis);
      } else {
        fieldUpdates.draw_date = null;
      }
    }

    const normalizedCompetitionId =
      typeof competitionId === "string" ? competitionId.trim() : null;
    const competitionRef = normalizedCompetitionId
      ? db.collection("competition").doc(normalizedCompetitionId)
      : db.collection("competition").doc();

    const result = await db.runTransaction(async (transaction) => {
      const competitionSnap = await transaction.get(competitionRef);
      const exists = competitionSnap.exists;
      const currentData = exists ? competitionSnap.data() : null;

      if (exists) {
        const block = getCompetitionMutationBlock(currentData);
        if (block) {
          throw new HttpsError("failed-precondition", block);
        }
      }

      const currentStatus = currentData?.status;
      const currentTotalTickets = Number(currentData?.total_tickets || 0);
      const totalTickets = Object.prototype.hasOwnProperty.call(fieldUpdates, "total_tickets")
        ? fieldUpdates.total_tickets
        : currentTotalTickets;
      const soldTickets = Number(currentData?.sold_tickets || 0);

      if (exists && totalTickets !== currentTotalTickets) {
        if (!Number.isInteger(soldTickets) || soldTickets < 0) {
          throw new HttpsError(
            "failed-precondition",
            "Competition sold_tickets is malformed, so capacity cannot be updated safely."
          );
        }
        if (totalTickets < soldTickets) {
          throw new HttpsError(
            "failed-precondition",
            `total_tickets cannot be reduced below the ${soldTickets} ticket(s) already issued.`
          );
        }
        fieldUpdates.stock_quantity = totalTickets - soldTickets;
      }

      const status = resolveStatus(
        currentStatus,
        { isDraft, totalTickets, soldTickets },
        HttpsError
      );
      const now = admin.firestore.FieldValue.serverTimestamp();

      if (!exists) {
        transaction.set(competitionRef, {
          ...fieldUpdates,
          status,
          stock_quantity: totalTickets,
          sold_tickets: 0,
          last_ticket_sequence: 0,
          participants: [],
          created_at: now,
          updated_at: now,
        });
      } else {
        transaction.update(competitionRef, {
          ...fieldUpdates,
          status,
          sub_title: admin.firestore.FieldValue.delete(),
          updated_at: now,
        });
      }

      const transitionedToActive =
        (!exists && !isDraft) ||
        (exists && normalizeStatus(currentStatus) === "draft" && status !== "draft");

      if (transitionedToActive && data.notifyOnPublish === true) {
        const notificationRef = db.collection("ff_push_notifications").doc();
        transaction.set(notificationRef, {
          initial_page_name: "Competitions",
          notification_text: `A new competition for ${fieldUpdates.prize_name || fieldUpdates.title || "a prize"} is now live! Join now.`,
          notification_title: "New Competition Launched! 🚀",
          num_sent: 0,
          parameter_data: JSON.stringify({
            compitation: competitionRef.path,
            competition_ref: competitionRef.path,
            competitionId: competitionRef.id,
          }),
          status: "",
          target_audience: "All",
          timestamp: now,
          user_refs: "",
        });
      }

      return {
        success: true,
        competitionId: competitionRef.id,
        status,
        isNew: !exists,
        transitionedToActive,
      };
    });

    logger.info(
      `[saveAdminCompetition] admin=${adminUid} competition=${result.competitionId} status=${result.status} isNew=${result.isNew}`
    );

    return result;
  };
}

export function createDeleteCompetitionHandler({ db, admin, logger, assertAdmin, HttpsError }) {
  return async function handleDeleteCompetition(request) {
    const adminUid = await assertAdmin(request);
    const { competitionId, deleteQuestions = false } = request.data || {};

    if (!competitionId || typeof competitionId !== "string" || !competitionId.trim()) {
      invalidArgument(HttpsError, "competitionId is required.");
    }
    if (typeof deleteQuestions !== "boolean") {
      invalidArgument(HttpsError, "deleteQuestions must be a boolean when provided.");
    }

    const normalizedCompetitionId = competitionId.trim();
    const competitionRef = db.collection("competition").doc(normalizedCompetitionId);

    const result = await db.runTransaction(async (transaction) => {
      const competitionSnap = await transaction.get(competitionRef);
      if (!competitionSnap.exists) {
        throw new HttpsError("not-found", "Competition not found.");
      }

      const competitionData = competitionSnap.data();
      const isAlreadyDeleted = normalizeStatus(competitionData.status) === "deleted";

      if (!isAlreadyDeleted) {
        const block = getCompetitionMutationBlock(competitionData);
        if (block) {
          throw new HttpsError("failed-precondition", block);
        }
      }

      let questionsDeleted = 0;
      if (deleteQuestions) {
        const questionsSnap = await transaction.get(
          db.collection("questions").where("competition_id", "==", competitionRef)
        );
        if (questionsSnap.docs.length > 400) {
          throw new HttpsError(
            "failed-precondition",
            "This competition has too many questions to delete atomically. No changes were made."
          );
        }
        questionsSnap.docs.forEach((questionDoc) => {
          transaction.delete(questionDoc.ref);
        });
        questionsDeleted = questionsSnap.docs.length;
      }

      if (!isAlreadyDeleted) {
        const now = admin.firestore.FieldValue.serverTimestamp();
        transaction.update(competitionRef, {
          status: "deleted",
          updated_at: now,
        });
      }

      return {
        success: true,
        competitionId: normalizedCompetitionId,
        status: "deleted",
        idempotentReplay: isAlreadyDeleted,
        questionsDeleted,
      };
    });

    logger.info(
      `[deleteAdminCompetition] admin=${adminUid} competition=${normalizedCompetitionId} idempotent=${result.idempotentReplay}`
    );

    return result;
  };
}
