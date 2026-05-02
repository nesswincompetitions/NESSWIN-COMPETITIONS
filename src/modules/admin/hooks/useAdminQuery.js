import { useState, useEffect, useCallback } from 'react';

// 1. Store outside React lifecycle
const globalApiCache = new Map();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// 3. Invalidation exports
export const invalidateCache = (key) => {
  globalApiCache.delete(key);
};

export const invalidateByPrefix = (prefix) => {
  for (let key of globalApiCache.keys()) {
    if (key.startsWith(prefix)) {
      globalApiCache.delete(key);
    }
  }
};

export const clearAdminCache = () => {
  globalApiCache.clear();
};

/**
 * Custom global query hook for the Admin Panel.
 * 
 * @param {string} baseKey - The root key (e.g., 'users', 'competitions')
 * @param {Function} fetchFn - Async function returning data
 * @param {Object} options - Configuration options
 * @param {Array} [options.dependencies=[]] - Array of dependency variables to create a unique cache key (e.g., [currentPage, filters])
 * @param {number} [options.ttl=300000] - Time to live in ms
 * @returns {Object} { data, loading, error, refresh, invalidate }
 */
export const useAdminQuery = (baseKey, fetchFn, options = {}) => {
  const { ttl = DEFAULT_TTL, dependencies = [] } = options;
  
  // 2. Cache key design
  // Serialize dependencies to ensure unique keys for different pages/filters
  const queryKey = dependencies.length > 0 
    ? `${baseKey}-${JSON.stringify(dependencies)}` 
    : baseKey;

  const [data, setData] = useState(() => {
    // Initial state setup (if cached and valid, initialize synchronously to prevent flicker)
    const cached = globalApiCache.get(queryKey);
    if (cached && cached.data !== undefined && (Date.now() - cached.timestamp < ttl)) {
      return cached.data;
    }
    return null;
  });
  
  const [loading, setLoading] = useState(() => data === null);
  const [error, setError] = useState(null);

  const executeFetch = useCallback(async (force = false) => {
    // 5. Memory growth problem
    if (globalApiCache.size >= MAX_CACHE_SIZE) {
      globalApiCache.clear(); // Simple cleanup for now
    }

    const cached = globalApiCache.get(queryKey);
    const now = Date.now();

    // 1 & 6. Timestamps and Not always fetching
    if (!force && cached && cached.data !== undefined) {
      if (now - cached.timestamp < ttl) {
        if (data !== cached.data) {
          setData(cached.data);
          setLoading(false);
        }
        return;
      }
    }

    // 4. Race condition issue (is there a promise already running?)
    if (!force && cached && cached.promise) {
      setLoading(true);
      try {
        const result = await cached.promise;
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Fetch the data
    setLoading(true);
    setError(null);
    
    try {
      const promise = fetchFn();
      
      // Store promise to block duplicate requests
      globalApiCache.set(queryKey, { promise, timestamp: now });
      
      const result = await promise;
      
      // Update cache with actual data
      globalApiCache.set(queryKey, {
        data: result,
        timestamp: Date.now()
      });
      
      setData(result);
    } catch (err) {
      console.error(`[useAdminQuery - ${queryKey}] Error:`, err);
      setError(err);
      globalApiCache.delete(queryKey); // clear failed promise
    } finally {
      setLoading(false);
    }
  }, [queryKey, fetchFn, ttl]);

  useEffect(() => {
    executeFetch();
  }, [queryKey]); // re-run if the serialized key changes

  return {
    data,
    setData,
    loading,
    error,
    refresh: () => executeFetch(true),
    // Invalidates all variants of this baseKey (e.g. invalidating 'users' clears 'users-[1,{"status":"all"}]')
    invalidate: () => invalidateByPrefix(baseKey)
  };
};
