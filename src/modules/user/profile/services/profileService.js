import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

/**
 * Updates a user profile document with merge semantics.
 * Safe to use for partial updates (e.g. photo_url, phone_number).
 */
export const updateProfile = async (uid, data) => {
  const userRef = doc(db, 'user', uid);
  await setDoc(userRef, data, { merge: true });
};
