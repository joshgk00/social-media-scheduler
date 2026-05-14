import { Navigate, useLocation } from 'react-router';
import { useSetupStatus } from '../hooks/use-auth';
import { PageSkeleton } from './PageSkeleton';

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSetupStatus();
  const location = useLocation();

  if (isLoading) return <PageSkeleton />;
  if (data?.needsSetup && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }
  if (data && !data.needsSetup && location.pathname === '/setup') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
