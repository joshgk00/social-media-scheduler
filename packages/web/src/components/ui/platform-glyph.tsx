import { cn } from "@/lib/utils";

export type Platform = "twitter" | "linkedin" | "facebook";

const platformConfig: Record<
  Platform,
  { label: string; glyph: string; className: string }
> = {
  twitter: {
    label: "X",
    glyph: "𝕏",
    className: "bg-[var(--bg-hover)] text-[var(--platform-twitter)]",
  },
  linkedin: {
    label: "LinkedIn",
    glyph: "in",
    className:
      "bg-[color-mix(in_srgb,var(--platform-linkedin)_20%,transparent)] text-[var(--platform-linkedin)]",
  },
  facebook: {
    label: "Facebook",
    glyph: "f",
    className:
      "bg-[color-mix(in_srgb,var(--platform-facebook)_20%,transparent)] text-[var(--platform-facebook)]",
  },
};

const sizeClassNames = {
  9: "h-[9px] min-w-[9px] rounded-[2px] px-[1px] text-[6px]",
  11: "h-[11px] min-w-[11px] rounded-[2px] px-[2px] text-[7px]",
  12: "h-3 min-w-3 rounded-[3px] px-[2px] text-[8px]",
  14: "h-3.5 min-w-3.5 rounded-[3px] px-[3px] text-[9px]",
  16: "h-4 min-w-4 rounded px-1 text-[10px]",
} as const;

interface PlatformGlyphProps {
  platform: Platform;
  size?: keyof typeof sizeClassNames;
  className?: string;
}

export function PlatformGlyph({
  platform,
  size = 16,
  className,
}: PlatformGlyphProps) {
  const config = platformConfig[platform];

  return (
    <span
      aria-label={config.label}
      className={cn(
        "mono inline-flex shrink-0 items-center justify-center font-bold leading-none tabular",
        sizeClassNames[size],
        config.className,
        className,
      )}
    >
      {config.glyph}
    </span>
  );
}
