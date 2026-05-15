import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';

/**
 * Realtime listener for the authenticated user's profile document.
 */
export function useRealtimeUser(userId) {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Guard auth race conditions while auth state is still resolving.
    if (!userId) {
      setUserData(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const userRef = doc(db, 'user', userId);
    const unsubscribe = onSnapshot(
      userRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setUserData(null);
          setLoading(false);
          return;
        }

        setUserData({
          id: docSnap.id,
          ...docSnap.data()
        });
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError);
        setUserData(null);
        setLoading(false);
      }
    );

    // Cleanup listener on user change/unmount to prevent leaks.
    return () => unsubscribe();
  }, [userId]);

  return { userData, loading, error };
}

export default useRealtimeUser;
