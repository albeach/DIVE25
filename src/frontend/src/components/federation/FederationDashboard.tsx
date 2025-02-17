import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  BarChart,
  PieChart,
  AreaChart
} from '@components/charts';
import { federationApi } from '@services/api';
import { Spinner } from '@components/common/Spinner';

export function FederationDashboard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['federation-metrics'],
    queryFn: () => federationApi.getMetrics(),
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Authentication Stats */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium mb-4">Authentication Statistics</h3>
        <AreaChart
          data={metrics.authStats}
          xAxis="timestamp"
          series={['success', 'failure']}
          colors={['emerald', 'red']}
        />
      </div>

      {/* Response Time */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium mb-4">Response Time</h3>
        <LineChart
          data={metrics.responseTimes}
          xAxis="timestamp"
          series={['avg', 'p95', 'p99']}
          colors={['blue', 'amber', 'orange']}
        />
      </div>

      {/* Active Users */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium mb-4">Active Users</h3>
        <BarChart
          data={metrics.activeUsers}
          xAxis="partner"
          series={['count']}
          colors={['violet']}
        />
      </div>

      {/* Error Distribution */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium mb-4">Error Distribution</h3>
        <PieChart
          data={metrics.errorDistribution}
          series="count"
          labels="type"
          colors={['red', 'orange', 'amber', 'yellow']}
        />
      </div>
    </div>
  );
} 