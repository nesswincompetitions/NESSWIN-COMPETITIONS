import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getCountFromServer,
  getDocs,
  orderBy,
  limit
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../utils/firebase";

/**
 * Fetches all 6 KPI stats for the Admin Dashboard.
 * Uses Promise.allSettled so one failing query never blocks the others.
 */
export async function fetchDashboardStats() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const sevenDaysMs = now.getTime() + (7 * 24 * 60 * 60 * 1000);

  // ── Run all fetches in parallel, each isolated ────────────────────────────
  const [
    globalResult,
    dailyResult,
    activeResult,
    pendingResult,
    endingResult,
    upcomingResult,
    ordersResult
  ] = await Promise.allSettled([
    // 1 & 2. Total Revenue & Registered Users
    getDoc(doc(db, "system_metrics", "global_stats")),

    // 3. Tickets Sold Today (safe — missing doc returns 0)
    getDoc(doc(db, "daily_metrics", todayStr)),

    // 4. Total Active Competitions
    getCountFromServer(
      query(collection(db, "competition"), where("status", "==", "active"))
    ),

    // 5. Pending Winners
    getDocs(
      query(
        collection(db, "competition"),
        where("status", "==", "ended")
      )
    ),

    // 6. Draws Ending Soon (Next 7 days) - fetch active for client-side filtering
    getDocs(
      query(
        collection(db, "competition"),
        where("status", "==", "active")
      )
    ),
    // 7. Top 3 Upcoming Draws (uses status + draw_date index)
    getDocs(
      query(
        collection(db, "competition"),
        where("status", "==", "active"),
        orderBy("draw_date", "asc"),
        limit(3)
      )
    ),

    // 8. Recent Orders
    getDocs(
      query(
        collection(db, "order"),
        orderBy("created_at", "desc"),
        limit(5)
      )
    )
  ]);

  // ── Helper: safely extract value from settled result ──────────────────────
  const ok = (result, fallback) => {
    if (result.status === "fulfilled") return result.value;
    console.error("[AdminStats] Query failed:", result.reason);
    return fallback;
  };

  // ── Parse results ─────────────────────────────────────────────────────────
  const globalSnap  = ok(globalResult,  null);
  const dailySnap   = ok(dailyResult,   null);
  const activeSnap  = ok(activeResult,  null);
  const pendingSnap  = ok(pendingResult,  null);
  const endingSnap   = ok(endingResult,   null);
  const upcomingSnap = ok(upcomingResult, null);
  const ordersSnap   = ok(ordersResult,   null);

  const globalData = globalSnap?.exists?.() ? globalSnap.data() : {};
  const dailyData  = dailySnap?.exists?.()  ? dailySnap.data()  : {};

  // Active Count
  const activeCount = activeSnap ? activeSnap.data().count : 0;

  // Pending Winners: client-side filter for winner_ref == null
  const pendingWinnersCount = (pendingSnap && pendingSnap.docs)
    ? pendingSnap.docs.filter(d => {
        const wr = d.data().winner_ref;
        return wr === null || wr === undefined;
      }).length
    : 0;

  // Draws Ending Soon: client-side filter based on countdown_end
  const drawsEndingSoonCount = (endingSnap && endingSnap.docs)
    ? endingSnap.docs.filter(d => {
        const data = d.data();
        const endTs = data.countdown_end?.toMillis 
          ? data.countdown_end.toMillis() 
          : data.countdown_end;
        
        // Count if it ends between right now and 7 days from now
        return endTs && endTs >= now.getTime() && endTs <= sevenDaysMs;
      }).length
    : 0;

  const upcomingDrawsList = (upcomingSnap && upcomingSnap.docs)
    ? upcomingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    : [];

  // 8. Resolve names for Recent Orders
  const recentOrdersList = [];
  if (ordersSnap && ordersSnap.docs) {
    for (const d of ordersSnap.docs) {
      const orderData = d.data();
      const orderId = d.id;

      // user_ref and competition_id can be a DocumentReference OR a plain string ID
      // Handle both cases gracefully
      const rawUserRef = orderData.user_ref;
      const rawCompRef = orderData.competition_id;

      const uId = rawUserRef?.id         // DocumentReference → extract .id
        ?? (typeof rawUserRef === 'string' ? rawUserRef : null);
      const cId = rawCompRef?.id
        ?? (typeof rawCompRef === 'string' ? rawCompRef : null);

      let userName = 'Unknown User';
      let userEmail = 'N/A';
      let competitionName = 'Unknown Competition';

      try {
        const [uSnap, cSnap] = await Promise.all([
          uId ? getDoc(doc(db, "user", uId)) : Promise.resolve(null),
          cId ? getDoc(doc(db, "competition", cId)) : Promise.resolve(null)
        ]);
        if (uSnap?.exists()) {
          userName = uSnap.data().display_name || 'Unknown User';
          userEmail = uSnap.data().email || 'N/A';
        }
        if (cSnap?.exists()) {
          competitionName = cSnap.data().title || 'Unknown Competition';
        }
      } catch (e) {
        console.warn('[AdminStats] Could not resolve order refs:', e.message);
      }

      recentOrdersList.push({
        id: orderId,
        ...orderData,
        userName,
        userEmail,
        competitionName
      });
    }
  }

  return {
    totalRevenue:        globalData.total_revenue          || 0,
    totalRegisteredUsers: globalData.total_registered_users || 0,
    ticketsSoldToday:    dailyData.tickets_sold            || 0,
    activeCompetitions:  activeCount,
    pendingWinners:      pendingWinnersCount,
    drawsEndingSoon:     drawsEndingSoonCount,
    activeCompetitionsList: (endingSnap && endingSnap.docs) 
      ? endingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      : [],
    upcomingDrawsList,
    recentOrdersList
  };
}

/**
 * Fetches the list of all users with their competition participation counts.
 */
export async function fetchUsersList() {
  try {
    const userSnap = await getDocs(collection(db, "user"));
    // Process each user concurrently using Promise.all to eliminate sequential bottlenecks
    const promises = userSnap.docs.map(async (d) => {
      const userData = d.data();
      const uid = d.id;

      try {
        // Dynamically calculate competitions entered
        const compsCountSnap = await getCountFromServer(
          query(
            collection(db, "competition"),
            where("participants", "array-contains", uid)
          )
        );

        return {
          id: uid,
          ...userData,
          compsEntered: compsCountSnap.data().count
        };
      } catch (err) {
        console.warn(`[AdminService] Could not fetch comp count for ${uid}`, err);
        return {
          id: uid,
          ...userData,
          compsEntered: 0
        };
      }
    });

    const usersList = await Promise.all(promises);

    return usersList;
  } catch (error) {
    console.error("[AdminService] Error fetching users list:", error);
    throw error;
  }
}

/**
 * Fetches comprehensive details for a single user, including orders and tickets.
 */
export async function fetchUserDetail(uid) {
  try {
    // 1. Fetch core user profile
    const userRef = doc(db, "user", uid);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) throw new Error("User not found");
    const userData = { id: uid, ...userDoc.data() };

    // 2. Fetch all related data in parallel
    const [ordersSnap, ticketsSnap, referralsSnap, bonusLogsSnap] = await Promise.all([
      getDocs(query(collection(db, "order"), where("user_ref", "in", [uid, userRef, `/user/${uid}`]))),
      getDocs(query(collection(db, "ticket"), where("user_id", "in", [uid, userRef, `/user/${uid}`]))),
      getDocs(query(collection(db, "referrals"), where("referrer_id", "in", [uid, userRef, `/user/${uid}`]))),
      getDocs(query(collection(db, "free_ticket_log"), where("user_id", "in", [uid, userRef, `/user/${uid}`])))
    ]);

    // Helper: Sort in memory to avoid "Query requires an index" error
    const sortDesc = (a, b) => {
      const timeA = (a.created_at?.toMillis ? a.created_at.toMillis() : (a.created_at ? new Date(a.created_at).getTime() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0)));
      const timeB = (b.created_at?.toMillis ? b.created_at.toMillis() : (b.created_at ? new Date(b.created_at).getTime() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0)));
      return timeB - timeA;
    };

    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortDesc);
    const tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortDesc);

    // 3. Resolve Referral User Names
    const referrals = await Promise.all(referralsSnap.docs.map(async d => {
      const refData = d.data();
      let referredName = "Unknown User";
      let referredEmail = "N/A";
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

    // 4. Resolve Bonus Log Competition Titles
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

    // Sort referrals and logs newest first
    referrals.sort(sortDesc);
    bonusLogs.sort(sortDesc);

    // 5. Resolve Competition names for the orders
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

    // 6. Group tickets by competition
    const compMap = {};
    tickets.forEach(tk => {
      const cId = tk.competition_id;
      if (!compMap[cId]) compMap[cId] = { id: cId, tickets: [], title: "Loading..." };
      compMap[cId].tickets.push(tk);
    });

    const resolvedComps = await Promise.all(Object.values(compMap).map(async (item) => {
      let title = "Unknown Competition";
      let status = "Ended";
      try {
        const cSnap = await getDoc(doc(db, "competition", item.id));
        if (cSnap.exists()) {
          title = cSnap.data().title;
          status = cSnap.data().status;
        }
      } catch (e) { /* ignore */ }
      return { ...item, title, status };
    }));

    return {
      profile: userData,
      orders: resolvedOrders,
      tickets: tickets,
      competitions: resolvedComps,
      referralsList: referrals,
      bonusLogs: bonusLogs
    };
  } catch (error) {
    console.error(`[AdminService] Error fetching user detail for ${uid}:`, error);
    throw error;
  }
}

/**
 * Fetches the list of all orders utilizing denormalized fields to prevent N+1 query problems.
 * Also retrieves instant aggregate metrics for the dashboard header.
 */
export async function fetchOrdersList() {
  try {
    // 1. Fetch all orders (no orderBy needed server-side, we sort locally to avoid index reqs)
    const ordersSnap = await getDocs(collection(db, "order"));
    
    // Sort Newest First in memory
    const sortDesc = (a, b) => {
      const timeA = (a.created_at?.toMillis ? a.created_at.toMillis() : (a.created_at ? new Date(a.created_at).getTime() : 0));
      const timeB = (b.created_at?.toMillis ? b.created_at.toMillis() : (b.created_at ? new Date(b.created_at).getTime() : 0));
      return timeB - timeA;
    };

    const ordersList = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortDesc);

    // 2. Fetch total order count directly via server aggregation
    const countSnap = await getCountFromServer(collection(db, "order"));
    const totalOrders = countSnap.data().count;

    // 3. Fetch global revenue instantly
    const globalSnap = await getDoc(doc(db, "system_metrics", "global_stats"));
    const totalRevenue = globalSnap.exists() ? (globalSnap.data().total_revenue || 0) : 0;

    return {
      orders: ordersList,
      totalOrders,
      totalRevenue
    };
  } catch (error) {
    console.error("[AdminService] Error fetching orders list:", error);
    throw error;
  }
}

/**
 * Fetches a single order's complete details including its generated tickets.
 */
export async function fetchOrderDetail(orderId) {
  try {
    const orderDoc = await getDoc(doc(db, "order", orderId));
    if (!orderDoc.exists()) throw new Error("Order not found");
    const orderData = { id: orderDoc.id, ...orderDoc.data() };

    // Fetch associated tickets
    const ticketsQuery = query(collection(db, "ticket"), where("order_id", "==", orderId));
    const ticketsSnap = await getDocs(ticketsQuery);
    
    // Sort tickets by ticket_number just to keep them in order
    const tickets = ticketsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.ticket_number || 0) - (b.ticket_number || 0));

    return {
      ...orderData,
      ticketsList: tickets
    };
  } catch (error) {
    console.error(`[AdminService] Error fetching order detail for ${orderId}:`, error);
    throw error;
  }
}

/**
 * Fetches the list of all users who have active referrals (referral_count > 0).
 */
export async function fetchReferralsList() {
  try {
    const q = query(collection(db, "user"), where("referral_count", ">", 0));
    const snap = await getDocs(q);
    
    const referrals = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })).sort((a, b) => (b.referral_count || 0) - (a.referral_count || 0));

    // Calculate aggregate stats for header
    const totalReferrals = referrals.reduce((acc, curr) => acc + (curr.referral_count || 0), 0);
    const totalRewards = referrals.reduce((acc, curr) => acc + (curr.total_free_tickets || 0), 0);

    return {
      referrals,
      stats: {
        totalReferrals,
        totalRewards,
        activeReferrers: referrals.length
      }
    };
  } catch (error) {
    console.error("[AdminService] Error fetching referrals list:", error);
    throw error;
  }
}

/**
 * Calls the backend Cloud Function to soft delete a user.
 * @param {string} userId The UID of the user to delete
 */
export async function softDeleteUser(userId) {
  try {
    const softDeleteFn = httpsCallable(functions, 'softDeleteUser');
    const result = await softDeleteFn({ userId });
    return result.data;
  } catch (error) {
    console.error("[AdminService] Error calling softDeleteUser:", error);
    throw error;
  }
}
/**
 * Fetches the audit trail for all bonus/free tickets from free_ticket_log.
 */
export async function fetchBonusTicketsList() {
  try {
    const logSnap = await getDocs(query(collection(db, "free_ticket_log"), orderBy("created_at", "desc")));
    
    const logs = await Promise.all(logSnap.docs.map(async d => {
      const logData = d.data();
      const logId = d.id;

      let userName = "Unknown User";
      let compTitle = "N/A";

      // Resolve User
      if (logData.user_id) {
        try {
          const uRef = typeof logData.user_id === 'string' 
            ? doc(db, "user", logData.user_id)
            : logData.user_id;
          const uSnap = await getDoc(uRef);
          if (uSnap.exists()) userName = uSnap.data().display_name || uSnap.data().name || "Unknown User";
        } catch (e) { /* ignore */ }
      }

      // Resolve Competition
      if (logData.competition_id) {
        try {
          const cRef = typeof logData.competition_id === 'string' 
            ? doc(db, "competition", logData.competition_id)
            : logData.competition_id;
          const cSnap = await getDoc(cRef);
          if (cSnap.exists()) compTitle = cSnap.data().title;
        } catch (e) { /* ignore */ }
      }

      return {
        id: logId,
        ...logData,
        userName,
        competitionTitle: compTitle
      };
    }));

    return logs;
  } catch (error) {
    console.error("[AdminService] Error fetching bonus tickets list:", error);
    throw error;
  }
}
