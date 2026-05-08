import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * SearchInput - Reusable search input component
 * Provides consistent search UI across the application
 * 
 * @param {Object} props
 * @param {string} props.value - Search term value
 * @param {Function} props.onChange - Callback when search term changes
 * @param {string} props.placeholder - Input placeholder text
 * @param {Function} props.onClear - Callback when clear button is clicked
 * @param {boolean} props.showClear - Show clear button when search term exists
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Disable the input
 */
const SearchInput = ({
  value = '',
  onChange = () => {},
  placeholder = 'Search...',
  onClear = () => {},
  showClear = true,
  className = '',
  disabled = false,
}) => {
  const handleClear = () => {
    onChange({ target: { value: '' } });
    onClear?.();
  };

  return (
    <div className={`relative flex-1 ${className}`}>
      {/* Search Icon */}
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />

      {/* Input Field */}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          w-full
          bg-white/5
          border border-white/10
          rounded-lg
          pl-9
          pr-${showClear && value ? '9' : '4'}
          py-2
          text-sm
          text-white
          placeholder:text-gray-500
          focus:outline-none
          focus:border-primary/50
          focus:bg-white/7
          transition-all
          duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
          h-10
        `}
      />

      {/* Clear Button */}
      {showClear && value && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          title="Clear search"
          type="button"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

export default SearchInput;
