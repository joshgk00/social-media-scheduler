import { useState } from 'react';
import { Outlet } from 'react-router';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';

export function SidebarLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-background focus:text-foreground focus:border focus:border-ring focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed((prev) => !prev)} />
      </div>

      {/* Mobile sheet sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar isCollapsed={false} onToggle={() => setIsMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header with hamburger */}
        <header className="flex items-center justify-between border-b border-border p-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Open navigation menu"
            className="h-8 w-8"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <NotificationBell />
        </header>

        <header className="hidden md:flex items-center justify-end border-b border-border px-6 py-2">
          <NotificationBell />
        </header>

        <div id="main-content" className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
