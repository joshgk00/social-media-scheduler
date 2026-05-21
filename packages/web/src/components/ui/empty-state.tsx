import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-md border border-dashed border-input px-6 py-10 text-center">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-muted-foreground">
        <Icon icon={icon} />
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
