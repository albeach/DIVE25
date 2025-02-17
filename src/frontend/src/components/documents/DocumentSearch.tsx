import { useState, useCallback } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useDebounce } from '@hooks/useDebounce';

interface DocumentSearchProps {
  onSearch: (query: string) => void;
}

export function DocumentSearch({ onSearch }: DocumentSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const debouncedSearch = useDebounce((query: string) => {
    onSearch(query);
  }, 300);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  return (
    <div className="flex-1 max-w-lg">
      <label htmlFor="search" className="sr-only">
        Search documents
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon
            className="h-5 w-5 text-gray-400"
            aria-hidden="true"
          />
        </div>
        <input
          type="search"
          name="search"
          id="search"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="block w-full rounded-md border-0 py-1.5 pl-10 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-nato-blue sm:text-sm sm:leading-6"
          placeholder="Search documents..."
        />
      </div>
    </div>
  );
} 