import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: React.ReactNode;
  title?: string;
  caption?: string;
  widthClassName?: string;
  showHeader?: boolean;
  footer?: React.ReactNode;
}

export function Brandmark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-[linear-gradient(145deg,var(--brand-primary-hover),var(--brand-primary))] font-bold text-primary-foreground shadow-[var(--shadow-md)]",
        className,
      )}
    >
      C&amp;M
    </div>
  );
}

export function AuthShell({
  children,
  title = "Clicks & Mortar Scheduler",
  caption = "Self-hosted on your infrastructure",
  widthClassName = "max-w-[380px]",
  showHeader = true,
  footer,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        className={cn(
          "mx-auto flex min-h-screen w-full flex-col justify-center px-4 py-10",
          widthClassName,
        )}
      >
        {showHeader && (
          <div className="mb-5 flex flex-col items-center text-center">
            <Brandmark className="mb-3 h-14 w-14 text-lg" />
            <h1 className="text-sm font-semibold leading-5">{title}</h1>
            <p className="text-xs text-muted-foreground">{caption}</p>
          </div>
        )}
        {children}
        {footer}
      </div>
    </main>
  );
}
