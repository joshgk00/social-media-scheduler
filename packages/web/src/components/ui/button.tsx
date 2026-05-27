import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-[13px] font-medium transition-[background,border-color,color,box-shadow] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--brand-primary-hover)]",
        primary:
          "bg-primary text-primary-foreground hover:bg-[var(--brand-primary-hover)]",
        accent:
          "bg-[var(--brand-accent)] text-[var(--text-on-brand)] hover:bg-[var(--brand-accent-hover)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[var(--brand-accent-hover)]",
        danger:
          "bg-destructive text-destructive-foreground hover:bg-[var(--brand-accent-hover)]",
        outline:
          "border-input bg-transparent text-foreground hover:border-[var(--text-muted)] hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "bg-transparent text-foreground hover:bg-accent",
        link: "h-auto border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-[26px] rounded-sm px-2 text-xs",
        lg: "h-[38px] px-4 text-sm",
        icon: "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** Visual loading state is rendered only for native button usage. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant,
      size,
      asChild = false,
      leadingIcon,
      trailingIcon,
      loading = false,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isLoading = !asChild && loading;
    const content = asChild ? (
      children
    ) : (
      <>
        {isLoading ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          leadingIcon
        )}
        {children}
        {trailingIcon}
      </>
    );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
