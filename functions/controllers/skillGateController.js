import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { admin, db } from "../config/firebaseAdmin.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Picks a random element from an array.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Strips the answer field and other internal fields before sending a question to the client.
 * IMPORTANT: The correct answer MUST never leave the server.
 */
function sanitizeQuestion(doc) {
  const { answer, created_at, updated_at, competition_id, ...safe } = doc.data();
  return { id: doc.id, ...safe };
}

// ─── getSkillQuestion ─────────────────────────────────────────────────────────

/**
 * Callable: getSkillQuestion
 *
 * Returns the next quiz question for a given user + competition pair.
 *
 * Edge cases handled:
 *  1. Already passed            → returns { passed: true }
 *  2. Active question exists     → returns SAME question (refresh-cheat prevention)
 *  3. Active question deleted    → clears stale ref, picks a fresh unseen question
 *  4. Admin shrinks pool         → filters shown_questions against live IDs before cycle
 *  5. No questions at all        → throws HttpsError("failed-precondition")
 *  6. All questions exhausted    → resets cycle and picks fresh
 *
 * Creates or merges a single  skill_attempts/{uid}_{competitionId}  document.
 *
 * @param {{ competitionId: string }} data
 * @returns {{ passed: boolean, question?: object }}
 */
export const getSkillQuestion = onCall(async (request) => {
  // ── Auth guard ────────────────────────────────────────────────────────────
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
      // ── READS (all reads before writes) ─────────────────────────────────

      const attemptSnap = await transaction.get(attemptRef);

      // Fetch all questions for this competition
      const questionsSnap = await db
        .collection("questions")
        .where("competition_id", "==", compRef)
        .get();

      // ── Edge case 5: No questions configured by admin ─────────────────────
      if (questionsSnap.empty) {
        throw new HttpsError(
          "failed-precondition",
          "No skill questions are available for this competition. Please contact support."
        );
      }

      const allQuestions = questionsSnap.docs; // array of QueryDocumentSnapshot

      // ── Guard: already passed ─────────────────────────────────────────────
      if (attemptSnap.exists) {
        const attemptData = attemptSnap.data();
        if (attemptData.passed === true) {
          return { passed: true };
        }

        // ── Edge case 2 & 3: active question set ─────────────────────────────
        // Return SAME question to prevent refresh-cheating.
        // If the question was deleted by admin, clear the stale ref and fall
        // through to pick a fresh one from the current pool.
        if (attemptData.question_id) {
          const activeQuestionSnap = await transaction.get(attemptData.question_id);
          if (activeQuestionSnap.exists) {
            // Question still live — enforce same question (anti-cheat)
            return {
              passed: false,
              question: sanitizeQuestion(activeQuestionSnap),
            };
          }

          // Edge case 3: question was deleted — clear stale ref so we pick a new one
          logger.warn(
            `[SkillGate] question_id ${attemptData.question_id.path} deleted for ${attemptDocId}. Picking fresh question.`
          );
          transaction.update(attemptRef, {
            question_id: admin.firestore.FieldValue.delete(),
          });
          // Fall through to the unseen-question picker below
        }
      }

      // ── Pick the next unseen question ─────────────────────────────────────
      const existingData = attemptSnap.exists ? attemptSnap.data() : null;

      // Current live question IDs (after admin may have added/removed questions)
      const liveQuestionIds = new Set(allQuestions.map((d) => d.id));

      // Edge case 4: Admin reduced the pool — filter out any refs that no longer exist
      // so they don't consume slots in the unseen cycle.
      const validShownRefs = (existingData?.shown_questions || []).filter(
        (ref) => liveQuestionIds.has(ref.id)
      );
      let shownPaths = validShownRefs.map((ref) => ref.path);

      // Determine the pool of unseen questions (from the current live set)
      let unseenDocs = allQuestions.filter((d) => !shownPaths.includes(d.ref.path));

      // Edge case 6: All live questions exhausted — reset the cycle
      if (unseenDocs.length === 0) {
        shownPaths = [];
        unseenDocs = allQuestions;
        logger.info(`[SkillGate] All questions exhausted for ${attemptDocId} — resetting cycle.`);
      }

      const selectedDoc = pickRandom(unseenDocs);
      const selectedRef = selectedDoc.ref;

      // When we cycled (shownPaths reset), start fresh with only the new pick.
      // Otherwise append the new pick to the (already-filtered) valid shown list.
      const finalShown = shownPaths.length === 0
        ? [selectedRef]
        : [...validShownRefs, selectedRef];

      // ── WRITE: upsert the skill_attempt doc ───────────────────────────────
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

// ─── submitSkillAnswer ────────────────────────────────────────────────────────

/**
 * Callable: submitSkillAnswer
 *
 * Grades the user's answer server-side (the correct answer NEVER leaves the server).
 *
 * On wrong answer:
 *   - Increments attempt_number
 *   - Updates answer_given and attempted_at
 *   - Returns { passed: false }
 *
 * On correct answer:
 *   - Sets passed=true
 *   - Sets question_id to the final passed question ref
 *   - Updates user.competition_answered with arrayUnion(compRef)
 *   - Returns { passed: true, questionId: string }
 *
 * @param {{ competitionId: string, selectedOptionId: string | number }} data
 * @returns {{ passed: boolean, questionId?: string }}
 */
export const submitSkillAnswer = onCall(async (request) => {
  // ── Auth guard ────────────────────────────────────────────────────────────
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
      // ── READS ────────────────────────────────────────────────────────────
      const attemptSnap = await transaction.get(attemptRef);

      if (!attemptSnap.exists) {
        throw new HttpsError(
          "not-found",
          "No active quiz session found. Please refresh and start again."
        );
      }

      const attemptData = attemptSnap.data();

      // Edge case 3 (double-submit / race): already passed — return idempotent success.
      // Because this runs inside a transaction, concurrent submits serialize naturally;
      // the second one will read passed=true and return immediately without extra writes.
      if (attemptData.passed === true) {
        const questionId = attemptData.question_id?.id || null;
        return { passed: true, questionId };
      }

      // Guard: no active question set
      if (!attemptData.question_id) {
        throw new HttpsError(
          "failed-precondition",
          "No active question. Please request a question first."
        );
      }

      // Fetch the active question to grade against
      const questionSnap = await transaction.get(attemptData.question_id);

      if (!questionSnap.exists) {
        throw new HttpsError(
          "not-found",
          "The question no longer exists. Please refresh and try again."
        );
      }

      const questionData = questionSnap.data();
      const correctOptionId = questionData.answer?.option_id;

      // ── Grade ────────────────────────────────────────────────────────────
      // eslint-disable-next-line eqeqeq
      const passed = String(selectedOptionId) == String(correctOptionId);

      const now = admin.firestore.FieldValue.serverTimestamp();

      // Find the selected option text for the record
      const selectedOption = questionData.option?.find(
        (opt) => String(opt.option_id) === String(selectedOptionId)
      );
      const answerGivenText = selectedOption
        ? selectedOption.option
        : String(selectedOptionId);

      if (!passed) {
        // ── WRITE: wrong answer — only increment attempt count ─────────────
        transaction.update(attemptRef, {
          answer_given: answerGivenText,
          attempt_number: admin.firestore.FieldValue.increment(1),
          attempted_at: now,
        });

        return { passed: false };
      }

      // ── WRITE: correct answer ─────────────────────────────────────────────
      transaction.update(attemptRef, {
        passed: true,
        answer_given: answerGivenText,
        attempt_number: admin.firestore.FieldValue.increment(1),
        attempted_at: now,
        // question_id stays as the final passed question ref (already set)
      });

      // Update user profile — mark competition as answered
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
