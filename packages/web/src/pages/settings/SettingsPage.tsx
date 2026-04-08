import { useAuth } from '../../hooks/use-auth';
import { ProfileSection } from './components/ProfileSection';
import { PreferencesSection } from './components/PreferencesSection';
import { SecuritySection } from './components/SecuritySection';
import { Skeleton } from '../../components/ui/skeleton';

export default function SettingsPage() {
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-[640px] space-y-8 p-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[400px]" />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="mx-auto max-w-[640px] space-y-8 p-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <ProfileSection user={user} />
      <PreferencesSection user={user} />
      <SecuritySection user={user} />
    </main>
  );
}
