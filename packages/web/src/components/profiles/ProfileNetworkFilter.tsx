import { Globe, Hash, Network, Share2 } from 'lucide-react';
import { Button } from '../ui/button';

// lucide-react v1 dropped the Twitter / Linkedin / Facebook brand icons
// (UI-SPEC §Icon Inventory flagged this as "swap for a custom icon").
// Substitutes: Twitter → Hash (tweet metaphor), LinkedIn → Network,
// Facebook → Share2. The chip label text always accompanies the icon so
// brand recognition isn't lost.

export type NetworkFilterValue = 'all' | 'twitter' | 'linkedin' | 'facebook';

interface ProfileNetworkFilterProps {
  value: NetworkFilterValue;
  onChange: (next: NetworkFilterValue) => void;
}

interface ChipConfig {
  value: NetworkFilterValue;
  label: string;
  icon: typeof Globe;
}

const CHIPS: ChipConfig[] = [
  { value: 'all', label: 'All', icon: Globe },
  { value: 'twitter', label: 'Twitter', icon: Hash },
  { value: 'linkedin', label: 'LinkedIn', icon: Network },
  { value: 'facebook', label: 'Facebook', icon: Share2 },
];

export function ProfileNetworkFilter({ value, onChange }: ProfileNetworkFilterProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 mb-4"
      role="group"
      aria-label="Filter profiles by network"
    >
      {CHIPS.map(({ value: chipValue, label, icon: Icon }) => {
        const isActive = value === chipValue;
        return (
          <Button
            key={chipValue}
            type="button"
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            aria-pressed={isActive}
            onClick={() => onChange(chipValue)}
          >
            <Icon className="w-4 h-4 mr-1" aria-hidden="true" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}
