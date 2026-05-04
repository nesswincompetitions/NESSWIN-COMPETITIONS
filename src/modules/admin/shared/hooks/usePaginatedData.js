import { useState, useRef, useCallback } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  startAfter, 
  endBefore,
  limitToLast,
  where, 
  documentId
} from 'firebase/firestore';
import { db } from '@/config/firebase';

// 1. The Out-of-Lifecycle Cache (Crucial)
// This global object survives navigation between different pages/components.
export const globalCache = {};

// Cache for pagination state to survive unmounts
export const pageCache = {};
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Helper to safely resolve a relation from the global cache.
 * @param {string} collectionName - The name of the collection (e.g., 'user')
 * @param {string|object} foreignKey - The ID or DocumentReference
 * @returns {object|null} The cached document data or null if not found
 */
export const resolveRelation = (collectionName, foreignKey) => {
  if (!foreignKey) return null;
  // Handle both DocumentReference and string IDs
  const id = foreignKey.id || (typeof foreignKey === 'string' ? foreignKey : null);
  if (!id) return null;
  
  return globalCache[collectionName]?.[id] || null;
};

/**
 * usePaginatedData
 * Highly performant pagination system that eliminates N+1 queries.
 * 
 * @param {Object} config
 * @param {string} config.collectionName - The main collection to fetch from.
 * @param {string} [config.orderByField='created_at'] - Field to order by.
 * @param {string} [config.orderDirection='desc'] - Order direction ('asc' or 'desc').
 * @param {number} [config.pageSize=20] - Number of items per page. Limit to 20 to safely use 'in' queries.
 * @param {Array} [config.relations=[]] - Array of objects defining relations to batch fetch. 
 *                                        Example: [{ collection: 'user', key: 'user_ref' }]
 * @param {Object} [config.initialFilters={}] - Initial filters to apply to the main query.
 */
export const usePaginatedData = ({
  collectionName,
  orderByField = 'created_at',
  orderDirection = 'desc',
  pageSize = 20,
  relations = [],
  initialFilters = {}
}) => {
  // Generate a unique cache key for this collection and filter combination
  const cacheKey = `${collectionName}_${orderByField}_${orderDirection}_${JSON.stringify(initialFilters)}`;
  
  // Initialize state from pageCache if it exists and hasn't expired
  const getCachedState = () => {
    const cached = pageCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp < DEFAULT_TTL)) return cached;
    return null;
  };

  const cachedState = getCachedState();

  const [data, setData] = useState(() => cachedState?.data || []);
  const [currentPage, setCurrentPage] = useState(() => cachedState?.currentPage || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Track filters to reset on change
  const filtersRef = useRef(initialFilters);
  
  // Cursors for pagination, initialized from cache
  const firstVisible = useRef(cachedState?.firstVisible || null);
  const lastVisible = useRef(cachedState?.lastVisible || null);
  const pageCursors = useRef(cachedState?.pageCursors || { 1: null });

  const fetchPage = useCallback(async (direction = 'next', targetPage = null) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      let q = query(collection(db, collectionName), orderBy(orderByField, orderDirection));

      // Apply equality filters
      Object.entries(filtersRef.current).forEach(([key, value]) => {
        if (value && value !== 'all') {
          q = query(q, where(key, '==', value));
        }
      });

      if (direction === 'next' && lastVisible.current) {
        q = query(q, startAfter(lastVisible.current), limit(pageSize));
      } else if (direction === 'prev' && firstVisible.current) {
        q = query(q, endBefore(firstVisible.current), limitToLast(pageSize));
      } else if (direction === 'jump' && targetPage && pageCursors.current[targetPage]) {
        // Jumping to a previously visited page where we saved the starting cursor
        q = query(q, startAfter(pageCursors.current[targetPage]), limit(pageSize));
      } else {
        // First page
        q = query(q, limit(pageSize));
      }

      const mainSnap = await getDocs(q);
      
      if (mainSnap.empty) {
        setLoading(false);
        return;
      }

      // Update cursors
      firstVisible.current = mainSnap.docs[0];
      lastVisible.current = mainSnap.docs[mainSnap.docs.length - 1];
      
      // Update current page
      let newPage = currentPage;
      if (direction === 'next') newPage = currentPage + 1;
      else if (direction === 'prev') newPage = currentPage - 1;
      else if (direction === 'jump') newPage = targetPage;
      else newPage = 1;

      setCurrentPage(newPage);

      // Save the cursor that leads to the NEXT page (so page 2's starting cursor is page 1's lastVisible)
      pageCursors.current[newPage + 1] = lastVisible.current;

      const rawRecords = mainSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Relational Batch Fetching (The Core Logic)
      if (relations.length > 0) {
        const missingIdsByCollection = {};

        // Extract unique missing IDs for each relation
        relations.forEach(rel => {
          const colName = rel.collection;
          const foreignKeyField = rel.key;

          if (!globalCache[colName]) {
            globalCache[colName] = {};
          }

          const missingIds = new Set();

          rawRecords.forEach(record => {
            const rawKey = record[foreignKeyField];
            if (!rawKey) return;
            
            // Handle DocumentReference or string ID
            const id = rawKey.id || (typeof rawKey === 'string' ? rawKey : null);
            
            if (id && !globalCache[colName][id]) {
              missingIds.add(id);
            }
          });

          if (missingIds.size > 0) {
            missingIdsByCollection[colName] = Array.from(missingIds);
          }
        });

        // Run batch queries for missing IDs
        const fillPromises = Object.entries(missingIdsByCollection).map(async ([colName, idsToFetch]) => {
          // Note: Since pageSize is max 20, idsToFetch.length will never exceed Firestore's 30 item 'in' limit.
          const relSnap = await getDocs(
            query(collection(db, colName), where(documentId(), 'in', idsToFetch))
          );
          
          relSnap.docs.forEach(d => {
            globalCache[colName][d.id] = { id: d.id, ...d.data() };
          });
        });

        if (fillPromises.length > 0) {
          await Promise.all(fillPromises);
        }
      }

      // 4. Data Delivery
      setData(rawRecords);

      // Save to global pageCache so it survives unmounts
      pageCache[cacheKey] = {
        data: rawRecords,
        currentPage: newPage,
        firstVisible: firstVisible.current,
        lastVisible: lastVisible.current,
        pageCursors: pageCursors.current,
        timestamp: Date.now()
      };

    } catch (err) {
      console.error(`[usePaginatedData - ${collectionName}] Error:`, err);
      setError(`Failed to fetch ${collectionName}`);
    } finally {
      setLoading(false);
    }
  }, [collectionName, orderByField, orderDirection, pageSize, relations, loading, currentPage, cacheKey]);

  const refresh = useCallback(() => {
    firstVisible.current = null;
    lastVisible.current = null;
    pageCursors.current = { 1: null };
    setCurrentPage(1);
    fetchPage('first');
  }, [fetchPage]);

  const setFilters = useCallback((newFilters) => {
    filtersRef.current = { ...filtersRef.current, ...newFilters };
    refresh();
  }, [refresh]);

  const goToPage = useCallback((pageNum) => {
    // If we're already on that page AND we have data, do nothing
    if (pageNum === currentPage && data.length > 0) return;
    
    if (pageNum === 1) fetchPage('first');
    else if (pageNum === currentPage + 1) fetchPage('next');
    else if (pageNum === currentPage - 1) fetchPage('prev');
    else if (pageCursors.current[pageNum]) fetchPage('jump', pageNum);
  }, [currentPage, data.length, fetchPage]);

  return {
    data,
    loading,
    error,
    currentPage,
    nextPage: () => fetchPage('next'),
    prevPage: () => fetchPage('prev'),
    goToPage,
    hasPageCursor: (pageNum) => !!pageCursors.current[pageNum] || pageNum === 1,
    refresh,
    setFilters,
    resolveRelation
  };
};
