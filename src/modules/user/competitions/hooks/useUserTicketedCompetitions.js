import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';

/**
 * useUserTicketedCompetitions
 *
 * Fetches ALL competition IDs that the current user has purchased tickets for
 * in a SINGLE batch query from the `order` collection.
 *
 * Returns a Set<string> of competition document IDs for O(1) per-card lookups.
 *
 * Only runs when a logged-in, verified user is present.
 */
export function useUserTicketedCompetitions() {
  const { currentUser } = useAuth();
  const { userData } = useUserData();
  const [ticketedIds, setTicketedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only query for verified, logged-in users
    if (!currentUser || !userData?.is_verified) {
      setTicketedIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);

    const userRef = doc(db, 'user', currentUser.uid);
    const q = query(
      collection(db, 'order'),
      where('user_ref', '==', userRef)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const ids = new Set();
        snap.docs.forEach((d) => {
          const compId = d.data().competition_id?.id;
          if (compId) ids.add(compId);
        });
        setTicketedIds(ids);
        setLoading(false);
      },
      (err) => {
        console.error('[useUserTicketedCompetitions] Error subscribing orders:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUser?.uid, userData?.is_verified]);

  return { ticketedIds, loading };
}
