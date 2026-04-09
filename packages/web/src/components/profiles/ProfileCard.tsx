import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import type { SocialProfile } from '../../hooks/use-profiles';

interface ProfileCardProps {
  profile: SocialProfile;
  onDisconnect: (id: string) => void;
}

export function ProfileCard({ profile, onDisconnect }: ProfileCardProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const avatarInitial = profile.displayName
    ? profile.displayName.charAt(0).toUpperCase()
    : '?';

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-3">
            <Avatar>
              {profile.avatarUrl && (
                <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
              )}
              <AvatarFallback>{avatarInitial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{profile.displayName}</p>
              <p className="text-sm text-muted-foreground truncate">@{profile.handle}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <Badge variant="secondary">Twitter/X</Badge>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Connected {formatDistanceToNow(new Date(profile.connectedAt), { addSuffix: true })}
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsConfirmOpen(true)}
            >
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect profile?</DialogTitle>
            <DialogDescription>
              This will remove the Twitter/X profile <strong>@{profile.handle}</strong> and
              all associated credentials. Posts linked to this profile will not be deleted
              but can no longer be published.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDisconnect(profile.id);
                setIsConfirmOpen(false);
              }}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
