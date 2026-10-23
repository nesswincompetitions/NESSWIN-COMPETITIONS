import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  getDocs,
  writeBatch,
  serverTimestamp,
  increment,
  where,
  limit
} from "firebase/firestore";
import { db } from '@/config/firebase';
import { functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';

/**
 * Searches users by email or name
 */
export async function searchUsers(searchTerm) {
  if (!searchTerm || searchTerm.length < 2) return [];
  try {
    const term = searchTerm.toLowerCase();
    const usersSnap = await getDocs(collection(db, "user"));
    
    const results = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => {
        const email = (u.email || '').toLowerCase();
        const name = (u.display_name || u.name || '').toLowerCase();
        return email.includes(term) || name.includes(term);
      })
      .slice(0, 10);
    
    return results;
  } catch (error) {
    console.error("[BonusService] Error searching users:", error);
    throw error;
  }
}

/**
 * Grants admin bonus tickets to a user
 * 
 * This function:
 * 1. Validates the quantity (must be positive integer)
 * 2. Creates N referral documents with reward_type="admin_bonus"
 * 3. Updates user doc with incremented free_tickets and total_free_tickets
 * 4. Creates a notification
 * 
 * @param {string} userId - The user ID receiving the bonus
 * @param {number} quantity - Number of tickets to grant (must be positive)
 * @param {string} reason - Admin's reason for granting (optional)
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function grantAdminBonus(userId, quantity, reason = '') {
  try {
    const grant = httpsCallable(functions, 'grantAdminBonus');
    const resp = await grant({ userId, quantity, reason });
    // resp.data should contain { success, message }
    return resp.data;
  } catch (error) {
    console.error("[BonusService] Error granting admin bonus:", error);
    throw error;
  }
}

/**
 * Revokes all remaining unused admin bonus credits represented by the given credit IDs.
 *
 * Backend contract (revokeAdminBonus callable):
 * - reason is mandatory, all IDs are validated server-side before any mutation
 * - returns { success, complete, outcome, revokedCount, eligibleCount,
 *            remainingCount, retryable, retryableCreditIds, skippedRedeemed,
 *            skippedRevoked, drift, balanceInvalid, stateChanges }
 * - success is true only for outcome="complete". Partial progress is reported
 *   with outcome="partial"; blocked state/balance outcomes use "blocked".
 * - retryableCreditIds are response-time candidates, not live-state guarantees;
 *   the backend validates every ID again before a retry mutates anything.
 * - partial completion and balance/state conflicts are returned as structured
 *   outcomes; only unexpected first-chunk operational failures throw "aborted"
 *
 * @param {string} userId - Target user ID owning the credits
 * @param {string[]} creditIds - Referral document IDs submitted by the UI grouping
 * @param {string} reason - Mandatory admin reason
 * @returns {Promise<Object>}
 */
export async function revokeAdminBonus(userId, creditIds, reason) {
  try {
    const revoke = httpsCallable(functions, 'revokeAdminBonus');
    const resp = await revoke({ userId, creditIds, reason });
    return resp.data;
  } catch (error) {
    console.error("[BonusService] Error revoking admin bonus credits:", error);
    throw error;
  }
}

/**
 * Fetches the audit trail for all bonus/free tickets from free_ticket_log.
 */
export async function fetchBonusTicketsList() {
  try {
    const logSnap = await getDocs(query(
      collection(db, "free_ticket_log"), 
      orderBy("created_at", "desc")
    ));
    
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

/**
 * Fetches the total count of issued admin bonus tickets
 * (counts documents in 'referrals' collection with reward_type='admin_bonus')
 */
export async function fetchAdminBonusTotal() {
  try {
    const q = query(collection(db, "referrals"), where("reward_type", "==", "admin_bonus"));
    const snap = await getDocs(q);
    return snap.size;
  } catch (error) {
    console.error("[BonusService] Error fetching admin bonus total:", error);
    return 0;
  }
}
