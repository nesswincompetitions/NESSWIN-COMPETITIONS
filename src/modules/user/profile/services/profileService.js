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

export const updateProfile = async (uid, data) => {
  const userRef = doc(db, 'user', uid);
  await setDoc(userRef, data, { merge: true });
};

export const updateUsername = async (uid, newUsername) => {
  const cleanNew = newUsername.trim().toLowerCase();
  const q = query(collection(db, 'user'), where('user_name', '==', cleanNew));
  const snap = await getDocs(q);
  
  if (!snap.empty) {
    const takenByOther = snap.docs.some(d => d.id !== uid);
    if (takenByOther) {
      throw new Error("Username is already taken.");
    }
    return;
  }

  const userRef = doc(db, 'user', uid);
  await setDoc(userRef, { user_name: cleanNew }, { merge: true });
};

export const reauthenticate = async (currentPassword) => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No authenticated user.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
};

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

export const deleteAccount = async () => {
  const softDeleteUser = httpsCallable(functions, 'softDeleteUser');
  const result = await softDeleteUser();
  return result.data;
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

const enrichWithCompetition = (rawItems, competitionMap) =>
  rawItems.map((item) => ({
    ...item,
    competition_id: item.competition_id?.id || item.competition_id || null,
    competition:
      competitionMap[item.competition_id?.id] ||
      item.competition ||
      null,
  }));

const ORDERS_PAGE_SIZE = 10;

export const subscribeOrdersFirstPage = (uid, onData, onError) => {
  if (!uid) {
    onData({ orders: [], lastDoc: null, totalCount: 0 });
    return () => {};
  }

  const userRef = doc(db, 'user', uid);
  let active = true;
  let resolvedTotalCount = 0;
  let latestData = null;

  const countQ = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef)
  );

  getCountFromServer(countQ)
    .then((snap) => {
      if (!active) return;
      resolvedTotalCount = snap.data().count;
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

export const fetchOrdersNextPage = async (uid, cursorDoc) => {
  if (!uid || !cursorDoc) return { orders: [], lastDoc: null, hasMore: false };

  const userRef = doc(db, 'user', uid);
  const q = query(
    collection(db, 'order'),
    where('user_ref', '==', userRef),
    orderBy('created_at', 'desc'),
    startAfter(cursorDoc),
    limit(ORDERS_PAGE_SIZE)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return { orders: [], lastDoc: null, hasMore: false };

  const rawOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const competitionMap = await resolveCompetitionMap(rawOrders);
  const orders = enrichWithCompetition(rawOrders, competitionMap);
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  const hasMore = snapshot.docs.length === ORDERS_PAGE_SIZE;

  return { orders, lastDoc, hasMore };
};

const MAX_ORDERS_FOR_TICKETS = 200;

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
    limit(MAX_ORDERS_FOR_TICKETS)
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

export const fetchTicketsForCompetition = async (uid, competitionId) => {
  if (!uid || !competitionId) return [];
  const userRef = doc(db, 'user', uid);
  const compRef = doc(db, 'competition', competitionId);
  const q = query(
    collection(db, 'ticket'),
    where('user_id', '==', userRef),
    where('competition_id', '==', compRef)
  );
  try {
    const snap = await getDocs(q);
    const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    tickets.sort((a, b) => (a.ticket_number || 0) - (b.ticket_number || 0));
    return tickets;
  } catch (err) {
    console.error('[fetchTicketsForCompetition] Error:', err);
    return [];
  }
};

export const fetchOrderTickets = async (orderId) => {
  if (!orderId) return [];
  const orderRef = doc(db, 'order', orderId);
  const q = query(
    collection(db, 'ticket'),
    where('order_id', '==', orderRef)
  );
  try {
    const snap = await getDocs(q);
    const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    tickets.sort((a, b) => (a.ticket_number || 0) - (b.ticket_number || 0));
    return tickets;
  } catch (err) {
    console.error('[fetchOrderTickets] Error:', err);
    return [];
  }
};

export const subscribeOrderTickets = (orderId, onData, onError) => {
  if (!orderId) {
    onData([]);
    return () => {};
  }

  const orderRef = doc(db, 'order', orderId);
  const q = query(
    collection(db, 'ticket'),
    where('order_id', '==', orderRef)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const tickets = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      tickets.sort((a, b) => (a.ticket_number || 0) - (b.ticket_number || 0));
      onData(tickets);
    },
    onError
  );
};

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
