import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { storage, functions } from "../utils/firebase";

/**
 * Uploads an array of File objects to Firebase Storage and returns an array of download URLs.
 */
export const uploadImages = async (files, folderPath) => {
  if (!files || files.length === 0) return [];

  const uploadPromises = files.map(async (file) => {
    // Only upload if it's a File object (not an existing URL string)
    if (file instanceof File) {
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `${folderPath}/${fileName}`);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    }
    return file; // If it's already a URL (e.g. edit mode), just return it
  });

  return await Promise.all(uploadPromises);
};

/**
 * Creates a new competition by calling the Cloud Function
 */
export const createCompetition = async (payload) => {
  const createCompFunc = httpsCallable(functions, "createCompetition");
  try {
    const result = await createCompFunc(payload);
    return result.data;
  } catch (error) {
    console.error("Error creating competition via Cloud Function:", error);
    throw error;
  }
};

/**
 * Phase 1 — Skill Gate Status Check
 * Evaluates user's eligibility securely on the backend
 * @param {{ competitionId: string }} payload
 * @returns {Promise<{ status: string, question?: object, message?: string, remainingCount?: number, passedQuestionId?: string, passedOptionId?: string }>}
 */
export const getSkillGateStatus = async (payload) => {
  const fn = httpsCallable(functions, "getSkillGateStatus");
  try {
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    console.error("Error getting skill gate status:", error);
    throw error;
  }
};

/**
 * Phase 1 — Skill Gate: Verifies the user's skill answer
 * @param {{ competitionId: string, questionId: string, selectedOptionId: string|number }} payload
 * @returns {Promise<{ success: boolean }>}
 */
export const verifySkillAnswer = async (payload) => {
  const fn = httpsCallable(functions, "verifySkillAnswer");
  try {
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    console.error("Error verifying skill answer:", error);
    throw error;
  }
};

/**
 * Phase 2 — Order Engine: Processes the mock checkout atomically
 * @param {{ competitionId: string, quantity: number, questionId: string, selectedOptionId: string|number }} payload
 * @returns {Promise<{ success: boolean, orderId: string, tickets: Array, totalAmount: number }>}
 */
export const processOrder = async (payload) => {
  const fn = httpsCallable(functions, "processOrder");
  try {
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    console.error("Error processing checkout:", error);
    throw error;
  }
};
