import React, { useState } from 'react';
import { DocumentSearchQuery, SearchResult } from '../types';
import { DocumentService } from '../services/DocumentService';

interface SearchInterfaceProps {
  onSearchResults: (results: SearchResult) => void;
}

const SearchInterface: React.FC<SearchInterfaceProps> = ({ onSearchResults }) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Partial<DocumentSearchQuery>>({
    classification: [],
    coiTags: [],
    dateRange: null
  });
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const results = await DocumentService.searchDocuments({
        query,
        ...filters
      });
      onSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents..."
          className="flex-1 rounded-md border-gray-300 shadow-sm"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="flex gap-4">
        <select
          multiple
          value={filters.classification}
          onChange={(e) => setFilters({
            ...filters,
            classification: Array.from(e.target.selectedOptions, option => option.value)
          })}
          className="rounded-md border-gray-300 shadow-sm"
        >
          <option value="NATO RESTRICTED">NATO RESTRICTED</option>
          <option value="NATO CONFIDENTIAL">NATO CONFIDENTIAL</option>
          <option value="NATO SECRET">NATO SECRET</option>
          <option value="COSMIC TOP SECRET">COSMIC TOP SECRET</option>
        </select>

        <select
          multiple
          value={filters.coiTags}
          onChange={(e) => setFilters({
            ...filters,
            coiTags: Array.from(e.target.selectedOptions, option => option.value)
          })}
          className="rounded-md border-gray-300 shadow-sm"
        >
          <option value="CYBER">CYBER</option>
          <option value="INTEL">INTEL</option>
          <option value="OPERATIONS">OPERATIONS</option>
        </select>
      </div>
    </div>
  );
};

export default SearchInterface; 