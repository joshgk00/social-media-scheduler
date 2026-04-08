import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useProfiles, useDeleteProfile } from '../../hooks/use-profiles';
import { ConnectProfileDialog } from '../../components/profiles/ConnectProfileDialog';
import { ProfileCard } from '../../components/profiles/ProfileCard';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

function ProfilesLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-[200px] rounded-lg" />
      ))}
    </div>
  );
}

export default function ProfilesPage() {
  const { data: profiles, isLoading } = useProfiles();
  const deleteProfile = useDeleteProfile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  function handleDisconnect(profileId: string) {
    deleteProfile.mutate(profileId, {
      onSuccess: () => toast.success('Profile disconnected'),
    });
  }

  return (
    <main>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Profiles</h1>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Connect Profile
        </Button>
      </div>

      {isLoading && <ProfilesLoadingSkeleton />}

      {!isLoading && profiles?.length === 0 && (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">No profiles connected</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Twitter/X account to start scheduling posts.
            You'll need your Developer App credentials from the Twitter Developer Portal.
          </p>
          <Button onClick={() => setIsDialogOpen(true)}>Connect Profile</Button>
        </div>
      )}

      {profiles && profiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}

      <ConnectProfileDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </main>
  );
}
