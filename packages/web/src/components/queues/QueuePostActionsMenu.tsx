import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  MoreVertical,
  Pencil,
  FileText,
  Shuffle,
  History,
  ChevronUp,
  ChevronDown,
  Trash2,
} from 'lucide-react';
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
import type { QueuePost } from '../../hooks/use-queue-posts';

interface QueuePostActionsMenuProps {
  post: QueuePost;
  queueId: string;
  isRecycling: boolean;
  cursorPosition: number;
  totalPosts: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onViewVariants: () => void;
  onViewHistory: () => void;
  onViewFullText: () => void;
}

const DELETABLE_QUEUE_STATES = ['queued'];

export function QueuePostActionsMenu({
  post,
  queueId,
  isRecycling,
  cursorPosition,
  totalPosts,
  onMoveUp,
  onMoveDown,
  onDelete,
  onViewVariants,
  onViewHistory,
  onViewFullText,
}: QueuePostActionsMenuProps) {
  const navigate = useNavigate();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const position = post.queuePosition ?? 0;
  const isQueued = post.status === 'queued';
  const isPublishing = post.status === 'publishing';
  const isDeletable = DELETABLE_QUEUE_STATES.includes(post.status);

  const isFirstPosition = position <= 1;
  const isLastPosition = position >= totalPosts;

  const canMoveUp = !isFirstPosition && isQueued && !isPublishing;
  const canMoveDown = !isLastPosition && isQueued && !isPublishing;
  const canEdit = isQueued && !isPublishing;
  const canDelete = isDeletable && !isPublishing;

  function handleDeleteConfirm() {
    setIsDeleteDialogOpen(false);
    onDelete();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Post actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!canEdit}
            onClick={() => navigate(`/posts/${post.id}/edit`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit Post
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onViewFullText}>
            <FileText className="mr-2 h-4 w-4" />
            View Full Text
          </DropdownMenuItem>

          {post.hasSpinnableText && (
            <DropdownMenuItem onClick={onViewVariants}>
              <Shuffle className="mr-2 h-4 w-4" />
              View Variants
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={onViewHistory}>
            <History className="mr-2 h-4 w-4" />
            View History
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!canMoveUp}
            onClick={onMoveUp}
            aria-label={`Move post to position ${position - 1}`}
          >
            <ChevronUp className="mr-2 h-4 w-4" />
            Move Up
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!canMoveDown}
            onClick={onMoveDown}
            aria-label={`Move post to position ${position + 1}`}
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            Move Down
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!canDelete}
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Post
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              This removes the post from the queue. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
