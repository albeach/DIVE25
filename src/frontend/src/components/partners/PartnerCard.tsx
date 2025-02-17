import { Partner } from '@/types';
import { ShieldCheckIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { classNames } from '@utils/styles';

interface PartnerCardProps {
  partner: Partner;
}

const statusColors = {
  'ACTIVE': 'bg-green-100 text-green-800',
  'PENDING': 'bg-yellow-100 text-yellow-800',
  'INACTIVE': 'bg-red-100 text-red-800'
};

export function PartnerCard({ partner }: PartnerCardProps) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200">
      <div className="px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {partner.logo ? (
              <img
                className="h-12 w-12 rounded-full"
                src={partner.logo}
                alt={partner.name}
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-nato-blue/10 flex items-center justify-center">
                <GlobeAltIcon className="h-6 w-6 text-nato-blue" />
              </div>
            )}
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">
                {partner.name}
              </h3>
              <p className="text-sm text-gray-500">
                {partner.country}
              </p>
            </div>
          </div>
          <span className={classNames(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            statusColors[partner.status]
          )}>
            {partner.status}
          </span>
        </div>
      </div>
      
      <div className="px-4 py-5 sm:p-6">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500">
              Clearance Level
            </dt>
            <dd className="mt-1 flex items-center text-sm text-gray-900">
              <ShieldCheckIcon className="h-5 w-5 text-nato-blue mr-1.5" />
              {partner.clearanceLevel}
            </dd>
          </div>
          
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500">
              Connected Since
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(partner.connectedSince).toLocaleDateString()}
            </dd>
          </div>
          
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">
              Authorized COIs
            </dt>
            <dd className="mt-1">
              <div className="flex flex-wrap gap-2">
                {partner.authorizedCOIs.map((coi) => (
                  <span
                    key={coi}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                  >
                    {coi}
                  </span>
                ))}
              </div>
            </dd>
          </div>
        </dl>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            View Details
          </button>
          <button
            type="button"
            className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-nato-blue hover:bg-nato-blue/90"
          >
            Manage Access
          </button>
        </div>
      </div>
    </div>
  );
} 