import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
 * Fetch pending referral rewards for a referrer.
 * @param {string} uid
 * @returns {Promise<Array<any>>}
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
 * Fetch all referrals for a user.
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
 * Realtime subscription for all referrals of a user.
 */
export const subscribeAllReferrals = (uid, onData, onError) => {
  if (!uid) {
    onData([]);
    return () => {};
  }

  const referrerRef = doc(db, USERS_COLLECTION, uid);
  const q = query(
    collection(db, REFERRALS_COLLECTION),
    where('referrer_id', '==', referrerRef)
  );

  const userCache = new Map();

  return onSnapshot(
    q,
    async (snapshot) => {
      const referrals = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const referredUserRef = data.referred_user_id;
          let referredUser = { display_name: 'Unknown User' };

          if (referredUserRef?.id) {
            if (userCache.has(referredUserRef.id)) {
              referredUser = userCache.get(referredUserRef.id);
            } else {
              try {
                const userSnap = await getDoc(referredUserRef);
                if (userSnap.exists()) {
                  referredUser = userSnap.data();
                }
              } catch {
                referredUser = { display_name: 'Unknown User' };
              }
              userCache.set(referredUserRef.id, referredUser);
            }
          }

          return {
            id: docSnap.id,
            updateTime: docSnap.updateTime,
            ...data,
            referredUser,
          };
        })
      );

      const normalized = referrals
        .filter((referral) => referral.reward_type !== 'admin_bonus')
        .sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));

      onData(normalized);
    },
    onError
  );
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
