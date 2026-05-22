import { Navigate, useLocation } from "react-router";
import { useAuth, useSetupStatus } from "../hooks/use-auth";
import { PageSkeleton } from "./PageSkeleton";

export function SetupGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSetupStatus();
  const auth = useAuth();
  const location = useLocation();

  if (isLoading) return <PageSkeleton />;
  if (data?.needsSetup && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  if (data && !data.needsSetup && location.pathname === "/setup") {
    if (auth.isLoading) return <PageSkeleton />;
    if (auth.data) return <Navigate to={auth.data.defaultLandingPage || "/dashboard"} replace />;
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
