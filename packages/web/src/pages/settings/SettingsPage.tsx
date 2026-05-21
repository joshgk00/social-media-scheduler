import {
  Bell,
  Database,
  FlaskConical,
  Settings2,
  Shield,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { Navigate, NavLink, useParams } from 'react-router';
import { Skeleton } from '../../components/ui/skeleton';
import { useAuth } from '../../hooks/use-auth';
import { cn } from '../../lib/utils';
import { AdvancedSection } from './components/AdvancedSection';
import { NotificationsTab } from './components/NotificationsTab';
import { PreferencesSection } from './components/PreferencesSection';
import { ProfileSection } from './components/ProfileSection';
import { SecuritySection } from './components/SecuritySection';
import { SnippetsSection } from './components/SnippetsSection';
import { StorageUsageCard } from './components/StorageUsageCard';

const settingsTabs = [
  { value: 'profile', label: 'Profile', icon: UserRound },
  { value: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { value: 'security', label: 'Security', icon: Shield },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'snippets', label: 'Snippets', icon: FlaskConical },
  { value: 'storage', label: 'Storage', icon: Database },
  { value: 'advanced', label: 'Advanced', icon: Settings2 },
] as const;

type SettingsTab = (typeof settingsTabs)[number]['value'];

function isSettingsTab(value: string | undefined): value is SettingsTab {
  return settingsTabs.some((tab) => tab.value === value);
}

export default function SettingsPage() {
  const { data: user, isLoading } = useAuth();
  const params = useParams();
  const activeTab = params.tab;

  if (!isSettingsTab(activeTab)) {
    return <Navigate to="/settings/profile" replace />;
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-[1120px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage account, application, and operator preferences.</p>
        </div>
        <Skeleton className="h-10" />
        <Skeleton className="h-[360px]" />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="mx-auto max-w-[1120px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage account, application, and operator preferences.</p>
      </div>

      <nav
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {settingsTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.value}
              to={`/settings/${tab.value}`}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
                  isActive && 'border-[var(--brand-accent)] text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      {activeTab === 'profile' && <ProfileSection user={user} />}
      {activeTab === 'preferences' && <PreferencesSection user={user} />}
      {activeTab === 'security' && <SecuritySection user={user} />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'snippets' && <SnippetsSection />}
      {activeTab === 'storage' && <StorageUsageCard />}
      {activeTab === 'advanced' && <AdvancedSection />}
    </main>
  );
}
