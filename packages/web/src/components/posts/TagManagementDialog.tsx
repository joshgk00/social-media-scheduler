import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag, type Tag } from '../../hooks/use-tags';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface TagManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagManagementDialog({ open, onOpenChange }: TagManagementDialogProps) {
  const { data: tagList } = useTags();
  const createTagMutation = useCreateTag();
  const updateTagMutation = useUpdateTag();
  const deleteTagMutation = useDeleteTag();

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6b7280');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingTagColor, setEditingTagColor] = useState('#6b7280');
  const [deletingTag, setDeletingTag] = useState<{ id: string; name: string } | null>(null);

  function handleCreateTag() {
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;
    createTagMutation.mutate(
      { name: trimmedName, color: newTagColor },
      {
        onSuccess: () => {
          setNewTagName('');
          setNewTagColor('#6b7280');
        },
      },
    );
  }

  function startEditing(tag: Tag) {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setEditingTagColor(tag.color);
  }

  function cancelEditing() {
    setEditingTagId(null);
    setEditingTagName('');
    setEditingTagColor('#6b7280');
  }

  function handleUpdateTag(tagId: string) {
    const trimmedName = editingTagName.trim();
    if (!trimmedName) return;
    updateTagMutation.mutate(
      { tagId, tagInput: { name: trimmedName, color: editingTagColor } },
      {
        onSuccess: () => cancelEditing(),
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to update tag');
        },
      },
    );
  }

  function handleDeleteTag(tagId: string, tagName: string) {
    setDeletingTag({ id: tagId, name: tagName });
  }

  function confirmDeleteTag() {
    if (!deletingTag) return;
    deleteTagMutation.mutate(deletingTag.id, {
      onSuccess: () => setDeletingTag(null),
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to delete tag');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
          <DialogDescription>
            Create, rename, or delete tags. Tags help organize your posts.
          </DialogDescription>
        </DialogHeader>

        {/* Create tag form */}
        <div className="flex items-center gap-2 mb-4">
          <Input
            placeholder="New tag name..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag(); }}
            aria-label="New tag name"
          />
          <Input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className="w-12 h-9 p-1 cursor-pointer"
            aria-label="Tag color"
          />
          <Button
            onClick={handleCreateTag}
            size="sm"
            disabled={!newTagName.trim() || createTagMutation.isPending}
            aria-label="Create tag"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {createTagMutation.isError && (
          <p className="text-xs text-destructive mb-3">
            {(createTagMutation.error as Error)?.message ?? 'Failed to create tag'}
          </p>
        )}

        {/* Tag list */}
        <ScrollArea className="max-h-[300px]">
          {!tagList?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tags yet. Create one above.
            </p>
          ) : (
            tagList.map(tag => (
              <div
                key={tag.id}
                className="flex items-center gap-2 py-2 border-b border-border last:border-0"
              >
                {editingTagId === tag.id ? (
                  <>
                    <Input
                      type="color"
                      value={editingTagColor}
                      onChange={(e) => setEditingTagColor(e.target.value)}
                      className="w-8 h-8 p-0.5 cursor-pointer shrink-0"
                      aria-label="Edit tag color"
                    />
                    <Input
                      value={editingTagName}
                      onChange={(e) => setEditingTagName(e.target.value)}
                      className="flex-1 h-8 text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateTag(tag.id); }}
                      aria-label="Edit tag name"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleUpdateTag(tag.id)}
                      disabled={!editingTagName.trim() || updateTagMutation.isPending}
                      aria-label="Save tag"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={cancelEditing}
                      aria-label="Cancel editing"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-sm">{tag.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => startEditing(tag)}
                      aria-label={`Rename tag ${tag.name}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTag(tag.id, tag.name)}
                      disabled={deleteTagMutation.isPending}
                      aria-label={`Delete tag ${tag.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </ScrollArea>
      </DialogContent>

      <Dialog open={deletingTag !== null} onOpenChange={(isOpen) => { if (!isOpen) setDeletingTag(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tag?</DialogTitle>
            <DialogDescription>
              Delete tag &lsquo;{deletingTag?.name}&rsquo;? It will be removed from all posts.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeletingTag(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteTag}
              disabled={deleteTagMutation.isPending}
            >
              {deleteTagMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
