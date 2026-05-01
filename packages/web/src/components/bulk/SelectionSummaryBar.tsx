import { Filter, X } from 'lucide-react';
import { Button } from '../ui/button';

export interface SelectionSummaryBarProps {
  pageCount: number;
  totalCount?: number;
  filterActive: boolean;
  mode?: 'page' | 'matching-filter';
  onSelectAllMatching?: () => void;
  onClearSelection: () => void;
}

export function SelectionSummaryBar({
  pageCount,
  totalCount,
  filterActive,
  mode = 'page',
  onSelectAllMatching,
  onClearSelection,
}: SelectionSummaryBarProps) {
  if (pageCount < 1) return null;
  const shouldShowMatching = filterActive && totalCount !== undefined && totalCount > pageCount && mode === 'page';

  return (
    <div
      role="region"
      aria-label="Selection summary"
      className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border bg-background px-3 py-2 text-sm"
    >
      <span aria-live="polite" className="flex items-center gap-2">
        {mode === 'matching-filter' && totalCount && <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        {mode === 'matching-filter' && totalCount
          ? `All ${totalCount} matching filter selected`
          : `${pageCount} selected on this page`}
      </span>
      <div className="flex items-center gap-2">
        {shouldShowMatching && (
          <Button variant="link" className="h-auto p-0" onClick={onSelectAllMatching}>
            Select all {totalCount} matching filter
          </Button>
        )}
        <Button variant="link" className="h-auto p-0" onClick={onClearSelection}>
          <X className="mr-1 h-4 w-4" aria-hidden="true" />
          Clear selection
        </Button>
      </div>
    </div>
  );
}
