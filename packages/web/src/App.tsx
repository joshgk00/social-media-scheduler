import { BrowserRouter, Routes, Route } from 'react-router';
import { SetupGuard } from './components/SetupGuard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SidebarLayout } from './components/layout/SidebarLayout';
import { PageSkeleton } from './components/PageSkeleton';
import { lazy, Suspense } from 'react';

const LoginPage = lazy(() => import('./pages/login/LoginPage'));
const SetupPage = lazy(() => import('./pages/setup/SetupPage'));
const RecoverPage = lazy(() => import('./pages/recover/RecoverPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const ProfilesPage = lazy(() => import('./pages/profiles/ProfilesPage'));
const PostsPage = lazy(() => import('./pages/posts/PostsPage'));
const NewPostPage = lazy(() => import('./pages/posts/NewPostPage'));
const EditPostPage = lazy(() => import('./pages/posts/EditPostPage'));
const QueuesPage = lazy(() => import('./pages/queues/QueuesPage'));
const QueueDetailPage = lazy(() => import('./pages/queues/QueueDetailPage'));
const QueuePostsPage = lazy(() => import('./pages/queues/QueuePostsPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));

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
            <Route element={<ProtectedRoute><ErrorBoundary><SidebarLayout /></ErrorBoundary></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/posts" element={<PostsPage />} />
              <Route path="/posts/new" element={<NewPostPage />} />
              <Route path="/posts/:id/edit" element={<EditPostPage />} />
              <Route path="/queues" element={<QueuesPage />} />
              <Route path="/queues/new" element={<QueueDetailPage />} />
              <Route path="/queues/:id/edit" element={<QueueDetailPage />} />
              <Route path="/queues/:id/posts" element={<QueuePostsPage />} />
              <Route path="/profiles" element={<ProfilesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </SetupGuard>
    </BrowserRouter>
  );
}
