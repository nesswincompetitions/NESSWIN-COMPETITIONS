import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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

/**
 * Updates a username after checking for uniqueness in the user collection.
 */
export const updateUsername = async (uid, newUsername) => {
  const cleanNew = newUsername.trim().toLowerCase();
  
  // Check if username is already taken by another user
  const q = query(collection(db, 'user'), where('user_name', '==', cleanNew));
  const snap = await getDocs(q);
  
  if (!snap.empty) {
    const takenByOther = snap.docs.some(d => d.id !== uid);
    if (takenByOther) {
      throw new Error("Username is already taken.");
    }
    return; // It's already the user's own username
  }

  // Update the user document
  const userRef = doc(db, 'user', uid);
  await setDoc(userRef, { user_name: cleanNew }, { merge: true });
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

const resolveCompetitionMap = async (items) => {
  const refs = items
    .map((item) => item?.competition_id)
    .filter((ref) => ref && typeof ref === 'object' && ref.id);

  if (refs.length === 0) return {};

  const uniqueRefs = Array.from(new Map(refs.map((ref) => [ref.id, ref])).values());
  const entries = await Promise.all(
    uniqueRefs.map(async (ref) => {
      try {
        const compSnap = await getDoc(ref);
        if (!compSnap.exists()) return [ref.id, null];
        return [ref.id, { id: compSnap.id, ...compSnap.data() }];
      } catch {
        return [ref.id, null];
      }
    })
  );

  return Object.fromEntries(entries);
};

/**
 * Realtime orders feed for a user (with resolved competition data).
 */
export const subscribeUserOrders = (uid, onData, onError) => {
  if (!uid) {
    onData([]);
    return () => {};
  }

  const userRef = doc(db, 'user', uid);
  const q = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef),
    orderBy('created_at', 'desc')
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      const rawOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const competitionMap = await resolveCompetitionMap(rawOrders);

      const orders = rawOrders.map((order) => ({
        ...order,
        competition_id: order.competition_id?.id || order.competition_id || null,
        competition:
          competitionMap[order.competition_id?.id] ||
          order.competition ||
          null,
      }));

      onData(orders);
    },
    onError
  );
};

/**
 * Realtime tickets feed for a user (with resolved competition data).
 */
export const subscribeUserTickets = (uid, onData, onError) => {
  if (!uid) {
    onData([]);
    return () => {};
  }

  const userRef = doc(db, 'user', uid);
  const q = query(
    collection(db, 'ticket'),
    where('user_id', '==', userRef),
    orderBy('created_at', 'desc')
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      const rawTickets = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const competitionMap = await resolveCompetitionMap(rawTickets);

      const tickets = rawTickets.map((ticket) => ({
        ...ticket,
        competition_id: ticket.competition_id?.id || ticket.competition_id || null,
        competition:
          competitionMap[ticket.competition_id?.id] ||
          ticket.competition ||
          null,
      }));

      onData(tickets);
    },
    onError
  );
};

/**
 * Realtime tickets feed for a single order.
 */
export const subscribeOrderTickets = (orderId, onData, onError) => {
  if (!orderId) {
    onData([]);
    return () => {};
  }

  const orderRef = doc(db, 'order', orderId);
  const q = query(
    collection(db, 'ticket'),
    where('order_id', '==', orderRef),
    orderBy('ticket_number', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    onError
  );
};
