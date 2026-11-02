import {
  getCompetitionMutationBlock,
  getDrawDateState,
  getReferenceId,
  normalizeStatus,
} from "./ticketAdjustmentPolicy.js";

const MAX_QUESTION_MUTATIONS = 400;

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

function normalizeQuestionId(value, HttpsError) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    invalidArgument(HttpsError, "Question ids must be strings when provided.");
  }

  const id = value.trim();
  if (!id || id === "." || id === ".." || id.includes("/")) {
    invalidArgument(HttpsError, "Question ids must be valid non-empty document ids.");
  }
  return id;
}

function normalizeQuestionPayload(question, index, HttpsError) {
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    invalidArgument(HttpsError, `questions[${index}] must be an object.`);
  }

  const questionText = String(question.question ?? "").trim();
  if (!questionText) {
    invalidArgument(HttpsError, `questions[${index}].question is required.`);
  }

  const images = question.images === undefined ? [] : question.images;
  if (!Array.isArray(images) || images.some((image) => typeof image !== "string")) {
    invalidArgument(HttpsError, `questions[${index}].images must be an array of strings.`);
  }

  if (!Array.isArray(question.option) || question.option.length < 2) {
    invalidArgument(HttpsError, `questions[${index}].option must contain at least two options.`);
  }

  const optionIds = new Set();
  const options = question.option.map((option, optionIndex) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      invalidArgument(
        HttpsError,
        `questions[${index}].option[${optionIndex}] must be an object.`
      );
    }

    const optionId = String(option.option_id ?? "").trim();
    const optionText = String(option.option ?? "").trim();
    if (!optionId || !optionText) {
      invalidArgument(
        HttpsError,
        `questions[${index}].option[${optionIndex}] requires option_id and option.`
      );
    }
    if (optionIds.has(optionId)) {
      invalidArgument(HttpsError, `questions[${index}] contains duplicate option ids.`);
    }

    optionIds.add(optionId);
    return { option_id: optionId, option: optionText };
  });

  const answer = question.answer;
  if (
    !answer ||
    typeof answer !== "object" ||
    Array.isArray(answer) ||
    typeof answer.option_id === "undefined" ||
    answer.option_id === null
  ) {
    invalidArgument(HttpsError, `questions[${index}].answer.option_id is required.`);
  }

  const answerOptionId = String(answer.option_id).trim();
  const answerOption = options.find((option) => option.option_id === answerOptionId);
  if (!answerOption) {
    invalidArgument(
      HttpsError,
      `questions[${index}].answer.option_id must match one of its options.`
    );
  }

  return {
    id: normalizeQuestionId(question.id, HttpsError),
    data: {
      question: questionText,
      images,
      option: options,
      answer: {
        option_id: answerOption.option_id,
        option: answerOption.option,
      },
    },
  };
}

function normalizeQuestionMutation(data, HttpsError) {
  const hasQuestions = Object.prototype.hasOwnProperty.call(data, "questions");
  const replaceQuestions = data.replaceQuestions === true;

  if (
    data.replaceQuestions !== undefined &&
    typeof data.replaceQuestions !== "boolean"
  ) {
    invalidArgument(HttpsError, "replaceQuestions must be a boolean when provided.");
  }

  if (!hasQuestions) {
    if (replaceQuestions) {
      invalidArgument(HttpsError, "questions must be provided when replaceQuestions is true.");
    }
    return null;
  }

  if (!Array.isArray(data.questions)) {
    invalidArgument(HttpsError, "questions must be an array when provided.");
  }
  if (data.questions.length > MAX_QUESTION_MUTATIONS) {
    invalidArgument(
      HttpsError,
      `Maximum ${MAX_QUESTION_MUTATIONS} questions can be saved per request.`
    );
  }

  const seenIds = new Set();
  const questions = data.questions.map((question, index) => {
    const normalized = normalizeQuestionPayload(question, index, HttpsError);
    if (normalized.id) {
      if (seenIds.has(normalized.id)) {
        invalidArgument(HttpsError, "Question ids must not contain duplicates.");
      }
      seenIds.add(normalized.id);
    }
    return normalized;
  });

  return { replaceQuestions, questions };
}

function assertDrawDateNotReopened(currentData, fieldUpdates, nowMillis, HttpsError) {
  if (!Object.prototype.hasOwnProperty.call(fieldUpdates, "draw_date")) {
    return;
  }

  const currentDrawDate = getDrawDateState(currentData?.draw_date);
  if (
    !currentDrawDate.present ||
    !currentDrawDate.valid ||
    currentDrawDate.millis > nowMillis
  ) {
    return;
  }

  const nextDrawDate = getDrawDateState(fieldUpdates.draw_date);
  const unchanged =
    nextDrawDate.present &&
    nextDrawDate.valid &&
    nextDrawDate.millis === currentDrawDate.millis;

  if (!unchanged) {
    throw new HttpsError(
      "failed-precondition",
      "The draw date has already passed and cannot be changed through ordinary editing. No changes were made."
    );
  }
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

    const questionMutation = normalizeQuestionMutation(data, HttpsError);
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
        assertDrawDateNotReopened(currentData, fieldUpdates, Date.now(), HttpsError);
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
      const questionUpdates = [];
      const questionCreates = [];
      const questionDeletes = [];
      let questionsSaved = 0;

      if (questionMutation) {
        const providedQuestionIds = new Set(
          questionMutation.questions.filter((question) => question.id).map((question) => question.id)
        );
        const existingQuestionsById = new Map();

        if (questionMutation.replaceQuestions) {
          const questionsSnap = await transaction.get(
            db.collection("questions").where("competition_id", "==", competitionRef)
          );
          questionsSnap.docs.forEach((questionDoc) => {
            existingQuestionsById.set(questionDoc.id, questionDoc);
          });

          providedQuestionIds.forEach((questionId) => {
            if (!existingQuestionsById.has(questionId)) {
              throw new HttpsError(
                "failed-precondition",
                "A supplied question id does not belong to this competition. No changes were made."
              );
            }
          });

          const newQuestionCount = questionMutation.questions.filter(
            (question) => !question.id
          ).length;
          if (existingQuestionsById.size + newQuestionCount > MAX_QUESTION_MUTATIONS) {
            throw new HttpsError(
              "failed-precondition",
              `This question replacement would exceed the ${MAX_QUESTION_MUTATIONS}-question mutation limit. No changes were made.`
            );
          }

          existingQuestionsById.forEach((questionDoc, questionId) => {
            if (!providedQuestionIds.has(questionId)) {
              questionDeletes.push(questionDoc.ref);
            }
          });
        } else {
          const questionIds = Array.from(providedQuestionIds);
          const questionSnaps = await Promise.all(
            questionIds.map((questionId) =>
              transaction.get(db.collection("questions").doc(questionId))
            )
          );

          questionSnaps.forEach((questionSnap, index) => {
            if (!questionSnap.exists) {
              throw new HttpsError(
                "failed-precondition",
                "A supplied question no longer exists. No changes were made."
              );
            }
            const questionData = questionSnap.data();
            if (getReferenceId(questionData?.competition_id) !== competitionRef.id) {
              throw new HttpsError(
                "failed-precondition",
                "A supplied question does not belong to this competition. No changes were made."
              );
            }
            existingQuestionsById.set(questionIds[index], questionSnap);
          });
        }

        questionMutation.questions.forEach((question) => {
          if (question.id) {
            const questionSnap = existingQuestionsById.get(question.id);
            questionUpdates.push({ ref: questionSnap.ref, data: question.data });
          } else {
            questionCreates.push({
              ref: db.collection("questions").doc(),
              data: question.data,
            });
          }
        });

        if (
          questionUpdates.length + questionCreates.length + questionDeletes.length >
          MAX_QUESTION_MUTATIONS
        ) {
          throw new HttpsError(
            "failed-precondition",
            `This save would exceed the ${MAX_QUESTION_MUTATIONS}-question mutation limit. No changes were made.`
          );
        }

        questionsSaved = questionUpdates.length + questionCreates.length;
      }

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

      questionDeletes.forEach((questionRef) => {
        transaction.delete(questionRef);
      });
      questionUpdates.forEach(({ ref, data: questionData }) => {
        transaction.update(ref, questionData);
      });
      questionCreates.forEach(({ ref, data: questionData }) => {
        transaction.set(ref, {
          ...questionData,
          competition_id: competitionRef,
          question_id: ref.id,
          created_at: now,
        });
      });

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
        questionsSaved,
        questionsDeleted: questionDeletes.length,
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

        const soldTickets =
          competitionData.sold_tickets === undefined || competitionData.sold_tickets === null
            ? 0
            : Number(competitionData.sold_tickets);
        const lastTicketSequence =
          competitionData.last_ticket_sequence === undefined ||
          competitionData.last_ticket_sequence === null
            ? 0
            : Number(competitionData.last_ticket_sequence);
        if (
          !Number.isInteger(soldTickets) ||
          soldTickets < 0 ||
          !Number.isInteger(lastTicketSequence) ||
          lastTicketSequence < 0
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Competition capacity or ticket sequence is malformed, so deletion cannot be verified safely."
          );
        }
        if (soldTickets > 0 || lastTicketSequence > 0) {
          throw new HttpsError(
            "failed-precondition",
            "Competition has sold tickets and cannot be deleted."
          );
        }
      }

      let questionsDeleted = 0;
      if (deleteQuestions) {
        const questionsSnap = await transaction.get(
          db.collection("questions").where("competition_id", "==", competitionRef)
        );
        if (questionsSnap.docs.length > MAX_QUESTION_MUTATIONS) {
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
