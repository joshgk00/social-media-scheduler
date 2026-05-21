import { BrowserRouter, Navigate, Routes, Route } from "react-router";
import { SetupGuard } from "./components/SetupGuard";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SidebarLayout } from "./components/layout/SidebarLayout";
import { PageSkeleton } from "./components/PageSkeleton";
import { lazy, Suspense } from "react";
import { RedesignPlaceholderPage } from "./pages/redesign/RedesignPlaceholderPage";

const LoginPage = lazy(() => import("./pages/login/LoginPage"));
const SetupPage = lazy(() => import("./pages/setup/SetupPage"));
const RecoverPage = lazy(() => import("./pages/recover/RecoverPage"));

export function App() {
  return (
    <BrowserRouter>
      <SetupGuard>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            {/* Public routes -- no sidebar */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/recover" element={<RecoverPage />} />

            {/* Protected routes -- with sidebar layout */}
            <Route
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <SidebarLayout />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={<RedesignPlaceholderPage title="Dashboard" />}
              />
              <Route
                path="/posts"
                element={<RedesignPlaceholderPage title="Posts" />}
              />
              <Route
                path="/posts/new"
                element={<RedesignPlaceholderPage title="New post" />}
              />
              <Route
                path="/posts/import"
                element={<RedesignPlaceholderPage title="Import CSV" />}
              />
              <Route
                path="/posts/:id/edit"
                element={<RedesignPlaceholderPage title="Edit post" />}
              />
              <Route
                path="/queues"
                element={<RedesignPlaceholderPage title="Queues" />}
              />
              <Route
                path="/queues/new"
                element={<RedesignPlaceholderPage title="Create queue" />}
              />
              <Route
                path="/queues/:id"
                element={<RedesignPlaceholderPage title="Queue detail" />}
              />
              <Route
                path="/queues/:id/edit"
                element={<RedesignPlaceholderPage title="Edit queue" />}
              />
              <Route
                path="/queues/:id/posts"
                element={<RedesignPlaceholderPage title="Queue posts" />}
              />
              <Route
                path="/calendar"
                element={<RedesignPlaceholderPage title="Calendar" />}
              />
              <Route
                path="/profiles"
                element={<RedesignPlaceholderPage title="Profiles" />}
              />
              <Route
                path="/notifications"
                element={<RedesignPlaceholderPage title="Notifications" />}
              />
              <Route
                path="/settings/advanced/bull-board"
                element={
                  <RedesignPlaceholderPage title="Worker queue inspector" />
                }
              />
              <Route
                path="/settings"
                element={<Navigate to="/settings/profile" replace />}
              />
              <Route
                path="/settings/:tab"
                element={<RedesignPlaceholderPage title="Settings" />}
              />
            </Route>
          </Routes>
        </Suspense>
      </SetupGuard>
    </BrowserRouter>
  );
}
