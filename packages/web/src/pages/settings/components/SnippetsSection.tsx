import { useDeferredValue, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteSnippet, useSnippets, type Snippet } from '../../../hooks/use-snippets';
import { ConfirmDestructiveDialog } from '../../../components/bulk/ConfirmDestructiveDialog';
import { SnippetFormDialog } from '../../../components/snippets/SnippetFormDialog';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Input } from '../../../components/ui/input';
import { Pill } from '../../../components/ui/pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';

function bodyPreview(body: string): string {
  return body.length > 72 ? `${body.slice(0, 72)}...` : body;
}

function categoryLabel(category: Snippet['category']): string {
  return category === 'hashtag_set' ? 'Hashtag set' : 'Text snippet';
}

export function SnippetsSection() {
  const snippetsQuery = useSnippets();
  const deleteSnippetMutation = useDeleteSnippet();
  const [searchInput, setSearchInput] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | undefined>(undefined);
  const [deletingSnippet, setDeletingSnippet] = useState<Snippet | null>(null);
  const deferredSearch = useDeferredValue(searchInput);

  const filteredSnippets = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    if (!normalizedSearch) return snippetsQuery.data ?? [];

    return (snippetsQuery.data ?? []).filter((snippet) =>
      [snippet.name, snippet.category, snippet.body].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [deferredSearch, snippetsQuery.data]);

  async function handleDeleteSnippet() {
    if (!deletingSnippet) return;

    try {
      await deleteSnippetMutation.mutateAsync(deletingSnippet.id);
      toast.success(`Snippet "${deletingSnippet.name}" deleted.`);
      setDeletingSnippet(null);
    } catch {
      toast.error("Couldn't delete snippet.");
    }
  }

  const hasSearch = deferredSearch.trim().length > 0;

  return (
    <>
      <Card
        title="Snippets"
        action={
          <Button
            type="button"
            variant="primary"
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setIsCreateOpen(true)}
          >
            New snippet
          </Button>
        }
        padded
      >
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search snippets"
              placeholder="Search snippets"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="pl-9"
            />
          </div>

          {snippetsQuery.isLoading ? (
            <div className="rounded-md border border-border bg-card px-6 py-12 text-sm text-muted-foreground">
              Loading snippets...
            </div>
          ) : null}

          {!snippetsQuery.isLoading && filteredSnippets.length === 0 ? (
            <section className="rounded-md border border-dashed border-border px-6 py-12 text-center">
              <h2 className="text-sm font-semibold text-foreground">
                {hasSearch ? 'No matching snippets' : 'No snippets yet'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasSearch ? 'Try a different search term.' : 'Create a snippet to insert reusable text into any post.'}
              </p>
            </section>
          ) : null}

          {filteredSnippets.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-14 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSnippets.map((snippet) => (
                    <TableRow
                      key={snippet.id}
                      className="cursor-pointer"
                      onClick={() => setEditingSnippet(snippet)}
                    >
                      <TableCell className="font-mono text-xs text-foreground">{snippet.name}</TableCell>
                      <TableCell>
                        <Pill tone="neutral">{categoryLabel(snippet.category)}</Pill>
                      </TableCell>
                      <TableCell className="max-w-[360px] text-sm text-muted-foreground">
                        <span className="block break-words">{bodyPreview(snippet.body)}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(snippet.updatedAt), 'PP')}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Snippet actions for ${snippet.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenuItem onSelect={() => setEditingSnippet(snippet)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setDeletingSnippet(snippet)}
                              className="text-destructive focus:text-destructive"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </Card>

      <SnippetFormDialog
        open={isCreateOpen || !!editingSnippet}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsCreateOpen(false);
            setEditingSnippet(undefined);
            return;
          }

          if (!editingSnippet) setIsCreateOpen(true);
        }}
        snippet={editingSnippet}
      />

      <ConfirmDestructiveDialog
        open={!!deletingSnippet}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletingSnippet(null);
        }}
        onConfirm={handleDeleteSnippet}
        title="Delete this snippet?"
        description={
          deletingSnippet
            ? `"${deletingSnippet.name}" will be removed permanently. Posts that already used it keep their text.`
            : ''
        }
        confirmLabel="Delete snippet"
        dismissLabel="Keep snippet"
        confirmationPhrase={deletingSnippet?.name ?? ''}
        phraseKind="queue-name"
        isPending={deleteSnippetMutation.isPending}
      />
    </>
  );
}
