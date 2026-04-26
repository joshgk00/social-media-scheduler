import { Twitter, Linkedin, Facebook } from 'lucide-react';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useProfiles, type SocialProfile, type Platform } from '../../hooks/use-profiles';

interface ProfilePickerProps {
  value: string;
  onValueChange: (profileId: string, platform: Platform) => void;
  disabled?: boolean;
}

function platformIcon(platform: Platform) {
  if (platform === 'twitter') return <Twitter className="h-4 w-4" aria-hidden="true" />;
  if (platform === 'linkedin') return <Linkedin className="h-4 w-4" aria-hidden="true" />;
  return <Facebook className="h-4 w-4" aria-hidden="true" />;
}

function platformLabel(platform: Platform): string {
  if (platform === 'twitter') return 'Twitter';
  if (platform === 'linkedin') return 'LinkedIn';
  return 'Facebook';
}

/**
 * Profile picker that drives the post-create form's platform.
 *
 * On selection, fires `onValueChange(profileId, platform)` so the page can run
 * `applyPlatformSwitch` against the previous platform and reset the form
 * accordingly. The picker is disabled in edit mode (UI-SPEC §Profile Picker
 * row 6) — `platform` is locked once a post is persisted (T-DATA-01).
 */
export function ProfilePicker({ value, onValueChange, disabled }: ProfilePickerProps) {
  const { data: profiles } = useProfiles();

  const selected: SocialProfile | undefined = profiles?.find((p) => p.id === value);
  const profileList = profiles ?? [];

  function handleChange(profileId: string) {
    const profile = profileList.find((p) => p.id === profileId);
    if (!profile) return;
    onValueChange(profileId, profile.platform);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="profile-select">Profile</Label>
      <Select value={value} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger id="profile-select">
          <SelectValue placeholder="Select a profile..." />
        </SelectTrigger>
        <SelectContent>
          {profileList.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              <span className="inline-flex items-center gap-2">
                {platformIcon(profile.platform)}
                <span>
                  {profile.displayName} (@{profile.handle})
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <p className="text-xs text-muted-foreground">
          Posting as {selected.displayName} on {platformLabel(selected.platform)}
        </p>
      )}
      {!profileList.length && (
        <p className="text-xs text-muted-foreground">
          No profiles connected.{' '}
          <a href="/profiles" className="underline underline-offset-2 hover:no-underline">
            Connect a profile
          </a>
        </p>
      )}
    </div>
  );
}
