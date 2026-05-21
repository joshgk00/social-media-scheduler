import type * as React from "react";
import {
  CircleAlert,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type BannerTone = "info" | "warning" | "danger";

const bannerConfig: Record<
  BannerTone,
  { icon: LucideIcon; className: string }
> = {
  info: {
    icon: Info,
    className: "bg-[var(--status-info-soft)] text-[var(--status-info)]",
  },
  warning: {
    icon: TriangleAlert,
    className: "bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  },
  danger: {
    icon: CircleAlert,
    className: "bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
  },
};

interface BannerProps {
  tone?: BannerTone;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: BannerProps) {
  const config = bannerConfig[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md p-3",
        config.className,
        className,
      )}
    >
      <Icon icon={config.icon} className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm leading-5">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className="text-current">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
