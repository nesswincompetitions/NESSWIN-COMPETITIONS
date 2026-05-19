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
  const [
    dashboardResult, activeResult, upcomingResult, ordersResult
  ] = await Promise.allSettled([
    getDoc(doc(db, "system_metrics", "dashboard")),
    getDocs(query(collection(db, "competition"), where("status", "==", "active"), limit(10))),
    getDocs(query(collection(db, "competition"), where("status", "==", "active"), orderBy("draw_date", "asc"), limit(3))),
    getDocs(query(collection(db, "order"), orderBy("created_at", "desc"), limit(5)))
  ]);

  const ok = (result, fallback) => {
    if (result.status === "fulfilled") return result.value;
    console.error("[DashboardService] Query failed:", result.reason);
    return fallback;
  };

  const dashboardSnap = ok(dashboardResult, null);
  const activeSnap    = ok(activeResult,    null);
  const upcomingSnap  = ok(upcomingResult,  null);
  const ordersSnap    = ok(ordersResult,    null);

  const dashboardData = dashboardSnap?.exists?.() ? dashboardSnap.data() : {};

  const activeCompetitionsList = activeSnap?.docs
    ? activeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    : [];

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
    totalRevenue:          dashboardData.total_revenue || 0,
    totalRegisteredUsers:  dashboardData.total_registered_users || dashboardData.registered_users || 0,
    ticketsSoldToday:      dashboardData.tickets_sold_today || 0,
    activeCompetitions:    dashboardData.total_active_competitions || 0,
    totalWinners:          dashboardData.total_winners || 0,
    drawsEndingSoon:       dashboardData.draws_ending_soon || 0,
    activeCompetitionsList,
    upcomingDrawsList,
    recentOrdersList
  };
}
