import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
  deleteDoc,
} from 'firebase/firestore';
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/config/firebase';

// ─── Basic Profile Update ────────────────────────────────────────────────────

/**
 * Updates a user profile document with merge semantics.
 * Safe to use for partial updates (e.g. photo_url, display_name).
 */
export const updateProfile = async (uid, data) => {
  const userRef = doc(db, 'user', uid);
  await setDoc(userRef, data, { merge: true });
};

// ─── Edit Profile ────────────────────────────────────────────────────────────

/**
 * Re-authenticates the user with their current password.
 * Required before sensitive operations (email change, delete).
 */
export const reauthenticate = async (currentPassword) => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No authenticated user.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
};

/**
 * Updates display_name and optionally email/password.
 * Email/password changes require re-authentication first.
 */
export const saveEditedProfile = async (uid, { displayName, newEmail, newPassword }) => {
  const updates = {};
  if (displayName) updates.display_name = displayName.trim();

  if (newEmail) {
    await updateEmail(auth.currentUser, newEmail);
    updates.email = newEmail;
  }

  if (newPassword) {
    await updatePassword(auth.currentUser, newPassword);
  }

  if (Object.keys(updates).length > 0) {
    await updateProfile(uid, updates);
  }
};

// ─── Delete Account ──────────────────────────────────────────────────────────

/**
 * Deletes the Firestore user document and the Firebase Auth account.
 * Requires fresh re-authentication before calling.
 */
export const deleteAccount = async () => {
  const softDeleteUser = httpsCallable(functions, 'softDeleteUser');
  const result = await softDeleteUser();
  return result.data;
};

// ─── My Tickets ──────────────────────────────────────────────────────────────

/**
 * Fetches all tickets for a user, enriched with competition details.
 */
export const fetchUserTickets = async (uid) => {
  if (!uid) return [];

  const userRef = doc(db, 'user', uid);
  const q = query(
    collection(db, 'ticket'),
    where('user_id', '==', userRef),
    orderBy('created_at', 'desc')
  );
  const snap = await getDocs(q);
  if (snap.empty) return [];

  // Fetch unique competitions
  const compCache = {};
  const fetchComp = async (ref) => {
    if (!ref) return null;
    const key = ref.id;
    if (compCache[key]) return compCache[key];
    const compSnap = await getDoc(ref);
    const data = compSnap.exists() ? { id: compSnap.id, ...compSnap.data() } : null;
    compCache[key] = data;
    return data;
  };

  return Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const competition = await fetchComp(data.competition_id);
      return { id: d.id, ...data, competition };
    })
  );
};

// ─── Order History ───────────────────────────────────────────────────────────

/**
 * Fetches all orders for a user, enriched with competition details.
 */
export const fetchUserOrders = async (uid) => {
  if (!uid) return [];

  const userRef = doc(db, 'user', uid);
  const q = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef),
    orderBy('created_at', 'desc')
  );
  const snap = await getDocs(q);
  if (snap.empty) return [];

  const compCache = {};
  const fetchComp = async (ref) => {
    if (!ref) return null;
    const key = ref.id;
    if (compCache[key]) return compCache[key];
    const compSnap = await getDoc(ref);
    const data = compSnap.exists() ? { id: compSnap.id, ...compSnap.data() } : null;
    compCache[key] = data;
    return data;
  };

  return Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const competition = await fetchComp(data.competition_id);
      return { id: d.id, ...data, competition };
    })
  );
};

// ─── Order Tickets ──────────────────────────────────────────────────────────

/**
 * Fetches all tickets for a specific order.
 */
export const fetchOrderTickets = async (orderId) => {
  if (!orderId) return [];
  const orderRef = doc(db, 'order', orderId);
  const q = query(
    collection(db, 'ticket'),
    where('order_id', '==', orderRef),
    orderBy('ticket_number', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
