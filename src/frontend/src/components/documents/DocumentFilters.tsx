import { Fragment, useState } from 'react';
import { Dialog, Disclosure, Transition } from '@headlessui/react';
import { 
  FunnelIcon, 
  XMarkIcon,
  ChevronDownIcon 
} from '@heroicons/react/24/outline';
import { classNames } from '@utils/styles';

interface FilterState {
  classification: string[];
  coiTags: string[];
  dateRange: string;
  fileTypes: string[];
}

interface DocumentFiltersProps {
  onFilterChange: (filters: FilterState) => void;
}

const classifications = [
  'UNCLASSIFIED',
  'RESTRICTED',
  'CONFIDENTIAL',
  'SECRET',
  'TOP SECRET'
];

const coiTags = [
  'OpAlpha',
  'OpBravo',
  'OpCharlie',
  'MissionX',
  'MissionY'
];

const fileTypes = [
  'PDF',
  'DOCX',
  'XLSX',
  'PPT',
  'TXT'
];

export function DocumentFilters({ onFilterChange }: DocumentFiltersProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    classification: [],
    coiTags: [],
    dateRange: 'all',
    fileTypes: []
  });

  const handleFilterChange = (
    category: keyof FilterState,
    value: string
  ) => {
    const newFilters = { ...filters };
    
    if (category === 'dateRange') {
      newFilters.dateRange = value;
    } else {
      const array = newFilters[category] as string[];
      const index = array.indexOf(value);
      
      if (index === -1) {
        array.push(value);
      } else {
        array.splice(index, 1);
      }
    }
    
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const FilterSection = ({ 
    title, 
    options, 
    category 
  }: { 
    title: string;
    options: string[];
    category: keyof FilterState;
  }) => (
    <Disclosure as="div" className="border-t border-gray-200 px-4 py-6">
      {({ open }) => (
        <>
          <h3 className="-mx-2 -my-3 flow-root">
            <Disclosure.Button className="flex w-full items-center justify-between bg-white px-2 py-3 text-gray-400 hover:text-gray-500">
              <span className="font-medium text-gray-900">{title}</span>
              <span className="ml-6 flex items-center">
                <ChevronDownIcon
                  className={classNames(
                    open ? '-rotate-180' : 'rotate-0',
                    'h-5 w-5 transform'
                  )}
                  aria-hidden="true"
                />
              </span>
            </Disclosure.Button>
          </h3>
          <Disclosure.Panel className="pt-6">
            <div className="space-y-4">
              {options.map((option) => (
                <div key={option} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters[category].includes(option)}
                    onChange={() => handleFilterChange(category, option)}
                    className="h-4 w-4 rounded border-gray-300 text-nato-blue focus:ring-nato-blue"
                  />
                  <label className="ml-3 text-sm text-gray-600">
                    {option}
                  </label>
                </div>
              ))}
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );

  return (
    <div className="bg-white">
      {/* Mobile filter dialog */}
      <Transition.Root show={mobileFiltersOpen} as={Fragment}>
        <Dialog 
          as="div" 
          className="relative z-40 lg:hidden" 
          onClose={setMobileFiltersOpen}
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />

          <div className="fixed inset-0 z-40 flex">
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Dialog.Panel className="relative ml-auto flex h-full w-full max-w-xs flex-col overflow-y-auto bg-white py-4 pb-12 shadow-xl">
                <div className="flex items-center justify-between px-4">
                  <h2 className="text-lg font-medium text-gray-900">Filters</h2>
                  <button
                    type="button"
                    className="-mr-2 flex h-10 w-10 items-center justify-center rounded-md bg-white p-2 text-gray-400"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                {/* Mobile Filters */}
                <FilterSection 
                  title="Classification" 
                  options={classifications} 
                  category="classification" 
                />
                <FilterSection 
                  title="COI Tags" 
                  options={coiTags} 
                  category="coiTags" 
                />
                <FilterSection 
                  title="File Types" 
                  options={fileTypes} 
                  category="fileTypes" 
                />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Desktop Filters */}
      <section aria-labelledby="filter-heading">
        <div className="border-b border-gray-200 bg-white pb-4">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="inline-flex items-center lg:hidden"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <FunnelIcon className="h-5 w-5" aria-hidden="true" />
              <span className="ml-2 text-sm font-medium text-gray-700">
                Filters
              </span>
            </button>

            <div className="hidden lg:flex lg:items-center">
              <div className="flow-root">
                <div className="-mx-4 flex items-center divide-x divide-gray-200">
                  <FilterSection 
                    title="Classification" 
                    options={classifications} 
                    category="classification" 
                  />
                  <FilterSection 
                    title="COI Tags" 
                    options={coiTags} 
                    category="coiTags" 
                  />
                  <FilterSection 
                    title="File Types" 
                    options={fileTypes} 
                    category="fileTypes" 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
} 