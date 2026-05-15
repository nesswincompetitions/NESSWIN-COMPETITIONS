import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/shared/state/AuthContext';

/**
 * Hook to track unread message counts for the admin across all active chats.
 * 
 * It listens to:
 * 1. Support chats assigned to this admin.
 * 2. Winner chats assigned to this admin.
 * 
 * @returns {Object} { supportUnread, winnerUnread, totalUnread, loading }
 */
export const useAdminUnreadCounts = () => {
  const { currentUser } = useAuth();
  const [counts, setCounts] = useState({
    support: 0,
    winner: 0,
    loading: true
  });

  useEffect(() => {
    if (!currentUser?.uid) {
      setCounts(prev => ({ ...prev, loading: false }));
      return;
    }

    const adminRef = doc(db, 'user', currentUser.uid);
    const q = query(
      collection(db, 'chats'),
      where('assigned_admin_id', '==', adminRef),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let supportUnread = 0;
      let winnerUnread = 0;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        // unread_sender_count represents messages from the user to the admin
        const unread = Number(data.unread_sender_count || 0);

        if (data.chat_type === 'winner_chat') {
          winnerUnread += unread;
        } else {
          supportUnread += unread;
        }
      });

      setCounts({
        support: supportUnread,
        winner: winnerUnread,
        loading: false
      });
    }, (error) => {
      console.error('[useAdminUnreadCounts] Error listening to unread counts:', error);
      setCounts(prev => ({ ...prev, loading: false }));
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  return useMemo(() => ({
    supportUnread: counts.support,
    winnerUnread: counts.winner,
    totalUnread: counts.support + counts.winner,
    loading: counts.loading
  }), [counts]);
};

export default useAdminUnreadCounts;
