import { useEffect, useMemo, useState } from 'react';
import { collection, limit as firestoreLimit, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/config/firebase';

const DEFAULT_LIMIT = 100;

const getConstraintSignature = (constraint) => {
  if (!constraint || typeof constraint !== 'object') {
    return String(constraint);
  }

  const entries = Object.keys(constraint)
    .sort()
    .map((key) => [key, constraint[key]]);

  return JSON.stringify(entries, (key, value) => {
    if (value && typeof value === 'object') {
      if (typeof value.toJSON === 'function') {
        try {
          return value.toJSON();
        } catch {
          return value;
        }
      }

      if (value.constructor && value.constructor !== Object && value.constructor !== Array) {
        return {
          constructor: value.constructor.name,
          ...value,
        };
      }
    }

    return value;
  });
};

const getQuerySignature = (constraints = []) =>
  constraints.map((constraint) => getConstraintSignature(constraint)).join('|');

const hasLimitConstraint = (constraints = []) =>
  constraints.some((constraint) => constraint?.type === 'limit');

const logFirestoreError = (collectionName, snapshotError) => {
  const message = snapshotError?.message ?? 'Unknown Firestore error';
  const indexUrlMatch = message.match(/https:\/\/console\.firebase\.google\.com\S+/);

  if (snapshotError?.code === 'failed-precondition' || /index/i.test(message)) {
    console.error(
      `[useRealtimeCollection:${collectionName}] Firestore composite index required.`,
      snapshotError
    );

    if (indexUrlMatch?.[0]) {
      console.error(
        `[useRealtimeCollection:${collectionName}] Open the index creation link: ${indexUrlMatch[0]}`
      );
    }
    return;
  }

  console.error(`[useRealtimeCollection:${collectionName}] Firestore listener error:`, snapshotError);
};

/**
 * Reusable realtime Firestore collection hook for admin views.
 *
 * @param {string} collectionName
 * @param {Array} queryConstraints
 * @returns {{ data: Array, loading: boolean, error: Error | null }}
 */
export const useRealtimeCollection = (collectionName, queryConstraints = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizedConstraints = useMemo(() => {
    const safeConstraints = Array.isArray(queryConstraints) ? queryConstraints : [];

    if (hasLimitConstraint(safeConstraints)) {
      return safeConstraints;
    }

    return [...safeConstraints, firestoreLimit(DEFAULT_LIMIT)];
  }, [queryConstraints]);

  const constraintsSignature = useMemo(
    () => getQuerySignature(normalizedConstraints),
    [normalizedConstraints]
  );

  useEffect(() => {
    if (!collectionName) {
      setData([]);
      setLoading(false);
      setError(new Error('A collectionName is required for useRealtimeCollection.'));
      return undefined;
    }

    setLoading(true);
    setError(null);

    let unsubscribe = () => {};

    try {
      const collectionRef = collection(db, collectionName);
      const firestoreQuery = query(collectionRef, ...normalizedConstraints);

      unsubscribe = onSnapshot(
        firestoreQuery,
        (snapshot) => {
          try {
            const nextData = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));

            setData(nextData);
            setLoading(false);
          } catch (snapshotTransformError) {
            setError(snapshotTransformError);
            setLoading(false);
            console.error(
              `[useRealtimeCollection:${collectionName}] Snapshot transform error:`,
              snapshotTransformError
            );
          }
        },
        (snapshotError) => {
          setError(snapshotError);
          setLoading(false);
          logFirestoreError(collectionName, snapshotError);
        }
      );
    } catch (setupError) {
      setError(setupError);
      setLoading(false);
      console.error(`[useRealtimeCollection:${collectionName}] Listener setup error:`, setupError);
    }

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [collectionName, constraintsSignature]);

  return { data, loading, error };
};

export default useRealtimeCollection;