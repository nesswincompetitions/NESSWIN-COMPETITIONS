import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from '@/config/firebase';

/**
 * Fetches all users who have active referrals (referral_count > 0).
 */
export async function fetchReferralsList() {
  try {
    const q = query(collection(db, "user"), where("referral_count", ">", 0));
    const snap = await getDocs(q);
    
    const referrals = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })).sort((a, b) => (b.referral_count || 0) - (a.referral_count || 0));

    const totalReferrals = referrals.reduce((acc, curr) => acc + (curr.referral_count || 0), 0);
    const totalRewards   = referrals.reduce((acc, curr) => acc + (curr.total_free_tickets || 0), 0);

    return {
      referrals,
      stats: { totalReferrals, totalRewards, activeReferrers: referrals.length }
    };
  } catch (error) {
    console.error("[ReferralsService] Error fetching referrals list:", error);
    throw error;
  }
}
