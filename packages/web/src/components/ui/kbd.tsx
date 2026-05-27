import type * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "mono inline-flex h-5 items-center rounded border border-border bg-[var(--bg-elevated)] px-1.5 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}
