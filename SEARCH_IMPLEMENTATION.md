# Production-Level Search Implementation

## Overview
A complete, production-ready search system for the website featuring:
- **Centralized search utilities** with debouncing and multi-field search
- **Custom React hook** (`useSearch`) for easy integration
- **Reusable search component** for consistent UI across pages
- **Performance optimized** with debouncing (300ms default) and memoization
- **Clean architecture** separating logic from components

---

## Architecture

### 1. **Search Service** (`src/shared/services/searchService.js`)
Core utilities for search operations:

| Function | Purpose |
|----------|---------|
| `debounce(func, delay)` | Prevents excessive re-renders while typing |
| `searchMatch(text, term)` | Case-insensitive string matching |
| `multiFieldSearch(item, searchTerm, fields)` | Search across multiple object fields |
| `filterBySearch(items, searchTerm, searchFields)` | Filter array by search term |
| `sortByRelevance(items, searchTerm, priorityFields)` | Sort results by match position and field priority |
| `highlightMatch(text, term)` | Returns HTML with highlighted matches |
| `normalizeTerm(term)` | Trim and normalize search input |

**Example:**
```javascript
import { filterBySearch } from '@/shared/services/searchService';

const results = filterBySearch(
  winners,
  'john',
  ['name', 'email', 'competition']
);
```

### 2. **useSearch Hook** (`src/shared/hooks/useSearch.js`)
Custom React hook for search state management:

```javascript
const {
  searchTerm,        // Current search input
  setSearchTerm,     // Update search (with debouncing)
  filteredItems,     // Results after filtering
  isSearching,       // Loading state
  clearSearch,       // Reset search
  itemCount          // Number of filtered items
} = useSearch(
  items,
  ['name', 'email'],
  { debounceDelay: 300 }
);
```

**Features:**
- Automatic debouncing (configurable)
- Memoized filtered results
- Clear callback support
- Item count tracking

**Example:**
```javascript
const { searchTerm, setSearchTerm, filteredItems } = useSearch(
  winners,
  ['name', 'email', 'competition', 'ticket'],
  { debounceDelay: 300 }
);
```

### 3. **SearchInput Component** (`src/shared/components/ui/SearchInput.jsx`)
Reusable, styled search input with clear button:

```javascript
<SearchInput
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  onClear={clearSearch}
  placeholder="Search winners..."
/>
```

**Props:**
- `value` - Current search term
- `onChange` - Input change handler
- `placeholder` - Input placeholder text
- `onClear` - Clear button callback
- `showClear` - Show clear button (default: true)
- `className` - Additional CSS classes
- `disabled` - Disable input

---

## Integration Examples

### Basic Search (WinnersList)
```javascript
import { useSearch } from '@/shared/hooks/useSearch';
import SearchInput from '@/shared/components/ui/SearchInput';

const WinnersList = () => {
  const { searchTerm, setSearchTerm, filteredItems, clearSearch } = useSearch(
    winners,
    ['name', 'email', 'competition', 'ticket'],
    { debounceDelay: 300 }
  );

  return (
    <SearchInput
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      onClear={clearSearch}
      placeholder="Search winners..."
    />
  );
};
```

### Search with Status Filter (WinnersList)
```javascript
const { searchTerm, setSearchTerm, filteredItems: searchedWinners } = useSearch(
  winners,
  ['name', 'email', 'competition', 'ticket']
);

// Combine search and status filtering
const filteredWinners = useMemo(() => {
  return searchedWinners.filter(w => {
    if (activeStatus === 'all') return true;
    return w.status.toLowerCase() === activeStatus;
  });
}, [searchedWinners, activeStatus]);
```

### Advanced Search Hook (useAdvancedSearch)
```javascript
import { useAdvancedSearch } from '@/shared/hooks/useSearch';

const { searchTerm, setSearchTerm, filteredItems } = useAdvancedSearch(
  items,
  ['name', 'email'],
  {
    debounceDelay: 300,
    priorityFields: ['name', 'email'],  // Search priority order
    additionalFilter: (item) => item.status === 'active'  // Extra filtering
  }
);
```

---

## Pages Integrated

### Admin Panel
1. **Competitions List** - Search by name, tag, subtitle
2. **Users List** - Search by name, email, phone
3. **Orders List** - Search by order ID, user email
4. **Referrals List** - Search by referrer name, email
5. **Winners List** - Search by winner name, email, competition, ticket

### User Panel
- Extensible for user-side competition search

---

## Performance Considerations

### Debouncing
- **Default delay:** 300ms (configurable)
- **Benefit:** Reduces re-renders while user types
- **Customization:**
  ```javascript
  useSearch(items, fields, { debounceDelay: 500 })  // 500ms delay
  ```

### Memoization
- `filteredItems` uses `useMemo` to prevent unnecessary recalculations
- Only recalculates when `items` or `searchTerm` changes

### Multi-field Optimization
- Early returns if search term is empty
- Short-circuit evaluation in `multiFieldSearch`

---

## Future Enhancements

### Planned Features
1. **Search Suggestions** - Auto-complete based on common searches
2. **Search History** - Store recent searches in localStorage
3. **Advanced Filters** - Date ranges, status, categories combined with search
4. **Search Analytics** - Track popular searches for UX improvement
5. **Fuzzy Search** - Handle typos and partial matches
6. **Search Results Highlighting** - Highlight matched terms in results

### Implementation Ready
- `highlightMatch()` utility already available in searchService
- `getSearchSuggestion()` utility for suggestion support
- Hook structure supports additional filters easily

---

## Testing Checklist

- [x] Search debounces correctly (300ms delay)
- [x] Clear button clears search term
- [x] Multi-field search works across all pages
- [x] Case-insensitive matching works
- [x] Empty search shows all items
- [x] Combined with status/other filters works
- [x] Performance optimized (no unnecessary re-renders)
- [x] Mobile responsive search input
- [x] Accessible (keyboard navigation, labels)

---

## File Structure
```
src/
├── shared/
│   ├── services/
│   │   └── searchService.js          # Search utilities
│   ├── hooks/
│   │   └── useSearch.js              # useSearch & useAdvancedSearch hooks
│   └── components/ui/
│       └── SearchInput.jsx           # Reusable search input
└── modules/
    └── admin/
        ├── competitions/pages/
        │   └── CompetitionsList.jsx  # Integrated
        ├── users/pages/
        │   └── UsersList.jsx         # Integrated
        ├── orders/pages/
        │   └── OrdersList.jsx        # Integrated
        ├── referrals/pages/
        │   └── ReferralsList.jsx     # Integrated
        └── winners/pages/
            └── WinnersList.jsx       # Integrated
```

---

## API Reference

### searchService.js

#### `debounce(func, delay = 300)`
Debounces function execution
```javascript
const debouncedSearch = debounce((term) => {
  console.log('Searching for:', term);
}, 500);

debouncedSearch('query');  // Executes after 500ms
```

#### `multiFieldSearch(item, searchTerm, fields)`
Searches object across multiple fields
```javascript
const match = multiFieldSearch(
  { name: 'John', email: 'john@example.com' },
  'john',
  ['name', 'email']
);  // Returns: true
```

#### `filterBySearch(items, searchTerm, searchFields)`
Filters array by search term
```javascript
const results = filterBySearch(
  [{ name: 'John' }, { name: 'Jane' }],
  'john',
  ['name']
);  // Returns: [{ name: 'John' }]
```

---

## Notes

- Search logic is intentionally kept out of `modules implementation.md` as per requirements
- All utilities are framework-agnostic and can be used in Vue, Svelte, etc.
- Hook uses React best practices (memoization, debouncing, cleanup)
- Component styling matches existing design system (Tailwind + custom tokens)
