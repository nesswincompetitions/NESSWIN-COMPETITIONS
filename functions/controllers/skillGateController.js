import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Strips internal fields before sending a question to the client.
 * Correct answer MUST never leave the server.
 */
function sanitizeQuestion(doc) {
  const { answer: _answer, created_at: _createdAt, updated_at: _updatedAt, competition_id: _competitionId, ...safe } = doc.data();
  return { id: doc.id, ...safe };
}

/**
 * Callable: getSkillQuestion
 */
export const getSkillQuestion = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const uid = request.auth.uid;
  const { competitionId } = request.data;

  if (!competitionId || typeof competitionId !== "string") {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }

  const attemptDocId = `${uid}_${competitionId}`;
  const attemptRef = db.collection("skill_attempts").doc(attemptDocId);
  const userRef = db.collection("user").doc(uid);
  const compRef = db.collection("competition").doc(competitionId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const attemptSnap = await transaction.get(attemptRef);
      const questionsSnap = await db
        .collection("questions")
        .where("competition_id", "==", compRef)
        .get();

      if (questionsSnap.empty) {
        throw new HttpsError(
          "failed-precondition",
          "No skill questions are available for this competition. Please contact support."
        );
      }

      const allQuestions = questionsSnap.docs;

      if (attemptSnap.exists) {
        const attemptData = attemptSnap.data();
        if (attemptData.passed === true) {
          let passedQuestion = null;
          let questionId = attemptData.question_id?.id || null;

          if (attemptData.question_id) {
            const passedQuestionSnap = await transaction.get(attemptData.question_id);
            if (passedQuestionSnap.exists) {
              passedQuestion = sanitizeQuestion(passedQuestionSnap);
              questionId = passedQuestionSnap.id;
            }
          }

          return {
            passed: true,
            questionId,
            question: passedQuestion,
            answer: {
              option_id: attemptData.selected_option_id || '',
              option: attemptData.answer_given || '',
            },
          };
        }

        // EDGE CASE: Return SAME question to prevent refresh-cheating.
        if (attemptData.question_id) {
          const activeQuestionSnap = await transaction.get(attemptData.question_id);
          if (activeQuestionSnap.exists) {
            return {
              passed: false,
              question: sanitizeQuestion(activeQuestionSnap),
            };
          }

          // EDGE CASE: Question was deleted — clear stale ref
          transaction.update(attemptRef, {
            question_id: admin.firestore.FieldValue.delete(),
          });
        }
      }

      const existingData = attemptSnap.exists ? attemptSnap.data() : null;
      const liveQuestionIds = new Set(allQuestions.map((d) => d.id));

      // EDGE CASE: Admin reduced pool — filter non-existent refs
      const validShownRefs = (existingData?.shown_questions || []).filter(
        (ref) => liveQuestionIds.has(ref.id)
      );
      let shownPaths = validShownRefs.map((ref) => ref.path);
      let unseenDocs = allQuestions.filter((d) => !shownPaths.includes(d.ref.path));

      // EDGE CASE: All live questions exhausted — reset cycle
      if (unseenDocs.length === 0) {
        shownPaths = [];
        unseenDocs = allQuestions;
      }

      const selectedDoc = pickRandom(unseenDocs);
      const selectedRef = selectedDoc.ref;
      const finalShown = shownPaths.length === 0
        ? [selectedRef]
        : [...validShownRefs, selectedRef];

      const now = admin.firestore.FieldValue.serverTimestamp();

      if (!attemptSnap.exists) {
        transaction.set(attemptRef, {
          user_id: userRef,
          competition_id: compRef,
          question_id: selectedRef,
          answer_given: "",
          attempt_number: 0,
          attempted_at: now,
          passed: false,
          shown_questions: finalShown,
        });
      } else {
        transaction.update(attemptRef, {
          question_id: selectedRef,
          shown_questions: finalShown,
        });
      }

      return {
        passed: false,
        question: sanitizeQuestion(selectedDoc),
      };
    });

    return result;
  } catch (err) {
    logger.error("[getSkillQuestion] Error:", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", "Failed to load quiz question. Please try again.");
  }
});

/**
 * Callable: submitSkillAnswer
 */
export const submitSkillAnswer = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const uid = request.auth.uid;
  const { competitionId, selectedOptionId } = request.data;

  if (!competitionId || typeof competitionId !== "string") {
    throw new HttpsError("invalid-argument", "competitionId is required.");
  }
  if (selectedOptionId === null || selectedOptionId === undefined) {
    throw new HttpsError("invalid-argument", "selectedOptionId is required.");
  }

  const attemptDocId = `${uid}_${competitionId}`;
  const attemptRef = db.collection("skill_attempts").doc(attemptDocId);
  const userRef = db.collection("user").doc(uid);
  const compRef = db.collection("competition").doc(competitionId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const attemptSnap = await transaction.get(attemptRef);

      if (!attemptSnap.exists) {
        throw new HttpsError(
          "not-found",
          "No active quiz session found. Please refresh and start again."
        );
      }

      const attemptData = attemptSnap.data();

      // EDGE CASE: Idempotent success on double-submit
      if (attemptData.passed === true) {
        const questionId = attemptData.question_id?.id || null;
        return { passed: true, questionId };
      }

      if (!attemptData.question_id) {
        throw new HttpsError(
          "failed-precondition",
          "No active question. Please request a question first."
        );
      }

      const questionSnap = await transaction.get(attemptData.question_id);
      if (!questionSnap.exists) {
        throw new HttpsError(
          "not-found",
          "The question no longer exists. Please refresh and try again."
        );
      }

      const questionData = questionSnap.data();
      const correctOptionId = questionData.answer?.option_id;
      const passed = String(selectedOptionId) == String(correctOptionId);
      const now = admin.firestore.FieldValue.serverTimestamp();

      const selectedOption = questionData.option?.find(
        (opt) => String(opt.option_id) === String(selectedOptionId)
      );
      const answerGivenText = selectedOption
        ? selectedOption.option
        : String(selectedOptionId);

      if (!passed) {
        transaction.update(attemptRef, {
          answer_given: answerGivenText,
          selected_option_id: String(selectedOptionId),
          attempt_number: admin.firestore.FieldValue.increment(1),
          attempted_at: now,
          question_id: admin.firestore.FieldValue.delete(),
        });

        return { passed: false };
      }

      transaction.update(attemptRef, {
        passed: true,
        answer_given: answerGivenText,
        selected_option_id: String(selectedOptionId),
        attempt_number: admin.firestore.FieldValue.increment(1),
        attempted_at: now,
      });

      transaction.update(userRef, {
        competition_answered: admin.firestore.FieldValue.arrayUnion(compRef),
      });

      return {
        passed: true,
        questionId: questionSnap.id,
      };
    });

    return result;
  } catch (err) {
    logger.error("[submitSkillAnswer] Error:", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", "Failed to submit answer. Please try again.");
  }
});
