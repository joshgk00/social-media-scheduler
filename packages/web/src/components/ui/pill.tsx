import type * as React from "react";
import {
  Check,
  Clock,
  Edit3,
  ListOrdered,
  Pause,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type PillTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const pillToneClassNames: Record<PillTone, string> = {
  neutral: "bg-[var(--status-neutral-soft)] text-[var(--text-secondary)]",
  success: "bg-[var(--status-success-soft)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  danger: "bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
  info: "bg-[var(--status-info-soft)] text-[var(--status-info)]",
  brand: "bg-[var(--brand-primary-soft)] text-[var(--text-primary)]",
};

interface PillProps {
  children: React.ReactNode;
  tone?: PillTone;
  icon?: LucideIcon;
  dot?: boolean;
  className?: string;
}

export function Pill({
  children,
  tone = "neutral",
  icon,
  dot = false,
  className,
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11px] font-medium leading-none",
        pillToneClassNames[tone],
        className,
      )}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {icon && <Icon icon={icon} size={12} />}
      {children}
    </span>
  );
}

type StatusConfig = {
  tone: PillTone;
  icon?: LucideIcon;
  label: string;
  dot?: boolean;
};

const statusConfig: Record<string, StatusConfig> = {
  scheduled: { tone: "info", icon: Clock, label: "Scheduled" },
  queued: { tone: "neutral", icon: ListOrdered, label: "Queued" },
  draft: { tone: "neutral", icon: Edit3, label: "Draft" },
  published: { tone: "success", icon: Check, label: "Published" },
  failed: { tone: "danger", icon: TriangleAlert, label: "Failed" },
  active: { tone: "success", label: "Active", dot: true },
  paused: { tone: "warning", icon: Pause, label: "Paused" },
  deprecated: { tone: "neutral", label: "Deprecated", dot: true },
};

export type StatusPillStatus = keyof typeof statusConfig;

interface StatusPillProps {
  status: StatusPillStatus;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  const config = statusConfig[status];

  return (
    <Pill
      tone={config.tone}
      icon={config.icon}
      dot={config.dot}
      className={className}
    >
      {config.label}
    </Pill>
  );
}
