import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { debounce, filterBySearch, normalizeTerm } from '@/shared/services/searchService';

/**
 * useSearch Hook - Production-level search state management
 * Handles search term state with debouncing and filtered results
 * 
 * @param {Array} items - Array of items to search through
 * @param {Array} searchFields - Fields to search in (e.g., ['name', 'email'])
 * @param {Object} options - Configuration options
 * @param {number} options.debounceDelay - Delay for debouncing (default: 300ms)
 * @param {boolean} options.trimTerm - Auto-trim search term (default: true)
 * @param {Function} options.onSearch - Callback when search completes
 * 
 * @returns {Object} {
 *   searchTerm: string - Current search term
 *   setSearchTerm: Function - Update search term
 *   filteredItems: Array - Filtered items based on search
 *   isSearching: boolean - Whether search is in progress
 *   clearSearch: Function - Clear search term
 * }
 */
export const useSearch = (
  items = [],
  searchFields = [],
  options = {}
) => {
  const {
    debounceDelay = 300,
    trimTerm = true,
    onSearch = null,
  } = options;

  const [searchTerm, setSearchTermState] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Keep track of the latest onSearch callback to avoid breaking the debouncer
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Debounced search handler
  const performSearch = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      debounce((term) => {
        setIsSearching(false);
        if (onSearchRef.current) onSearchRef.current(term);
      }, debounceDelay),
    [debounceDelay]
  );

  // Cancel any pending debounced calls when the hook unmounts or delay changes
  useEffect(() => {
    return () => {
      performSearch.cancel?.();
    };
  }, [performSearch]);

  // Handle search term change
  const setSearchTerm = useCallback((term) => {
    const normalized = trimTerm ? normalizeTerm(term) : term;
    setSearchTermState(normalized);
    setIsSearching(true);
    performSearch(normalized);
  }, [performSearch, trimTerm]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchTermState('');
    setIsSearching(false);
    performSearch.cancel?.();
  }, [performSearch]);

  // Compute filtered items using useMemo to prevent unnecessary re-renders
  const filteredItems = useMemo(() => {
    return filterBySearch(items, searchTerm, searchFields);
  }, [items, searchTerm, searchFields]);

  return {
    searchTerm,
    setSearchTerm,
    filteredItems,
    isSearching,
    clearSearch,
    itemCount: filteredItems.length,
  };
};

/**
 * useAdvancedSearch Hook - Extended search with sorting and filtering
 * Builds on useSearch with additional capabilities
 * 
 * @param {Array} items - Array of items to search through
 * @param {Array} searchFields - Fields to search in
 * @param {Object} options - Configuration options (extends useSearch options)
 * @param {string[]} options.priorityFields - Fields sorted by priority
 * @param {Function} options.additionalFilter - Extra filter function
 * 
 * @returns {Object} Extended useSearch return with sorting
 */
export const useAdvancedSearch = (
  items = [],
  searchFields = [],
  options = {}
) => {
  const {
    priorityFields: _priorityFields = [],
    additionalFilter = null,
    ...searchOptions
  } = options;

  const search = useSearch(items, searchFields, searchOptions);

  // Apply additional filtering if provided
  const filteredItems = useMemo(() => {
    let results = search.filteredItems;
    
    if (additionalFilter && typeof additionalFilter === 'function') {
      results = results.filter(additionalFilter);
    }

    return results;
  }, [search.filteredItems, additionalFilter]);

  return {
    ...search,
    filteredItems,
  };
};
