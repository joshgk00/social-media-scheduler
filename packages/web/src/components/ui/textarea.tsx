import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TextareaProps extends React.ComponentProps<"textarea"> {
  label?: string;
  hint?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, id, label, hint, error, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const hintId = hint ? `${textareaId}-hint` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;
    const describedBy =
      [errorId, hintId].filter(Boolean).join(" ") || undefined;
    const control = (
      <textarea
        id={textareaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "flex min-h-20 w-full rounded-md border border-input bg-[var(--bg-base)] px-2.5 py-2 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-[var(--text-dim)] focus-visible:border-ring focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-destructive",
          className,
        )}
        ref={ref}
        {...props}
      />
    );

    if (!label && !hint && !error) return control;

    return (
      <div className="space-y-1.5">
        {label && (
          <Label
            htmlFor={textareaId}
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
Textarea.displayName = "Textarea";

export { Textarea };
