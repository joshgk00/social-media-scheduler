import { BrowserRouter, Navigate, Routes, Route } from "react-router";
import { SetupGuard } from "./components/SetupGuard";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SidebarLayout } from "./components/layout/SidebarLayout";
import { PageSkeleton } from "./components/PageSkeleton";
import { lazy, Suspense } from "react";
import { ComponentLibraryPage } from "./pages/redesign/ComponentLibraryPage";
import { RedesignPlaceholderPage } from "./pages/redesign/RedesignPlaceholderPage";

const LoginPage = lazy(() => import("./pages/login/LoginPage"));
const SetupPage = lazy(() => import("./pages/setup/SetupPage"));
const RecoverPage = lazy(() => import("./pages/recover/RecoverPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const PostsPage = lazy(() => import("./pages/posts/PostsPage"));
const NewPostPage = lazy(() => import("./pages/posts/NewPostPage"));
const EditPostPage = lazy(() => import("./pages/posts/EditPostPage"));
const BulkImportPage = lazy(() => import("./pages/posts/BulkImportPage"));
const QueuesPage = lazy(() => import("./pages/queues/QueuesPage"));
const QueueFormPage = lazy(() => import("./pages/queues/QueueDetailPage"));
const QueueOverviewPage = lazy(() => import("./pages/queues/QueueOverviewPage"));
const QueuePostsPage = lazy(() => import("./pages/queues/QueuePostsPage"));
const CalendarPage = lazy(() => import("./pages/calendar/CalendarPage"));
const ProfilesPage = lazy(() => import("./pages/profiles/ProfilesPage"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const BullBoardPage = lazy(() => import("./pages/settings/BullBoardPage"));

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
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/posts" element={<PostsPage />} />
              <Route path="/posts/new" element={<NewPostPage />} />
              <Route path="/posts/import" element={<BulkImportPage />} />
              <Route path="/posts/:id/edit" element={<EditPostPage />} />
              <Route
                path="/queues"
                element={<QueuesPage />}
              />
              <Route
                path="/queues/new"
                element={<QueueFormPage />}
              />
              <Route
                path="/queues/:id"
                element={<QueueOverviewPage />}
              />
              <Route
                path="/queues/:id/edit"
                element={<QueueFormPage />}
              />
              <Route
                path="/queues/:id/posts"
                element={<QueuePostsPage />}
              />
              <Route
                path="/calendar"
                element={<CalendarPage />}
              />
              <Route
                path="/profiles"
                element={<ProfilesPage />}
              />
              <Route
                path="/notifications"
                element={<NotificationsPage />}
              />
              <Route
                path="/settings/advanced/bull-board"
                element={<BullBoardPage />}
              />
              <Route
                path="/settings"
                element={<Navigate to="/settings/profile" replace />}
              />
              <Route
                path="/settings/:tab"
                element={<SettingsPage />}
              />
              <Route
                path="/redesign/components"
                element={<ComponentLibraryPage />}
              />
            </Route>
          </Routes>
        </Suspense>
      </SetupGuard>
    </BrowserRouter>
  );
}
