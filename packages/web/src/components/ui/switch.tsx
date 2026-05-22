import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SwitchProps extends React.ComponentPropsWithoutRef<
  typeof SwitchPrimitives.Root
> {
  label?: string;
  hint?: string;
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, id, label, hint, ...props }, ref) => {
  const generatedId = React.useId();
  const switchId = id ?? generatedId;
  const control = (
    <SwitchPrimitives.Root
      id={switchId}
      className={cn(
        "peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--brand-accent)] data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-[var(--text-on-brand)] shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitives.Root>
  );

  if (!label && !hint) return control;

  return (
    <div className="flex items-start gap-3">
      {control}
      <div className="space-y-0.5">
        {label && (
          <Label
            htmlFor={switchId}
            className="text-[13px] font-medium text-foreground"
          >
            {label}
          </Label>
        )}
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
