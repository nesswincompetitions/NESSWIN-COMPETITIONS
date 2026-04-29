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
