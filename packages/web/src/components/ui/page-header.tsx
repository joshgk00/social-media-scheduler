import type * as React from "react";

interface PageHeaderProps {
  breadcrumb?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && (
          <div className="mb-2 text-xs text-muted-foreground">{breadcrumb}</div>
        )}
        <h1 className="text-2xl font-semibold leading-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
