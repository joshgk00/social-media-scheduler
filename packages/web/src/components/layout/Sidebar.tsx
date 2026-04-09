import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  FileText,
  PenSquare,
  Users,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/posts', icon: FileText, label: 'Posts' },
  { to: '/posts/new', icon: PenSquare, label: 'New Post', isAction: true },
  { to: '/profiles', icon: Users, label: 'Profiles' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        'flex flex-col border-r border-border bg-card transition-[width] duration-200',
        isCollapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className={cn('flex items-center border-b border-border p-2', isCollapsed ? 'justify-center' : 'justify-end')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="h-8 w-8"
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-md text-sm transition-colors',
                isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                item.isAction && !isActive && 'bg-primary text-primary-foreground hover:bg-primary/90',
                item.isAction && isActive && 'bg-primary text-primary-foreground',
                !item.isAction && isActive && 'border-l-2 border-primary bg-accent text-accent-foreground',
                !item.isAction && !isActive && 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
