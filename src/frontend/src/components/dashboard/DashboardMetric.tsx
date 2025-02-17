import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid';
import { classNames } from '@utils/styles';

interface DashboardMetricProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
}

export function DashboardMetric({ 
  title, 
  value, 
  icon: Icon,
  trend 
}: DashboardMetricProps) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Icon className="h-6 w-6 text-gray-400" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {title}
              </dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900">
                  {value}
                </div>
                {trend && (
                  <div className={classNames(
                    'ml-2 flex items-baseline text-sm font-semibold',
                    trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
                  )}>
                    {trend.direction === 'up' ? (
                      <ArrowUpIcon className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <ArrowDownIcon className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span className="sr-only">
                      {trend.direction === 'up' ? 'Increased' : 'Decreased'} by
                    </span>
                    {trend.value}%
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
} 