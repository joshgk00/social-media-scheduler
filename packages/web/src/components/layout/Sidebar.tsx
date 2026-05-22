import { NavLink } from "react-router";
import {
  Bell,
  Calendar,
  FileText,
  LayoutDashboard,
  ListOrdered,
  PanelLeftClose,
  PanelLeftOpen,
  PenSquare,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { User } from "@/hooks/use-auth";
import { getUserDisplayName, getUserInitials } from "@/lib/user-display";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  user?: User;
}

const sections = [
  {
    key: "primary",
    items: [
      {
        to: "/dashboard",
        icon: LayoutDashboard,
        label: "Dashboard",
        action: false,
      },
      { to: "/posts", icon: FileText, label: "Posts", action: false },
      { to: "/queues", icon: ListOrdered, label: "Queues", action: false },
      { to: "/calendar", icon: Calendar, label: "Calendar", action: false },
    ],
  },
  {
    key: "actions",
    items: [
      { to: "/posts/new", icon: PenSquare, label: "New post", action: true },
      { to: "/posts/import", icon: Upload, label: "Import CSV", action: true },
    ],
  },
  {
    key: "account",
    items: [
      { to: "/profiles", icon: Users, label: "Profiles", action: false },
      {
        to: "/notifications",
        icon: Bell,
        label: "Notifications",
        action: false,
      },
      {
        to: "/settings",
        icon: Settings,
        label: "Settings",
        action: false,
      },
    ],
  },
] as const;

export function Sidebar({ isCollapsed, onToggle, user }: SidebarProps) {
  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "flex h-screen flex-col border-r border-border bg-[var(--bg-base)] transition-[width] duration-200",
        isCollapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]",
      )}
    >
      <div className="flex h-[var(--topbar-h)] items-center gap-2 border-b border-border px-3">
        {!isCollapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              C&amp;M
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-4 text-foreground">
                Clicks &amp; Mortar
              </p>
              <p className="mono truncate text-[11px] leading-4 text-muted-foreground">
                Scheduler v2.4
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto py-2">
        {sections.map((section, sectionIndex) => (
          <div
            key={section.key}
            className={cn(
              "space-y-1 px-2 py-2",
              sectionIndex > 0 && "border-t border-border",
            )}
          >
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-8 items-center rounded-sm text-[13px] font-medium transition-colors",
                    isCollapsed
                      ? "justify-center px-2 py-[7px]"
                      : "gap-2.5 px-2.5 py-[7px]",
                    item.action && "text-foreground hover:bg-accent",
                    !item.action &&
                      isActive &&
                      "bg-primary text-primary-foreground",
                    !item.action &&
                      !isActive &&
                      "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {!isCollapsed && (
        <div className="border-t border-border p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.profileImagePath ?? undefined} alt="" />
              <AvatarFallback className="bg-[var(--bg-elevated)] text-[11px] font-semibold text-foreground">
                {getUserInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium leading-4 text-foreground">
                {getUserDisplayName(user)}
              </p>
              <p className="truncate text-[11px] leading-4 text-muted-foreground">
                {user?.email ?? ""}
              </p>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
