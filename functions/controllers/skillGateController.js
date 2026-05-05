import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin, db } from "../config/firebaseAdmin.js";
import { toHttpsError } from "../services/functionGuards.js";
import { getValidatedQuestion, validateAuth, validateQuestionAnswer } from "../services/validationService.js";

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

  const { competitionId, questionId, selectedOptionId } = request.data || {};

  if (!competitionId || !questionId || selectedOptionId === undefined || selectedOptionId === null) {
    throw new HttpsError("invalid-argument", "competitionId, questionId, and selectedOptionId are required.");
  }

  // Build DocumentRefs first — skill_attempts stores these as references, not raw strings
  const userDocRef = db.collection("user").doc(uid);
  const compDocRef = db.collection("competition").doc(competitionId);
  const questionDocRef = db.collection("questions").doc(questionId);

  await getValidatedQuestion(db, competitionId, questionId);

  const { passed, questionData } = await validateQuestionAnswer(db, questionId, selectedOptionId);

  // ── Determine attempt number ─────────────────────────────────────────────────
  // Query only by user_id to avoid requiring a composite index, then filter in memory
  const existingAttemptsSnap = await db
    .collection("skill_attempts")
    .where("user_id", "==", userDocRef)
    .get();

  let attemptCount = 0;
  existingAttemptsSnap.forEach(doc => {
    const data = doc.data();
    if (data.competition_id?.id === competitionId && data.question_id?.id === questionId) {
      attemptCount++;
    }
  });

  const attemptNumber = attemptCount + 1;

  // ── Find option text ────────────────────────────────────────────────────────
  const selectedOption = questionData.option?.find(
    (opt) => String(opt.option_id) === String(selectedOptionId)
  );
  const answerGivenText = selectedOption ? selectedOption.option : String(selectedOptionId);

  // ── Record the attempt ───────────────────────────────────────────────────────
  const attemptRef = db.collection("skill_attempts").doc();
  const batch = db.batch();

  batch.set(attemptRef, {
    user_id: userDocRef,
    competition_id: compDocRef,
    question_id: questionDocRef,
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
    const { competitionId } = request.data || {};

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

    // 2. Fetch past attempts for this user and competition using DocumentRefs
    const userRef = db.collection("user").doc(uid);
    const attemptsSnap = await db.collection("skill_attempts")
      .where("user_id", "==", userRef)
      .where("competition_id", "==", competitionRef)
      .get();

    const attempts = [];
    attemptsSnap.forEach(doc => attempts.push(doc.data()));

    // 3. Check for a passing attempt matching any CURRENT question
    // question_id is stored as a DocumentReference, so extract .id for comparison
    const currentQuestionIds = currentQuestions.map(q => q.id);
    const passedAttempt = attempts.find(a => 
      a.passed === true && currentQuestionIds.includes(a.question_id?.id || a.question_id)
    );

    if (passedAttempt) {
      const passedQId = passedAttempt.question_id?.id || passedAttempt.question_id;
      return { 
        status: 'eligible', 
        passedQuestionId: passedQId,
        passedOptionId: passedAttempt.answer_given
      };
    }

    // 4. Identify failed question IDs (extract .id from DocumentRef)
    const failedQuestionIds = new Set(
      attempts.filter(a => a.passed === false).map(a => a.question_id?.id || a.question_id)
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
    // eslint-disable-next-line no-unused-vars
    const { answer, created_at, updated_at, competition_id, ...sanitizedQuestion } = selectedQuestion;

    return { 
      status: 'needs_attempt', 
      question: sanitizedQuestion,
      remainingCount: unattemptedQuestions.length
    };
  } catch (error) {
    console.error("Error in getSkillGateStatus:", error);
    throw toHttpsError(error, "Failed to load skill gate status.");
  }
});
