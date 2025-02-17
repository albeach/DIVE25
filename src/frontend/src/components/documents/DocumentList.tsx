import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { documentApi } from '@services/api';
import { DocumentCard } from './DocumentCard';
import { DocumentSearch } from './DocumentSearch';
import { DocumentFilters } from './DocumentFilters';
import { DocumentUploadModal } from './DocumentUploadModal';
import { Spinner } from '@components/common/Spinner';
import { 
  PlusIcon,
  ArrowsUpDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { classNames } from '@utils/styles';

type SortOption = {
  label: string;
  value: string;
  direction: 'asc' | 'desc';
};

const sortOptions: SortOption[] = [
  { label: 'Date: Newest', value: 'date', direction: 'desc' },
  { label: 'Date: Oldest', value: 'date', direction: 'asc' },
  { label: 'Title: A-Z', value: 'title', direction: 'asc' },
  { label: 'Title: Z-A', value: 'title', direction: 'desc' },
  { label: 'Classification: High-Low', value: 'classification', direction: 'desc' },
  { label: 'Classification: Low-High', value: 'classification', direction: 'asc' },
];

export function DocumentList() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSort, setSelectedSort] = useState<SortOption>(sortOptions[0]);
  const [filters, setFilters] = useState({
    classification: [] as string[],
    coiTags: [] as string[],
    dateRange: 'all',
    fileTypes: [] as string[]
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', searchQuery, filters, selectedSort],
    queryFn: () => documentApi.getDocuments({
      search: searchQuery,
      ...filters,
      sortBy: selectedSort.value,
      sortDirection: selectedSort.direction
    })
  });

  const activeFiltersCount = Object.values(filters).flat().length;

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and access your organization's documents
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-nato-blue hover:bg-nato-blue/90"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Upload Document
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <DocumentSearch onSearch={setSearchQuery} />
        
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={classNames(
              'inline-flex items-center px-3 py-1.5 border rounded-md text-sm font-medium',
              showFilters || activeFiltersCount > 0
                ? 'border-nato-blue text-nato-blue bg-nato-blue/5'
                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
            )}
          >
            <FunnelIcon className="-ml-1 mr-1 h-5 w-5" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-1 text-xs bg-nato-blue text-white px-1.5 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <Menu as="div" className="relative inline-block text-left">
            <Menu.Button className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              <ArrowsUpDownIcon className="-ml-1 mr-1 h-5 w-5" />
              Sort
              <span className="hidden sm:inline ml-1">
                : {selectedSort.label}
              </span>
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div className="py-1">
                  {sortOptions.map((option) => (
                    <Menu.Item key={`${option.value}-${option.direction}`}>
                      {({ active }) => (
                        <button
                          onClick={() => setSelectedSort(option)}
                          className={classNames(
                            active ? 'bg-gray-100' : '',
                            'block px-4 py-2 text-sm w-full text-left',
                            selectedSort === option ? 'text-nato-blue font-medium' : 'text-gray-700'
                          )}
                        >
                          {option.label}
                        </button>
                      )}
                    </Menu.Item>
                  ))}
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>

      {showFilters && (
        <DocumentFilters onFilterChange={setFilters} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">
            Error loading documents. Please try again.
          </p>
        </div>
      ) : data?.documents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">
            No documents found. Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data?.documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
            />
          ))}
        </div>
      )}

      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </div>
  );
} 