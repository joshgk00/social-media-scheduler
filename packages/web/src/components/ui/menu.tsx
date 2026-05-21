import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface MenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

export function Menu({
  trigger,
  children,
  align = "end",
  className,
}: MenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className={cn("min-w-48", className)}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface MenuItemProps extends React.ComponentPropsWithoutRef<
  typeof DropdownMenuItem
> {
  icon?: LucideIcon;
  danger?: boolean;
}

export function MenuItem({
  icon,
  danger = false,
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <DropdownMenuItem
      className={cn(
        danger && "text-destructive focus:text-destructive",
        className,
      )}
      {...props}
    >
      {icon && <Icon icon={icon} />}
      {children}
    </DropdownMenuItem>
  );
}

export function MenuSectionLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuLabel>) {
  return (
    <DropdownMenuLabel
      className={cn(
        "text-[11px] uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export const MenuDivider = DropdownMenuSeparator;
