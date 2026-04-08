import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { PageSkeleton } from './PageSkeleton';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageSkeleton />;
  if (isError || !user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
