import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';

export function usePlatformStats() {
  const [stats, setStats] = useState({
    participants: 0,
    winners: 0,
    prizes: 0,
    countries: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Query competitions that are not drafts or cancelled
    const q = query(
      collection(db, 'competition'),
      where('status', 'not-in', ['draft', 'cancelled'])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let participants = 0;
        let winners = 0;
        let prizes = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          const status = data.status;

          // Add to participants (total tickets sold across all valid competitions)
          participants += Number(data.sold_tickets) || 0;

          // Add to prizes (sum of all prize values)
          prizes += Number(data.prize_value) || 0;

          // Count winners (competitions that have concluded and picked a winner)
          if (['winner_announced', 'completed'].includes(status)) {
            winners += 1;
          }
        });

        setStats({
          participants,
          winners,
          prizes,
          countries: 0, // Defaulting to 0 as per implementation plan fallback
        });
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching platform stats:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { stats, loading };
}
