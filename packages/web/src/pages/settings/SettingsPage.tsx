import { useAuth } from '../../hooks/use-auth';
import { Link, useSearchParams } from 'react-router';
import { ProfileSection } from './components/ProfileSection';
import { PreferencesSection } from './components/PreferencesSection';
import { SecuritySection } from './components/SecuritySection';
import { StorageUsageCard } from './components/StorageUsageCard';
import { NotificationsTab } from './components/NotificationsTab';
import { Skeleton } from '../../components/ui/skeleton';
import * as TabsUi from '../../components/ui/tabs';

const settingsTabs = ['profile', 'preferences', 'security', 'notifications', 'storage'] as const;
type SettingsTab = (typeof settingsTabs)[number];

function isSettingsTab(value: string | null): value is SettingsTab {
  return settingsTabs.includes(value as SettingsTab);
}

export default function SettingsPage() {
  const { data: user, isLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: SettingsTab = isSettingsTab(requestedTab) ? requestedTab : 'profile';

  function handleTabChange(value: string) {
    setSearchParams({ tab: value });
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-[960px] space-y-8 p-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[400px]" />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="mx-auto max-w-[960px] space-y-8 p-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <TabsUi.Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsUi.TabsList className="flex h-auto flex-wrap justify-start">
          <TabsUi.TabsTrigger value="profile">Profile</TabsUi.TabsTrigger>
          <TabsUi.TabsTrigger value="preferences">Preferences</TabsUi.TabsTrigger>
          <TabsUi.TabsTrigger value="security">Security</TabsUi.TabsTrigger>
          <TabsUi.TabsTrigger value="notifications">Notifications</TabsUi.TabsTrigger>
          <TabsUi.TabsTrigger value="storage">Storage</TabsUi.TabsTrigger>
        </TabsUi.TabsList>

        <nav aria-label="Settings sub-pages">
          <Link
            to="/settings/snippets"
            className="inline-flex items-center justify-center rounded-sm border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Snippets
          </Link>
        </nav>

        <TabsUi.TabsContent value="profile"><ProfileSection user={user} /></TabsUi.TabsContent>
        <TabsUi.TabsContent value="preferences"><PreferencesSection user={user} /></TabsUi.TabsContent>
        <TabsUi.TabsContent value="security"><SecuritySection user={user} /></TabsUi.TabsContent>
        <TabsUi.TabsContent value="notifications"><NotificationsTab /></TabsUi.TabsContent>
        <TabsUi.TabsContent value="storage"><StorageUsageCard /></TabsUi.TabsContent>
      </TabsUi.Tabs>
    </main>
  );
}
