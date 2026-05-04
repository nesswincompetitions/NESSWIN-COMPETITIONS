import { HttpsError } from "firebase-functions/v2/https";
import { assertAuthenticated } from "./functionGuards.js";

/**
 * Validates that the request is authenticated.
 * @returns {string} The authenticated user's UID.
 */
export function validateAuth(request) {
  return assertAuthenticated(request);
}

function matchesCompetition(questionCompetitionRef, competitionId) {
  if (!questionCompetitionRef || !competitionId) {
    return false;
  }

  if (typeof questionCompetitionRef === "string") {
    return questionCompetitionRef === competitionId || questionCompetitionRef.endsWith(`/${competitionId}`);
  }

  return questionCompetitionRef.id === competitionId;
}

export async function getValidatedQuestion(db, competitionId, questionId) {
  if (!competitionId || !questionId) {
    throw new HttpsError("invalid-argument", "competitionId and questionId are required.");
  }

  const questionRef = db.collection("questions").doc(questionId);
  const questionSnap = await questionRef.get();

  if (!questionSnap.exists) {
    throw new HttpsError("not-found", "Question not found.");
  }

  const questionData = questionSnap.data();
  const linkedCompetition = questionData.competition_id;

  if (!matchesCompetition(linkedCompetition, competitionId)) {
    throw new HttpsError("failed-precondition", "Question does not belong to this competition.");
  }

  return { questionRef, questionData };
}

/**
 * Fetches a question document and validates the selected answer against the stored correct answer.
 *
 * Supports both numeric option_id (e.g. 1, 2) and string option_id (e.g. "opt_17...").
 * The comparison is done loosely (==) to handle number/string mismatches from different
 * creation flows (admin edit vs. admin create).
 *
 * @param {FirebaseFirestore.Firestore} db  Firestore instance
 * @param {string} questionId              The document ID of the question
 * @param {string|number} selectedOptionId The option_id the user selected
 * @returns {Promise<{passed: boolean, questionData: object}>}
 */
export async function validateQuestionAnswer(db, questionId, selectedOptionId) {
  if (!questionId || selectedOptionId === undefined || selectedOptionId === null) {
    throw new HttpsError("invalid-argument", "questionId and selectedOptionId are required.");
  }

  const questionRef = db.collection("questions").doc(questionId);
  const questionSnap = await questionRef.get();

  if (!questionSnap.exists) {
    throw new HttpsError("not-found", "Question not found.");
  }

  const questionData = questionSnap.data();

  // The correct answer is stored as `answer.option_id`
  const correctOptionId = questionData.answer?.option_id;

  if (correctOptionId === undefined || correctOptionId === null) {
    throw new HttpsError("internal", "Question has no correct answer configured.");
  }

  const passed = String(selectedOptionId) === String(correctOptionId);

  return { passed, questionData };
}
