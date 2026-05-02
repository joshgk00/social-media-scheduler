import type { View } from 'react-big-calendar';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

interface CalendarToolbarProps {
  label: string;
  view: View;
  onNavigate: (action: 'PREV' | 'TODAY' | 'NEXT') => void;
  onView: (view: View) => void;
}

export function CalendarToolbar({
  label,
  view,
  onNavigate,
  onView,
}: CalendarToolbarProps) {
  return (
    <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" aria-label={`Previous ${view}`} onClick={() => onNavigate('PREV')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" aria-label="Today" onClick={() => onNavigate('TODAY')}>
          Today
        </Button>
        <Button variant="outline" size="sm" aria-label={`Next ${view}`} onClick={() => onNavigate('NEXT')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="ml-2 text-lg font-semibold">{label}</h2>
      </div>
      <Tabs value={view} onValueChange={(nextView) => onView(nextView as View)}>
        <TabsList>
          <TabsTrigger value="month">M</TabsTrigger>
          <TabsTrigger value="week">W</TabsTrigger>
          <TabsTrigger value="day">D</TabsTrigger>
        </TabsList>
      </Tabs>
    </header>
  );
}
