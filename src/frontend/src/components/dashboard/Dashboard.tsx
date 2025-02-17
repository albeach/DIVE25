import { useQuery } from '@tanstack/react-query';
import { documentApi } from '@services/api';
import { useAuth } from '@hooks/useAuth';
import { 
  DocumentIcon, 
  UserGroupIcon, 
  ShieldCheckIcon,
  ClockIcon 
} from '@heroicons/react/24/outline';
import { DashboardMetric } from './DashboardMetric';
import { RecentActivity } from './RecentActivity';
import { DocumentsByClassification } from './DocumentsByClassification';

export function Dashboard() {
  const { user } = useAuth();

  const { data: metrics } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: () => documentApi.getDashboardMetrics()
  });

  const { data: recentDocuments } = useQuery({
    queryKey: ['recent-documents'],
    queryFn: () => documentApi.getDocuments({ limit: 5, sort: 'recent' })
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome back, {user?.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's what's happening in your workspace
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardMetric
          title="Total Documents"
          value={metrics?.totalDocuments || 0}
          icon={DocumentIcon}
          trend={metrics?.documentTrend}
        />
        <DashboardMetric
          title="Active Partners"
          value={metrics?.activePartners || 0}
          icon={UserGroupIcon}
        />
        <DashboardMetric
          title="Security Clearance"
          value={user?.clearanceLevel || 'N/A'}
          icon={ShieldCheckIcon}
        />
        <DashboardMetric
          title="Recent Updates"
          value={metrics?.recentUpdates || 0}
          icon={ClockIcon}
          trend={metrics?.updateTrend}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900">
              Documents by Classification
            </h2>
            <div className="mt-4">
              <DocumentsByClassification data={metrics?.classificationBreakdown} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900">
              Recent Activity
            </h2>
            <div className="mt-4">
              <RecentActivity documents={recentDocuments?.documents || []} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 