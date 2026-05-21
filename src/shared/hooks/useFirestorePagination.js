import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  collection,
  query,
  getDocs,
  getCountFromServer,
  startAfter,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

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

/**
 * Custom hook for cursor-based Firestore pagination.
 *
 * @param {object} params
 * @param {string} params.collectionName - The Firestore collection name.
 * @param {Array} params.baseConstraints - Firestore query constraints (where, orderBy).
 * @param {number} params.pageSize - The number of documents to load per page.
 * @param {string} params.mode - 'paginate' (page-by-page next/prev) or 'append' (infinite scroll / load more).
 * @returns {object} Pagination states and controller functions.
 */
export function useFirestorePagination({
  collectionName,
  baseConstraints = [],
  pageSize = 10,
  mode = 'paginate',
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Tracks starting/ending cursor of loaded pages
  // cursorsRef.current[pageIndex] holds the last doc from page (pageIndex - 1)
  // For page 1, the cursor is null (or undefined)
  const cursorsRef = useRef({ 1: null });
  const lastDocRef = useRef(null);

  // Compute a stable query signature to prevent infinite fetching loops
  const constraintsSignature = useMemo(() => {
    const safeConstraints = Array.isArray(baseConstraints) ? baseConstraints : [];
    return getQuerySignature(safeConstraints);
  }, [baseConstraints]);

  // Fetch total count matching query (without page limits)
  const fetchTotalCount = useCallback(async (baseQuery) => {
    try {
      const countSnap = await getCountFromServer(baseQuery);
      const count = countSnap.data().count;
      setTotalCount(count);
      setTotalPages(Math.ceil(count / pageSize) || 1);
    } catch (err) {
      console.error(`[useFirestorePagination:${collectionName}] Error fetching count:`, err);
    }
  }, [collectionName, pageSize]);

  // Main loader function
  const loadPage = useCallback(
    async (pageNumber, isRefresh = false) => {
      if (!collectionName) {
        setItems([]);
        setLoading(false);
        return;
      }

      try {
        if (isRefresh || pageNumber === 1) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);

        const collectionRef = collection(db, collectionName);
        
        // Build base query constraints
        const safeConstraints = Array.isArray(baseConstraints) ? baseConstraints : [];
        const baseQuery = query(collectionRef, ...safeConstraints);

        // Fetch count if it's the first page or forced refresh
        if (isRefresh || pageNumber === 1) {
          void fetchTotalCount(baseQuery);
        }

        // Retrieve starting cursor for this page
        let cursor = null;
        if (pageNumber > 1 && !isRefresh) {
          cursor = cursorsRef.current[pageNumber];
        }

        // Construct dynamic query
        const queryParams = [...safeConstraints, firestoreLimit(pageSize)];
        if (cursor) {
          queryParams.push(startAfter(cursor));
        }

        const paginatedQuery = query(collectionRef, ...queryParams);
        const snapshot = await getDocs(paginatedQuery);

        const fetchedItems = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          _docSnap: doc, // preserve raw snapshot for cursor logic in user views if needed
        }));

        const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
        lastDocRef.current = lastDoc;

        // Cache cursor for next page (pageNumber + 1)
        if (lastDoc) {
          cursorsRef.current[pageNumber + 1] = lastDoc;
        }

        if (mode === 'append' && pageNumber > 1) {
          setItems(prev => [...prev, ...fetchedItems]);
        } else {
          setItems(fetchedItems);
        }

        setHasMore(snapshot.docs.length === pageSize);
        setCurrentPage(pageNumber);
      } catch (err) {
        console.error(`[useFirestorePagination:${collectionName}] Fetch error:`, err);
        setError(err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [collectionName, constraintsSignature, pageSize, mode, fetchTotalCount]
  );

  // Initialize page on parameter changes
  useEffect(() => {
    cursorsRef.current = { 1: null };
    lastDocRef.current = null;
    void loadPage(1, true);
  }, [collectionName, constraintsSignature, pageSize]);

  const nextPage = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void loadPage(currentPage + 1);
  }, [currentPage, loading, loadingMore, hasMore, loadPage]);

  const prevPage = useCallback(() => {
    if (loading || loadingMore || currentPage <= 1) return;
    void loadPage(currentPage - 1);
  }, [currentPage, loading, loadingMore, loadPage]);

  const refresh = useCallback(() => {
    cursorsRef.current = { 1: null };
    lastDocRef.current = null;
    void loadPage(1, true);
  }, [loadPage]);

  const goToPage = useCallback((pageNumber) => {
    if (loading || loadingMore || pageNumber < 1 || pageNumber > totalPages) return;
    if (cursorsRef.current[pageNumber] !== undefined) {
      void loadPage(pageNumber);
    } else {
      console.warn(`[useFirestorePagination] Cursor for page ${pageNumber} not cached yet. Paginating sequentially is recommended.`);
    }
  }, [loading, loadingMore, totalPages, loadPage]);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    currentPage,
    totalCount,
    totalPages,
    nextPage,
    prevPage,
    goToPage,
    refresh,
  };
}

export default useFirestorePagination;
