import { useQuery } from '@tanstack/react-query';
import { partnerApi } from '@services/api';
import { PartnerCard } from './PartnerCard';
import { Spinner } from '@components/common/Spinner';
import { MapIcon } from '@heroicons/react/24/outline';

export function PartnerList() {
  const { data: partners, isLoading } = useQuery({
    queryKey: ['partners'],
    queryFn: () => partnerApi.getPartners()
  });

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">NATO Partners</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connected organizations and their access levels
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-nato-blue hover:bg-nato-blue/90"
          >
            <MapIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            View Federation Map
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {partners?.map((partner) => (
            <PartnerCard key={partner.id} partner={partner} />
          ))}
        </div>
      )}
    </div>
  );
} 