import { BrowserRouter, Routes, Route } from 'react-router';
import { SetupGuard } from './components/SetupGuard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageSkeleton } from './components/PageSkeleton';
import { lazy, Suspense } from 'react';

const LoginPage = lazy(() => import('./pages/login/LoginPage'));
const SetupPage = lazy(() => import('./pages/setup/SetupPage'));
const RecoverPage = lazy(() => import('./pages/recover/RecoverPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

function DashboardPlaceholder() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <h1 className="text-2xl font-semibold">Social Media Scheduler</h1>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SetupGuard>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/recover" element={<RecoverPage />} />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPlaceholder />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </SetupGuard>
    </BrowserRouter>
  );
}
