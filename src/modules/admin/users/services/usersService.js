import { 
  doc, 
  getDoc,
  updateDoc,
  collection, 
  query, 
  where, 
  getCountFromServer,
  getDocs
} from "firebase/firestore";
import { db } from '@/config/firebase';
import { callFunction } from '@/shared/services/functionClient';

/**
 * Fetches the list of all users with competition participation counts.
 */
export async function fetchUsersList() {
  try {
    const userSnap = await getDocs(collection(db, "user"));
    const promises = userSnap.docs.map(async (d) => {
      const userData = d.data();
      const uid = d.id;
      try {
        const compsCountSnap = await getCountFromServer(
          query(collection(db, "competition"), where("participants", "array-contains", uid))
        );
        return { id: uid, ...userData, compsEntered: compsCountSnap.data().count };
      } catch (err) {
        console.warn(`[UsersService] Could not fetch comp count for ${uid}`, err);
        return { id: uid, ...userData, compsEntered: 0 };
      }
    });
    return await Promise.all(promises);
  } catch (error) {
    console.error("[UsersService] Error fetching users list:", error);
    throw error;
  }
}

/**
 * Fetches comprehensive details for a single user including orders and tickets.
 */
export async function fetchUserDetail(uid) {
  try {
    const userRef = doc(db, "user", uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) throw new Error("User not found");
    const userData = { id: uid, ...userDoc.data() };

    const [ordersSnap, ticketsSnap, referralsSnap, bonusLogsSnap] = await Promise.all([
      getDocs(query(collection(db, "order"), where("user_ref", "in", [uid, userRef, `/user/${uid}`]))),
      getDocs(query(collection(db, "ticket"), where("user_id", "in", [uid, userRef, `/user/${uid}`]))),
      getDocs(query(collection(db, "referrals"), where("referrer_id", "in", [uid, userRef, `/user/${uid}`]))),
      getDocs(query(collection(db, "free_ticket_log"), where("user_id", "in", [uid, userRef, `/user/${uid}`])))
    ]);

    const sortDesc = (a, b) => {
      const timeA = (a.created_at?.toMillis ? a.created_at.toMillis() : (a.created_at ? new Date(a.created_at).getTime() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0)));
      const timeB = (b.created_at?.toMillis ? b.created_at.toMillis() : (b.created_at ? new Date(b.created_at).getTime() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0)));
      return timeB - timeA;
    };

    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortDesc);
    const tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortDesc);

    const referrals = await Promise.all(referralsSnap.docs.map(async d => {
      const refData = d.data();
      let referredName = "Unknown User", referredEmail = "N/A";
      if (refData.referred_user_id) {
        try {
          const uSnap = await getDoc(refData.referred_user_id);
          if (uSnap.exists()) {
            referredName = uSnap.data().display_name || uSnap.data().name || "Unknown";
            referredEmail = uSnap.data().email || "N/A";
          }
        } catch (e) { /* ignore */ }
      }
      return { id: d.id, ...refData, referredName, referredEmail };
    }));

    const bonusLogs = await Promise.all(bonusLogsSnap.docs.map(async d => {
      const logData = d.data();
      let compTitle = "N/A";
      if (logData.competition_id) {
        try {
          const cRef = typeof logData.competition_id === 'string' 
            ? doc(db, "competition", logData.competition_id)
            : logData.competition_id;
          const cSnap = await getDoc(cRef);
          if (cSnap.exists()) compTitle = cSnap.data().title;
        } catch (e) { /* ignore */ }
      }
      return { id: d.id, ...logData, competitionTitle: compTitle };
    }));

    referrals.sort(sortDesc);
    bonusLogs.sort(sortDesc);

    const resolvedOrders = await Promise.all(orders.map(async (order) => {
      let compTitle = "Unknown Competition";
      const cId = order.competition_id;
      if (cId) {
        try {
          const cSnap = await getDoc(doc(db, "competition", cId));
          if (cSnap.exists()) compTitle = cSnap.data().title;
        } catch (e) { /* ignore */ }
      }
      return { ...order, competitionName: compTitle };
    }));

    const compMap = {};
    tickets.forEach(tk => {
      const cId = tk.competition_id;
      if (!compMap[cId]) compMap[cId] = { id: cId, tickets: [], title: "Loading..." };
      compMap[cId].tickets.push(tk);
    });

    const resolvedComps = await Promise.all(Object.values(compMap).map(async (item) => {
      let title = "Unknown Competition", status = "Ended", drawDate = null;
      try {
        const cSnap = await getDoc(doc(db, "competition", item.id));
        if (cSnap.exists()) { const cData = cSnap.data(); title = cData.title; status = cData.status; drawDate = cData.draw_date; }
      } catch (e) { /* ignore */ }
      return { ...item, title, status, drawDate };
    }));

    return {
      profile: userData,
      orders: resolvedOrders,
      tickets,
      competitions: resolvedComps,
      referralsList: referrals,
      bonusLogs
    };
  } catch (error) {
    console.error(`[UsersService] Error fetching user detail for ${uid}:`, error);
    throw error;
  }
}

/**
 * Updates the status of a user document.
 */
export async function updateUserStatus(uid, isActive) {
  await updateDoc(doc(db, 'user', uid), { is_active: isActive });
}

/**
 * Calls the backend Cloud Function to soft delete a user.
 */
export async function softDeleteUser(userId) {
  return callFunction("softDeleteUser", { userId }, "Failed to delete user.");
}
