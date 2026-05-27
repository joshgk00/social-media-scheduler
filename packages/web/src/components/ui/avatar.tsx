"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";
import { PlatformGlyph, type Platform } from "./platform-glyph";

const avatarSizeClassNames = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-12 w-12 text-sm",
} as const;

function getInitials(name?: string): string {
  if (!name) return "CM";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
    size?: keyof typeof avatarSizeClassNames;
    name?: string;
    imageSrc?: string | null;
    platform?: Platform;
  }
>(
  (
    { className, children, size = "md", name, imageSrc, platform, ...props },
    ref,
  ) => (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex shrink-0 overflow-visible rounded-full",
        avatarSizeClassNames[size],
        className,
      )}
      {...props}
    >
      <div className="h-full w-full overflow-hidden rounded-full">
        {children ?? (
          <>
            {imageSrc && <AvatarImage src={imageSrc} alt="" />}
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </>
        )}
      </div>
      {platform && (
        <PlatformGlyph
          platform={platform}
          size={12}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-[var(--bg-surface)]"
        />
      )}
    </AvatarPrimitive.Root>
  ),
);
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
