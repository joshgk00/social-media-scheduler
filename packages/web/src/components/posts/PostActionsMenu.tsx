import { MoreVertical, Pencil, Trash2, History, FileText, RotateCw } from 'lucide-react';
import { EDITABLE_STATES, DELETABLE_STATES, type PostStatus } from '@sms/shared';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface PostActionsMenuProps {
  post: { id: string; status: string; notes: string | null };
  onEdit: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onViewHistory: () => void;
  onViewFullText: () => void;
}

export function PostActionsMenu({
  post,
  onEdit,
  onDelete,
  onRetry,
  onViewHistory,
  onViewFullText,
}: PostActionsMenuProps) {
  const isEditable = EDITABLE_STATES.includes(post.status as PostStatus);
  const isDeletable = DELETABLE_STATES.includes(post.status as PostStatus);
  const isPublishing = post.status === 'publishing';
  const isFailed = post.status === 'failed';
  const isDraft = post.status === 'draft';

  const editDisabledReason = isPublishing
    ? 'Cannot edit while publishing'
    : !isEditable
      ? 'Post cannot be edited in its current state'
      : undefined;
  const deleteDisabledReason = isPublishing
    ? 'Cannot delete while publishing'
    : !isDeletable
      ? 'Post cannot be deleted in its current state'
      : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Post actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!isEditable || isPublishing}
          onClick={onEdit}
          title={editDisabledReason}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isDeletable || isPublishing}
          onClick={onDelete}
          title={deleteDisabledReason}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
        {isFailed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRetry}>
              <RotateCw className="mr-2 h-4 w-4 text-primary" />
              Retry Post
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {!isDraft && (
          <DropdownMenuItem onClick={onViewHistory}>
            <History className="mr-2 h-4 w-4" />
            View History
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onViewFullText}>
          <FileText className="mr-2 h-4 w-4" />
          View Full Text
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
