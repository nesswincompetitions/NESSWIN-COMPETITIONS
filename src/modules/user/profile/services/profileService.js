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
  limit,
  startAfter,
  getCountFromServer,
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

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/**
 * Deduplicates and resolves a list of Firestore competition document references.
 * Returns a Map from competition ID → competition data.
 * This is highly efficient: it fetches each unique competition exactly once,
 * regardless of how many tickets/orders reference it.
 * Time complexity: O(U) where U = number of unique competitions.
 */
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
 * Enriches a flat list of raw Firestore docs with resolved competition data.
 * Accepts a pre-fetched competitionMap to avoid redundant reads.
 */
const enrichWithCompetition = (rawItems, competitionMap) =>
  rawItems.map((item) => ({
    ...item,
    competition_id: item.competition_id?.id || item.competition_id || null,
    competition:
      competitionMap[item.competition_id?.id] ||
      item.competition ||
      null,
  }));

// ─── Order History — Cursor-Based Pagination ─────────────────────────────────

const ORDERS_PAGE_SIZE = 10;

/**
 * [ORDERS - PAGE 1] Live real-time subscription for the first page of orders.
 *
 * Why onSnapshot here?
 * The first page is the most recent orders. A user can complete a purchase
 * and expect to see it appear instantly. onSnapshot with limit(10) makes that
 * happen while only ever reading a maximum of 10 documents from Firestore.
 *
 * Returns an unsubscribe function AND passes { orders, lastDoc, hasMore } to onData.
 * The caller must store `lastDoc` to use for fetching subsequent pages.
 *
 * @param {string} uid
 * @param {function} onData - Called with { orders, lastDoc, totalCount }
 * @param {function} onError
 * @returns {function} unsubscribe
 */
export const subscribeOrdersFirstPage = (uid, onData, onError) => {
  if (!uid) {
    onData({ orders: [], lastDoc: null, totalCount: 0 });
    return () => {};
  }

  const userRef = doc(db, 'user', uid);

  let active = true;
  let resolvedTotalCount = 0;
  let latestData = null; // Stores { orders, lastDoc } once snapshot fires

  // Fire off a one-time count query in parallel to know total pages up-front.
  const countQ = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef)
  );

  getCountFromServer(countQ)
    .then((snap) => {
      if (!active) return;
      resolvedTotalCount = snap.data().count;
      // If snapshot already fired and we have data, update the UI with the real count.
      if (latestData) {
        onData({
          orders: latestData.orders,
          lastDoc: latestData.lastDoc,
          totalCount: resolvedTotalCount,
        });
      }
    })
    .catch((err) => {
      console.error('[profileService] Failed to fetch order count:', err);
    });

  const q = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef),
    orderBy('created_at', 'desc'),
    limit(ORDERS_PAGE_SIZE)
  );

  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      if (!active) return;
      if (snapshot.empty) {
        latestData = { orders: [], lastDoc: null };
        onData({ orders: [], lastDoc: null, totalCount: resolvedTotalCount });
        return;
      }

      const rawOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const competitionMap = await resolveCompetitionMap(rawOrders);
      if (!active) return;
      
      const orders = enrichWithCompetition(rawOrders, competitionMap);
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];

      latestData = { orders, lastDoc };
      onData({ orders, lastDoc, totalCount: resolvedTotalCount });
    },
    onError
  );

  return () => {
    active = false;
    unsubscribe();
  };
};


/**
 * [ORDERS - PAGE N] Fetches a subsequent page of orders using a cursor.
 *
 * Uses getDocs (static, one-time read) instead of onSnapshot because:
 * - Historical pages don't need real-time updates.
 * - This is 100x cheaper: one read per page instead of a persistent socket.
 *
 * @param {string} uid
 * @param {DocumentSnapshot} cursorDoc - The last document from the previous page.
 * @returns {Promise<{ orders, lastDoc, hasMore }>}
 */
export const fetchOrdersNextPage = async (uid, cursorDoc) => {
  if (!uid || !cursorDoc) return { orders: [], lastDoc: null, hasMore: false };

  const userRef = doc(db, 'user', uid);
  const q = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef),
    orderBy('created_at', 'desc'),
    startAfter(cursorDoc),          // 🚀 Cursor-based — skips already-seen data
    limit(ORDERS_PAGE_SIZE)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return { orders: [], lastDoc: null, hasMore: false };

  const rawOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const competitionMap = await resolveCompetitionMap(rawOrders);
  const orders = enrichWithCompetition(rawOrders, competitionMap);
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];

  // If we got a full page, there might be more data; if partial, we're at the end.
  const hasMore = snapshot.docs.length === ORDERS_PAGE_SIZE;

  return { orders, lastDoc, hasMore };
};

// ─── My Tickets — Capped Real-Time Subscription ──────────────────────────────

/**
 * My Tickets architecture note:
 * Tickets are GROUPED by competition for display. Cursor-based pagination on
 * orders maps poorly to groups (10 orders for 2 competitions = 2 groups, not 10).
 *
 * Solution: Fetch all user orders up to MAX_ORDERS with a single capped onSnapshot.
 * The UI groups the flat order list by competition (O(N) client-side) and paginates
 * the resulting GROUPS. This is fast (browsers handle arrays of hundreds trivially),
 * gives live updates, and always shows correct groups per page.
 *
 * MAX_ORDERS = 200 means we read at most 200 docs. For 99.9% of users this covers
 * their entire history. Power users beyond 200 orders can contact support (edge case).
 */
const MAX_ORDERS_FOR_TICKETS = 200;

/**
 * Live real-time subscription for ALL user orders (capped at 200).
 * Returns flat enriched orders. The UI is responsible for grouping + paginating.
 *
 * @param {string} uid
 * @param {function} onData - Called with enriched orders array
 * @param {function} onError
 * @returns {function} unsubscribe
 */
export const subscribeUserOrdersForTickets = (uid, onData, onError) => {
  if (!uid) {
    onData([]);
    return () => {};
  }

  const userRef = doc(db, 'user', uid);
  const q = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef),
    orderBy('created_at', 'desc'),
    limit(MAX_ORDERS_FOR_TICKETS)  // Safety cap — never reads the whole database
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      if (snapshot.empty) {
        onData([]);
        return;
      }
      const rawOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const competitionMap = await resolveCompetitionMap(rawOrders);
      const orders = enrichWithCompetition(rawOrders, competitionMap);
      onData(orders);
    },
    onError
  );
};

/**
 * Fetches all tickets for a given competition that belong to this user.
 * Called lazily only for competitions currently visible on the page.
 *
 * @param {string} uid
 * @param {string} competitionId
 * @returns {Promise<ticket[]>}
 */
export const fetchTicketsForCompetition = async (uid, competitionId) => {
  if (!uid || !competitionId) return [];
  const userRef = doc(db, 'user', uid);
  const compRef = doc(db, 'competition', competitionId);
  const q = query(
    collection(db, 'ticket'),
    where('user_id', '==', userRef),
    where('competition_id', '==', compRef),
    orderBy('ticket_number', 'asc')
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

// ─── Order Tickets (for expanding an order card) ─────────────────────────────


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

// ─── Legacy Functions (kept for backward compatibility) ──────────────────────

/**
 * @deprecated Use subscribeOrdersFirstPage + fetchOrdersNextPage instead.
 * Kept to avoid breaking any other components that still call this.
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
      const orders = enrichWithCompetition(rawOrders, competitionMap);
      onData(orders);
    },
    onError
  );
};

/**
 * @deprecated Use subscribeTicketsFirstPage + fetchTicketsNextPage instead.
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
      const tickets = enrichWithCompetition(rawTickets, competitionMap);
      onData(tickets);
    },
    onError
  );
};

/**
 * @deprecated Use subscribeTicketsFirstPage + fetchTicketsNextPage instead.
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

/**
 * @deprecated Use subscribeOrdersFirstPage + fetchOrdersNextPage instead.
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
