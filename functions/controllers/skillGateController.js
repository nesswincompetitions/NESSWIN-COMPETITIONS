import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";
import { validateAuth, validateQuestionAnswer } from "../services/validationService.js";

/**
 * Phase 1 — Skill Gate
 *
 * Validates the user's answer to a skill-testing question and records the attempt.
 *
 * Input:  { competitionId, questionId, selectedOptionId }
 * Output: { success: true/false }
 */
export const verifySkillAnswer = onCall(async (request) => {
  const uid = validateAuth(request);

  const { competitionId, questionId, selectedOptionId } = request.data;

  if (!competitionId || !questionId || selectedOptionId === undefined || selectedOptionId === null) {
    throw new HttpsError("invalid-argument", "competitionId, questionId, and selectedOptionId are required.");
  }

  // ── Validate the answer ──────────────────────────────────────────────────────
  const { passed, questionData } = await validateQuestionAnswer(db, questionId, selectedOptionId);

  // ── Determine attempt number ─────────────────────────────────────────────────
  const existingAttempts = await db
    .collection("skill_attempts")
    .where("user_id", "==", uid)
    .where("competition_id", "==", competitionId)
    .where("question_id", "==", questionId)
    .get();

  const attemptNumber = existingAttempts.size + 1;

  // ── Find option text ────────────────────────────────────────────────────────
  const selectedOption = questionData.option?.find(
    // eslint-disable-next-line eqeqeq
    (opt) => opt.option_id == selectedOptionId
  );
  const answerGivenText = selectedOption ? selectedOption.option : String(selectedOptionId);

  // ── Record the attempt ───────────────────────────────────────────────────────
  await db.collection("skill_attempts").add({
    user_id: uid,
    competition_id: competitionId,
    question_id: questionId,
    selected_option_id: selectedOptionId, // Store the ID for refresh persistence
    answer_given: answerGivenText,
    passed,
    attempt_number: attemptNumber,
    attempted_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: passed };
});
