import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { inputClassName } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface NativeSelectProps extends React.ComponentProps<"select"> {
  label?: string;
  hint?: string;
  error?: string;
}

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  NativeSelectProps
>(({ className, id, label, hint, error, children, ...props }, ref) => {
  const generatedId = React.useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const control = (
    <div className="relative">
      <select
        id={selectId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          inputClassName,
          "appearance-none pr-8",
          error && "border-destructive",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <Icon
        icon={ChevronDown}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );

  if (!label && !hint && !error) return control;

  return (
    <div className="space-y-1.5">
      {label && (
        <Label
          htmlFor={selectId}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
        </Label>
      )}
      {control}
      {error && (
        <p id={errorId} className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
});
NativeSelect.displayName = "NativeSelect";
