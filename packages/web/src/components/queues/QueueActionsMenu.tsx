import { useState } from 'react';
import { useNavigate } from 'react-router';
import { MoreVertical, List, Pencil, Copy, Pause, Play, Trash2 } from 'lucide-react';
import type { QueueListItem } from '../../hooks/use-queues';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface QueueActionsMenuProps {
  queue: QueueListItem;
  onDelete: () => void;
  onCopyConfig: () => void;
  onTogglePause?: () => void;
}

export function QueueActionsMenu({ queue, onDelete, onCopyConfig, onTogglePause }: QueueActionsMenuProps) {
  const navigate = useNavigate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Queue actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/queues/${queue.id}/posts`)}>
            <List className="mr-2 h-4 w-4" />
            View posts
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/queues/${queue.id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit queue
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopyConfig}>
            <Copy className="mr-2 h-4 w-4" />
            Copy configuration
          </DropdownMenuItem>
          {onTogglePause && (
            <DropdownMenuItem onClick={onTogglePause}>
              {queue.isPaused ? (
                <Play className="mr-2 h-4 w-4" />
              ) : (
                <Pause className="mr-2 h-4 w-4" />
              )}
              {queue.isPaused ? 'Resume queue' : 'Pause queue'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete queue
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this queue?</DialogTitle>
            <DialogDescription>
              This removes the queue and its schedule configuration. Posts in this queue will become unqueued but are not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete();
                setIsDeleteOpen(false);
              }}
            >
              Delete Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
