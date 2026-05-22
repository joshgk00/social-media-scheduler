import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router";
import { LogOut, Menu, PenSquare, Search, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth, useLogout, type User } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./NotificationBell";
import { Sidebar } from "./Sidebar";

function getInitials(user?: User): string {
  const nameParts = [user?.firstName, user?.lastName].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts
      .map((part) => part?.[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return (user?.username ?? user?.email ?? "CM").slice(0, 2).toUpperCase();
}

export function SidebarLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, []);

  async function handleSignOut() {
    await logout.mutateAsync();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:border focus:border-ring focus:bg-background focus:p-3 focus:text-foreground"
      >
        Skip to main content
      </a>

      <div className="hidden md:flex">
        <Sidebar
          isCollapsed={isCollapsed}
          onToggle={() => setIsCollapsed((prev) => !prev)}
          user={user}
        />
      </div>

      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent
          side="left"
          className="w-[var(--sidebar-w)] border-border bg-[var(--bg-base)] p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            isCollapsed={false}
            onToggle={() => setIsMobileOpen(false)}
            user={user}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-border bg-[var(--bg-base)] px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Open navigation menu"
            className="h-8 w-8 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <label className="relative hidden w-full max-w-[480px] sm:block">
            <span className="sr-only">Search posts, queues, profiles</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              aria-keyshortcuts="Meta+K Control+K"
              placeholder="Search posts, queues, profiles… ⌘ K"
              className="h-8 w-full rounded-md border border-input bg-[var(--bg-canvas)] pl-9 pr-3 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:shadow-[var(--shadow-focus)]"
            />
          </label>

          <div className="flex-1" />

          <Button
            asChild
            variant="ghost"
            className="hidden h-8 gap-2 px-3 text-[13px] font-medium text-foreground hover:bg-accent sm:inline-flex"
          >
            <Link to="/posts/new">
              <PenSquare className="h-4 w-4" />
              New post
            </Link>
          </Button>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label="Open user menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={user?.profileImagePath ?? undefined}
                    alt=""
                  />
                  <AvatarFallback className="bg-[var(--bg-elevated)] text-[11px] font-semibold text-foreground">
                    {getInitials(user)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/settings/profile" className="cursor-default">
                  <UserRound className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void handleSignOut();
                }}
                className={cn(
                  "text-destructive focus:text-destructive",
                  logout.isPending && "opacity-60",
                )}
                disabled={logout.isPending}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div
          id="main-content"
          className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-7"
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
