import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  icon: LucideIcon;
  size?: number;
}

export function Icon({
  icon: IconComponent,
  size = 16,
  className,
  ...props
}: IconProps) {
  return (
    <IconComponent
      aria-hidden="true"
      className={cn("shrink-0", className)}
      size={size}
      {...props}
    />
  );
}

interface IconButtonProps extends Omit<ButtonProps, "children" | "size"> {
  icon: LucideIcon;
  label: string;
}

export function IconButton({
  icon,
  label,
  className,
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      aria-label={label}
      className={cn("h-7 w-7", className)}
      {...props}
    >
      <Icon icon={icon} />
    </Button>
  );
}
