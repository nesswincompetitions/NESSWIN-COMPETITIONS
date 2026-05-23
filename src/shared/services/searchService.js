/**
 * Search Service - Production-level search utilities
 * Provides debouncing, filtering, and search helpers
 */

/**
 * Debounce function for search performance
 * Prevents excessive re-renders while user types
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds (default: 300ms)
 * @returns {Function} Debounced function
 */
export const debounce = (func, delay = 300) => {
  let timeoutId;

  const debounced = (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };

  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
};

/**
 * Case-insensitive string search
 * @param {string} text - Text to search in
 * @param {string} term - Search term
 * @returns {boolean} Whether text contains the search term
 */
export const searchMatch = (text, term) => {
  if (!term) return true;
  if (!text) return false;
  return String(text).toLowerCase().includes(String(term).toLowerCase());
};

/**
 * Multi-field search - search across multiple fields
 * @param {Object} item - Object to search in
 * @param {string} searchTerm - Search term
 * @param {string[]} fields - Array of field names to search
 * @returns {boolean} Whether item matches search term in any field
 */
export const multiFieldSearch = (item, searchTerm, fields = []) => {
  if (!searchTerm || !item || fields.length === 0) return true;

  return fields.some(field => {
    const value = item[field];
    return searchMatch(value, searchTerm);
  });
};

/**
 * Filter array of items by search term
 * @param {Array} items - Items to filter
 * @param {string} searchTerm - Search term
 * @param {string[]} searchFields - Fields to search in
 * @returns {Array} Filtered items
 */
export const filterBySearch = (items, searchTerm, searchFields = []) => {
  if (!searchTerm || !items || !Array.isArray(items)) return items;

  return items.filter(item => multiFieldSearch(item, searchTerm, searchFields));
};

/**
 * Sort search results by relevance (match position and field priority)
 * @param {Array} items - Items to sort
 * @param {string} searchTerm - Search term
 * @param {Array} priorityFields - Fields with priority (earlier = higher priority)
 * @returns {Array} Sorted items
 */
export const sortByRelevance = (items, searchTerm, priorityFields = []) => {
  if (!searchTerm || !items) return items;

  return [...items].sort((a, b) => {
    let aScore = 999;
    let bScore = 999;

    // Check priority fields first
    priorityFields.forEach((field, priority) => {
      const aVal = String(a[field] || '').toLowerCase();
      const bVal = String(b[field] || '').toLowerCase();
      const term = searchTerm.toLowerCase();

      if (aVal.includes(term)) {
        aScore = Math.min(aScore, priority * 100 + aVal.indexOf(term));
      }
      if (bVal.includes(term)) {
        bScore = Math.min(bScore, priority * 100 + bVal.indexOf(term));
      }
    });

    return aScore - bScore;
  });
};

/**
 * Highlight search term in text
 * @param {string} text - Text to highlight
 * @param {string} term - Term to highlight
 * @returns {string} HTML string with <mark> tags
 */
export const highlightMatch = (text, term) => {
  if (!text || !term) return text;

  const regex = new RegExp(`(${term})`, 'gi');
  return String(text).replace(regex, '<mark>$1</mark>');
};

/**
 * Get search suggestion based on common patterns
 * @param {string} term - Search term
 * @returns {string} Suggestion or empty string
 */
export const getSearchSuggestion = (term) => {
  if (!term) return '';

  const suggestions = {
    'iphone': 'Did you mean "iPhone"?',
    'ipad': 'Did you mean "iPad"?',
    'mac': 'Did you mean "Mac"?',
  };

  const lower = term.toLowerCase();
  return suggestions[lower] || '';
};

/**
 * Trim and normalize search term
 * @param {string} term - Search term
 * @returns {string} Normalized term
 */
export const normalizeTerm = (term) => {
  return String(term || '').trim();
};
