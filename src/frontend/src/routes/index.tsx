import { createRouter, RouterProvider } from '@tanstack/react-router';
import { DocumentList } from '@components/documents/DocumentList';
import { Dashboard } from '@components/dashboard/Dashboard';
import { PartnerList } from '@components/partners/PartnerList';
import { ErrorBoundary } from '@components/common/ErrorBoundary';
import { useAuth } from '@hooks/useAuth';

const routeConfig = [
  {
    path: '/',
    element: () => <Dashboard />,
  },
  {
    path: '/documents',
    element: () => <DocumentList />,
  },
  {
    path: '/partners',
    element: () => <PartnerList />,
  },
];

const router = createRouter({
  routeConfig,
  defaultPreload: 'intent',
  defaultErrorComponent: ({ error }) => (
    <ErrorBoundary error={error as Error} />
  ),
});

export function AppRouter() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Please log in</div>;
  }

  return <RouterProvider router={router} />;
} 