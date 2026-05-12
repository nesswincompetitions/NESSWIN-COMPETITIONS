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

    const compCache = {};
    const getResolvedComp = async (idOrRef) => {
      if (!idOrRef) return null;
      const id = typeof idOrRef === 'string' ? idOrRef : idOrRef.id;
      if (compCache[id]) return compCache[id];
      
      try {
        const ref = typeof idOrRef === 'string' ? doc(db, "competition", idOrRef) : idOrRef;
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const cData = snap.data();
          compCache[id] = { 
            id: snap.id, 
            title: cData.title || "Untitled", 
            status: cData.status || "active", 
            drawDate: cData.draw_date || null 
          };
          return compCache[id];
        }
      } catch (e) {
        console.error(`[UsersService] Error resolving comp ${id}:`, e);
      }
      return null;
    };

    const referrals = await Promise.all(referralsSnap.docs.map(async d => {
      const refData = d.data();
      let referredName = "Unknown User", referredEmail = "N/A";
      if (refData.referred_user_id) {
        try {
          const uSnap = typeof refData.referred_user_id === 'string' 
            ? await getDoc(doc(db, "user", refData.referred_user_id))
            : await getDoc(refData.referred_user_id);
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
      const comp = await getResolvedComp(logData.competition_id);
      return { id: d.id, ...logData, competitionTitle: comp?.title || "N/A" };
    }));

    referrals.sort(sortDesc);
    bonusLogs.sort(sortDesc);

    const resolvedOrders = await Promise.all(orders.map(async (order) => {
      const comp = await getResolvedComp(order.competition_id);
      return { ...order, competitionName: comp?.title || "Unknown Competition" };
    }));

    const compMap = {};
    tickets.forEach(tk => {
      const idOrRef = tk.competition_id;
      if (!idOrRef) return;
      const id = typeof idOrRef === 'string' ? idOrRef : idOrRef.id;
      if (!compMap[id]) compMap[id] = { id: idOrRef, tickets: [] };
      compMap[id].tickets.push(tk);
    });

    const resolvedComps = await Promise.all(Object.values(compMap).map(async (item) => {
      const comp = await getResolvedComp(item.id);
      return { 
        ...item, 
        title: comp?.title || "Unknown Competition", 
        status: comp?.status || "Ended", 
        drawDate: comp?.drawDate || null 
      };
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
 * Performs a client-side soft delete by setting is_active to false.
 */
export async function softDeleteUser(userId) {
  try {
    await updateDoc(doc(db, 'user', userId), { 
      is_active: false,
      deleted_at: new Date().toISOString() // Audit trail
    });
  } catch (error) {
    console.error("[UsersService] Error soft deleting user:", error);
    throw error;
  }
}
