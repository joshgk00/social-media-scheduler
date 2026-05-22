import type * as React from "react";
import { cn } from "@/lib/utils";

interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<TValue extends string> {
  label: string;
  value: TValue;
  options: ReadonlyArray<SegmentedOption<TValue>>;
  onChange: (value: TValue) => void;
  className?: string;
}

export function Segmented<TValue extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<TValue>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-[var(--bg-elevated)] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-[26px] shrink-0 whitespace-nowrap rounded-sm px-2.5 text-[12px] font-medium text-muted-foreground transition-[background,color,box-shadow] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-40",
              isActive &&
                "bg-[var(--bg-active)] text-foreground shadow-[var(--shadow-sm)]",
              !isActive && "hover:bg-accent hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
