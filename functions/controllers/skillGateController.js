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
  const attemptRef = db.collection("skill_attempts").doc();
  const batch = db.batch();

  batch.set(attemptRef, {
    user_id: uid,
    competition_id: competitionId,
    question_id: questionId,
    selected_option_id: selectedOptionId, // Store the ID for refresh persistence
    answer_given: answerGivenText,
    passed,
    attempt_number: attemptNumber,
    attempted_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return { success: passed };
});

/**
 * Phase 1 — Skill Gate Status Check
 *
 * Evaluates the user's eligibility securely on the server.
 * Returns { status: 'eligible' | 'locked' | 'needs_attempt', question?: sanitizedQuestion }
 */
export const getSkillGateStatus = onCall(async (request) => {
  try {
    const uid = validateAuth(request);
    const { competitionId } = request.data;

    if (!competitionId) {
      throw new HttpsError("invalid-argument", "competitionId is required.");
    }

    const competitionRef = db.collection("competition").doc(competitionId);
    const compSnap = await competitionRef.get();
    
    if (!compSnap.exists) {
      throw new HttpsError("not-found", "Competition not found.");
    }

    // 1. Fetch current questions for this competition
    // We try both filtering by reference and by ID string for robustness
    const questionsSnap = await db.collection("questions")
      .where("competition_id", "==", competitionRef)
      .get();

    if (questionsSnap.empty) {
      return { status: 'eligible' };
    }

    const currentQuestions = [];
    questionsSnap.forEach(doc => {
      currentQuestions.push({ id: doc.id, ...doc.data() });
    });

    // 2. Fetch past attempts for this user and competition
    const attemptsSnap = await db.collection("skill_attempts")
      .where("user_id", "==", uid)
      .where("competition_id", "==", competitionId)
      .get();

    const attempts = [];
    attemptsSnap.forEach(doc => attempts.push(doc.data()));

    // 3. Check for a passing attempt matching any CURRENT question
    const currentQuestionIds = currentQuestions.map(q => q.id);
    const passedAttempt = attempts.find(a => 
      a.passed === true && currentQuestionIds.includes(a.question_id)
    );

    if (passedAttempt) {
      return { 
        status: 'eligible', 
        passedQuestionId: passedAttempt.question_id,
        passedOptionId: passedAttempt.selected_option_id || passedAttempt.answer_given
      };
    }

    // 4. Identify failed question IDs
    const failedQuestionIds = new Set(
      attempts.filter(a => a.passed === false).map(a => a.question_id)
    );

    // 5. Filter unattempted questions
    const unattemptedQuestions = currentQuestions.filter(q => !failedQuestionIds.has(q.id));

    // 6. Check for lockout
    if (unattemptedQuestions.length === 0) {
      return { 
        status: 'locked', 
        message: 'You answered all questions incorrectly. You are not eligible to participate.' 
      };
    }

    // 7. Pick one random unattempted question
    const randomIndex = Math.floor(Math.random() * unattemptedQuestions.length);
    const selectedQuestion = unattemptedQuestions[randomIndex];

    // 8. Sanitize the question (REMOVE THE CORRECT ANSWER)
    // Destructure to omit 'answer' and internal fields
    const { answer, created_at, updated_at, competition_id, ...sanitizedQuestion } = selectedQuestion;

    return { 
      status: 'needs_attempt', 
      question: sanitizedQuestion,
      remainingCount: unattemptedQuestions.length
    };
  } catch (error) {
    console.error("Error in getSkillGateStatus:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Unknown internal error");
  }
});
