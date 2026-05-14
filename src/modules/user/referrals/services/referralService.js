import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

const REFERRALS_COLLECTION = 'referrals';
const USERS_COLLECTION = 'user';

/**
 * @typedef {Object} ReferralDoc
 * @property {import('firebase/firestore').DocumentReference} referrer_id
 * @property {import('firebase/firestore').DocumentReference} referred_user_id
 * @property {string} referral_code
 * @property {'free_ticket'} reward_type
 * @property {number} reward_value
 * @property {boolean} reward_issued
 * @property {import('firebase/firestore').Timestamp|null} reward_issued_at
 * @property {import('firebase/firestore').Timestamp} created_at
 */

/**
 * Fetch pending referral rewards for a referrer.
 * @param {string} uid
 * @returns {Promise<Array<{id: string; updateTime: import('firebase/firestore').Timestamp} & ReferralDoc>>}
 */
export const fetchPendingReferralRewards = async (uid) => {
  if (!uid) throw new Error('Missing user id.');

  const referrerRef = doc(db, USERS_COLLECTION, uid);
  const q = query(
    collection(db, REFERRALS_COLLECTION),
    where('referrer_id', '==', referrerRef),
    where('reward_issued', '==', false)
  );

  const snap = await getDocs(q);
  if (snap.empty) return [];

  return snap.docs
    .map((d) => ({
      id: d.id,
      updateTime: d.updateTime,
      ...d.data(),
    }))
    .filter((d) => d.reward_type !== 'admin_bonus');
};

/**
 * Claim all pending referral rewards for the current user.
 * @param {string} uid
 * @returns {Promise<{ totalClaimed: number; referralCount: number }>} 
 */
export const claimPendingReferralRewards = async (uid) => {
  if (!uid) throw new Error('Missing user id.');

  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);

  // EDGE CASE: User deleted or missing profile document
  if (!userSnap.exists()) {
    throw new Error('User profile not found.');
  }

  const pendingReferrals = await fetchPendingReferralRewards(uid);

  // EDGE CASE: Empty reward query results
  if (pendingReferrals.length === 0) {
    throw new Error('No pending referral rewards.');
  }

  let totalRewardValue = 0;
  const batch = writeBatch(db);

  for (const referral of pendingReferrals) {
    // EDGE CASE: Already claimed rewards or invalid reward data
    if (referral.reward_issued || referral.reward_type !== 'free_ticket') {
      throw new Error('Referral reward is not claimable.');
    }
    if (typeof referral.reward_value !== 'number' || referral.reward_value <= 0) {
      throw new Error('Invalid referral reward value.');
    }
    if (!referral.referrer_id || referral.referrer_id.id !== uid) {
      // EDGE CASE: Stale UI state or tampered referral list
      throw new Error('Referral reward does not belong to this user.');
    }

    totalRewardValue += referral.reward_value;

    const referralRef = doc(db, REFERRALS_COLLECTION, referral.id);
    batch.update(
      referralRef,
      {
        reward_issued: true,
        reward_issued_at: serverTimestamp(),
      },
      // EDGE CASE: Race conditions between read and claim
      { lastUpdateTime: referral.updateTime }
    );
  }

  // EDGE CASE: Prevent partial batch failure by using a single atomic batch
  batch.update(userRef, {
    free_tickets: increment(totalRewardValue),
    total_free_tickets: increment(totalRewardValue),
    referral_count: increment(pendingReferrals.length),
  });

  try {
    await batch.commit();
    return { totalClaimed: totalRewardValue, referralCount: pendingReferrals.length };
  } catch (error) {
    // EDGE CASE: Duplicate claims or deleted referral docs between read and commit
    if (error?.code === 'failed-precondition') {
      throw new Error('Referral reward was already claimed.');
    }
    if (error?.code === 'not-found') {
      throw new Error('Referral reward no longer exists.');
    }
    throw error;
  }
};

/**
 * Fetch all referrals for a user (both pending and claimed) and resolve referred user details.
 * @param {string} uid
 * @returns {Promise<Array<any>>}
 */
export const fetchAllReferrals = async (uid) => {
  if (!uid) throw new Error('Missing user id.');

  const referrerRef = doc(db, USERS_COLLECTION, uid);
  const q = query(
    collection(db, REFERRALS_COLLECTION),
    where('referrer_id', '==', referrerRef)
  );

  const snap = await getDocs(q);
  if (snap.empty) return [];

  const referrals = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      let referredUser = { display_name: 'Unknown User' };

      if (data.referred_user_id) {
        try {
          const uSnap = await getDoc(data.referred_user_id);
          if (uSnap.exists()) {
            referredUser = uSnap.data();
          }
        } catch (err) {
          console.error('Failed to fetch referred user:', err);
        }
      }

      return {
        id: d.id,
        updateTime: d.updateTime,
        ...data,
        referredUser,
      };
    })
  );

  return referrals
    .filter((r) => r.reward_type !== 'admin_bonus')
    .sort((a, b) => b.created_at?.toMillis() - a.created_at?.toMillis());
};

/**
 * Claim a single referral reward.
 * @param {string} uid
 * @param {string} referralId
 * @returns {Promise<void>}
 */
export const claimSingleReferralReward = async (uid, referralId) => {
  if (!uid || !referralId) throw new Error('Missing user id or referral id.');

  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error('User profile not found.');
  }

  const referralRef = doc(db, REFERRALS_COLLECTION, referralId);
  const referralSnap = await getDoc(referralRef);

  if (!referralSnap.exists()) {
    throw new Error('Referral not found.');
  }

  const referral = referralSnap.data();

  if (referral.reward_issued || referral.reward_type !== 'free_ticket') {
    throw new Error('Referral reward is not claimable.');
  }
  if (!referral.referrer_id || referral.referrer_id.id !== uid) {
    throw new Error('Referral reward does not belong to this user.');
  }

  const batch = writeBatch(db);
  
  batch.update(
    referralRef,
    {
      reward_issued: true,
      reward_issued_at: serverTimestamp(),
    },
    { lastUpdateTime: referralSnap.updateTime }
  );

  batch.update(userRef, {
    free_tickets: increment(referral.reward_value),
    total_free_tickets: increment(referral.reward_value),
    referral_count: increment(1),
  });

  await batch.commit();
};
