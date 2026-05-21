import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface InputProps extends React.ComponentProps<"input"> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
}

const inputClassName =
  "flex h-8 w-full rounded-md border border-input bg-[var(--bg-base)] px-2.5 py-1.5 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-[var(--text-dim)] focus-visible:border-ring focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, id, label, hint, error, icon, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy =
      [errorId, hintId].filter(Boolean).join(" ") || undefined;
    const control = (
      <div className="relative">
        {icon && (
          <Icon
            icon={icon}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        )}
        <input
          id={inputId}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            inputClassName,
            icon && "pl-8",
            error && "border-destructive",
            className,
          )}
          ref={ref}
          {...props}
        />
      </div>
    );

    if (!label && !hint && !error) return control;

    return (
      <div className="space-y-1.5">
        {label && (
          <Label
            htmlFor={inputId}
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
  },
);
Input.displayName = "Input";

export { Input, inputClassName };
