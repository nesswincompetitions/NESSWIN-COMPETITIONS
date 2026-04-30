import { HttpsError } from "firebase-functions/v2/https";

/**
 * Validates that the request is authenticated.
 * @returns {string} The authenticated user's UID.
 */
export function validateAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  return request.auth.uid;
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

  // Loose comparison to handle number vs string option_id formats
  // eslint-disable-next-line eqeqeq
  const passed = selectedOptionId == correctOptionId;

  return { passed, questionData };
}
