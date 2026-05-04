import { doc, getDoc, collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from '@/config/firebase';

/**
 * Fetches the audit trail for all bonus/free tickets from free_ticket_log.
 */
export async function fetchBonusTicketsList() {
  try {
    const logSnap = await getDocs(query(collection(db, "free_ticket_log"), orderBy("created_at", "desc")));
    
    const logs = await Promise.all(logSnap.docs.map(async d => {
      const logData = d.data();
      let userName = "Unknown User", compTitle = "N/A";

      if (logData.user_id) {
        try {
          const uRef = typeof logData.user_id === 'string' ? doc(db, "user", logData.user_id) : logData.user_id;
          const uSnap = await getDoc(uRef);
          if (uSnap.exists()) userName = uSnap.data().display_name || uSnap.data().name || "Unknown User";
        } catch (e) { /* ignore */ }
      }

      if (logData.competition_id) {
        try {
          const cRef = typeof logData.competition_id === 'string' ? doc(db, "competition", logData.competition_id) : logData.competition_id;
          const cSnap = await getDoc(cRef);
          if (cSnap.exists()) compTitle = cSnap.data().title;
        } catch (e) { /* ignore */ }
      }

      return { id: d.id, ...logData, userName, competitionTitle: compTitle };
    }));

    return logs;
  } catch (error) {
    console.error("[BonusService] Error fetching bonus tickets list:", error);
    throw error;
  }
}
