interface RedesignPlaceholderPageProps {
  title: string;
  eyebrow?: string;
  description?: string;
}

export function RedesignPlaceholderPage({
  title,
  eyebrow = "Redesign milestone 0",
  description = "This route is wired into the new shell. The screen will be rebuilt in its implementation milestone.",
}: RedesignPlaceholderPageProps) {
  return (
    <main className="mx-auto flex min-h-[360px] w-full max-w-5xl flex-col justify-center">
      <p className="mono mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-semibold leading-tight text-foreground">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </main>
  );
}
