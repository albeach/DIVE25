import { useQuery } from '@tanstack/react-query';
import { partnerApi } from '@services/api';
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  XCircleIcon 
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { Spinner } from '@components/common/Spinner';

interface PartnerHealth {
  partnerId: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  lastChecked: Date;
  error?: string;
}

export function PartnerStatus() {
  const { data: partners, isLoading } = useQuery({
    queryKey: ['partner-health'],
    queryFn: () => partnerApi.getPartnerHealth(),
    refetchInterval: 60000 // Refresh every minute
  });

  if (isLoading) return <Spinner />;

  const statusIcons = {
    healthy: <CheckCircleIcon className="h-5 w-5 text-green-500" />,
    degraded: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />,
    down: <XCircleIcon className="h-5 w-5 text-red-500" />
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h2 className="text-lg font-medium text-gray-900">Partner Status</h2>
        <div className="mt-6 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Partner
                    </th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Response Time
                    </th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Last Checked
                    </th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {partners?.map((partner) => (
                    <tr key={partner.id}>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                        {partner.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <div className="flex items-center">
                          {statusIcons[partner.health.status]}
                          <span className="ml-1.5">
                            {partner.health.status.charAt(0).toUpperCase() + 
                             partner.health.status.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {partner.health.responseTime}ms
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {format(new Date(partner.health.lastChecked), 'PPp')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {partner.health.error || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 