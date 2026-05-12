import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/shared/state/AuthContext';

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
  const { currentUser, userData } = useAuth();
  const [ticketedIds, setTicketedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only query for verified, logged-in users
    if (!currentUser || !userData?.is_verified) {
      setTicketedIds(new Set());
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchTicketedCompetitions = async () => {
      try {
        const userRef = doc(db, 'user', currentUser.uid);

        // Single batch query: all orders this user has placed
        const q = query(
          collection(db, 'order'),
          where('user_ref', '==', userRef)
        );

        const snap = await getDocs(q);

        if (!isMounted) return;

        // Extract unique competition IDs from each order's competition_id ref
        const ids = new Set();
        snap.docs.forEach((d) => {
          const compId = d.data().competition_id?.id;
          if (compId) ids.add(compId);
        });

        setTicketedIds(ids);
      } catch (err) {
        console.error('[useUserTicketedCompetitions] Error fetching orders:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTicketedCompetitions();

    return () => { isMounted = false; };
  }, [currentUser?.uid, userData?.is_verified]);

  return { ticketedIds, loading };
}
