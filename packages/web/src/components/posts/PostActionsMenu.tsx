import { MoreVertical, Pencil, Trash2, History, FileText, StickyNote } from 'lucide-react';
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
  onViewHistory: () => void;
  onViewFullText: () => void;
  onViewNotes: () => void;
}

export function PostActionsMenu({
  post,
  onEdit,
  onDelete,
  onViewHistory,
  onViewFullText,
  onViewNotes,
}: PostActionsMenuProps) {
  const isEditable = EDITABLE_STATES.includes(post.status as PostStatus);
  const isDeletable = DELETABLE_STATES.includes(post.status as PostStatus);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Post actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!isEditable}
          onClick={onEdit}
          title={!isEditable ? 'Post cannot be edited in its current state' : undefined}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isDeletable}
          onClick={onDelete}
          title={!isDeletable ? 'Post cannot be deleted in its current state' : undefined}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onViewHistory}>
          <History className="mr-2 h-4 w-4" />
          View History
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewFullText}>
          <FileText className="mr-2 h-4 w-4" />
          View Full Text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewNotes} disabled={!post.notes}>
          <StickyNote className="mr-2 h-4 w-4" />
          View Notes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
