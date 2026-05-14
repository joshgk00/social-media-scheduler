import { Copy, Download, Pause, Play, RefreshCw, Shuffle, Tags, Trash2, Wand2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export interface BulkActionsDropdownProps {
  view: 'posts' | 'queue';
  selectionCount: number;
  onPause?: () => void;
  onResume?: () => void;
  onDelete?: () => void;
  onModifyTags?: () => void;
  onExport?: () => void;
  onRandomize?: () => void;
  onPurge?: () => void;
  onCopy?: () => void;
  onModifyText?: () => void;
  onDedupe?: () => void;
}

export function BulkActionsDropdown({
  view,
  selectionCount,
  onPause,
  onResume,
  onDelete,
  onModifyTags,
  onExport,
  onRandomize,
  onPurge,
  onCopy,
  onModifyText,
  onDedupe,
}: BulkActionsDropdownProps) {
  const isDisabled = selectionCount === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isDisabled}>
          Bulk actions{selectionCount > 0 ? ` (${selectionCount})` : ''}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {view === 'posts' ? (
          <>
            <DropdownMenuLabel>Publishing controls</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onPause}><Pause className="mr-2 h-4 w-4" aria-hidden="true" />Pause Publishing</DropdownMenuItem>
              <DropdownMenuItem onClick={onResume}><Play className="mr-2 h-4 w-4" aria-hidden="true" />Resume Publishing</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onModifyTags}><Tags className="mr-2 h-4 w-4" aria-hidden="true" />Modify Tags</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onExport}><Download className="mr-2 h-4 w-4" aria-hidden="true" />Export Selected</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Danger zone</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Delete Posts</DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : (
          <>
            <DropdownMenuLabel>Order</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onRandomize}><Shuffle className="mr-2 h-4 w-4" aria-hidden="true" />Randomize Order</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onModifyText}><Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />Modify Text</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Move</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onCopy}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy to Queue</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Cleanup</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onDedupe}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Remove Duplicates</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onExport}><Download className="mr-2 h-4 w-4" aria-hidden="true" />Export Queue</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Danger zone</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onPurge} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Purge Queue</DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
