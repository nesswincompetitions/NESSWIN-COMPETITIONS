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
import { db } from '@/config/firebase';

/**
 * Fetches all 6 KPI stats for the Admin Dashboard.
 */
export async function fetchDashboardStats() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysMs = now.getTime() + (7 * 24 * 60 * 60 * 1000);

  const [
    globalResult, dailyResult, activeResult,
    pendingResult, endingResult, upcomingResult, ordersResult
  ] = await Promise.allSettled([
    getDoc(doc(db, "system_metrics", "global_stats")),
    getDoc(doc(db, "daily_metrics", todayStr)),
    getCountFromServer(query(collection(db, "competition"), where("status", "==", "active"))),
    getDocs(query(collection(db, "competition"), where("status", "==", "ended"))),
    getDocs(query(collection(db, "competition"), where("status", "==", "active"))),
    getDocs(query(collection(db, "competition"), where("status", "==", "active"), orderBy("draw_date", "asc"), limit(3))),
    getDocs(query(collection(db, "order"), orderBy("created_at", "desc"), limit(5)))
  ]);

  const ok = (result, fallback) => {
    if (result.status === "fulfilled") return result.value;
    console.error("[DashboardService] Query failed:", result.reason);
    return fallback;
  };

  const globalSnap  = ok(globalResult,  null);
  const dailySnap   = ok(dailyResult,   null);
  const activeSnap  = ok(activeResult,  null);
  const pendingSnap  = ok(pendingResult,  null);
  const endingSnap   = ok(endingResult,   null);
  const upcomingSnap = ok(upcomingResult, null);
  const ordersSnap   = ok(ordersResult,   null);

  const globalData = globalSnap?.exists?.() ? globalSnap.data() : {};
  const dailyData  = dailySnap?.exists?.()  ? dailySnap.data()  : {};

  const activeCount = activeSnap ? activeSnap.data().count : 0;

  const pendingWinnersCount = (pendingSnap?.docs)
    ? pendingSnap.docs.filter(d => { const wr = d.data().winner_ref; return wr === null || wr === undefined; }).length
    : 0;

  const drawsEndingSoonCount = (endingSnap?.docs)
    ? endingSnap.docs.filter(d => {
        const data = d.data();
        const endTs = data.countdown_end?.toMillis ? data.countdown_end.toMillis() : data.countdown_end;
        return endTs && endTs >= now.getTime() && endTs <= sevenDaysMs;
      }).length
    : 0;

  const upcomingDrawsList = upcomingSnap?.docs
    ? upcomingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    : [];

  const recentOrdersList = [];
  if (ordersSnap?.docs) {
    for (const d of ordersSnap.docs) {
      const orderData = d.data();
      const rawUserRef = orderData.user_ref;
      const rawCompRef = orderData.competition_id;
      const uId = rawUserRef?.id ?? (typeof rawUserRef === 'string' ? rawUserRef : null);
      const cId = rawCompRef?.id ?? (typeof rawCompRef === 'string' ? rawCompRef : null);

      let userName = 'Unknown User', userEmail = 'N/A', competitionName = 'Unknown Competition';
      try {
        const [uSnap, cSnap] = await Promise.all([
          uId ? getDoc(doc(db, "user", uId)) : Promise.resolve(null),
          cId ? getDoc(doc(db, "competition", cId)) : Promise.resolve(null)
        ]);
        if (uSnap?.exists()) { userName = uSnap.data().display_name || 'Unknown User'; userEmail = uSnap.data().email || 'N/A'; }
        if (cSnap?.exists()) { competitionName = cSnap.data().title || 'Unknown Competition'; }
      } catch (e) { console.warn('[DashboardService] Could not resolve order refs:', e.message); }

      recentOrdersList.push({ id: d.id, ...orderData, userName, userEmail, competitionName });
    }
  }

  return {
    totalRevenue:          globalData.total_revenue           || 0,
    totalRegisteredUsers:  globalData.total_registered_users  || 0,
    ticketsSoldToday:      dailyData.tickets_sold             || 0,
    activeCompetitions:    activeCount,
    pendingWinners:        pendingWinnersCount,
    drawsEndingSoon:       drawsEndingSoonCount,
    activeCompetitionsList: endingSnap?.docs ? endingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [],
    upcomingDrawsList,
    recentOrdersList
  };
}
