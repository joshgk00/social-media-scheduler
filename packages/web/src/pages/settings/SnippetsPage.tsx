import { useDeferredValue, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useDeleteSnippet, useSnippets, type Snippet } from '../../hooks/use-snippets';
import { ConfirmDestructiveDialog } from '../../components/bulk/ConfirmDestructiveDialog';
import { SnippetFormDialog } from '../../components/snippets/SnippetFormDialog';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';

const SETTINGS_LINK_CLASSES = 'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-foreground';

function bodyPreview(body: string): string {
  return body.length > 50 ? `${body.slice(0, 50)}…` : body;
}

export default function SnippetsPage() {
  const snippetsQuery = useSnippets();
  const deleteSnippetMutation = useDeleteSnippet();
  const [searchInput, setSearchInput] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | undefined>(undefined);
  const [deletingSnippet, setDeletingSnippet] = useState<Snippet | null>(null);
  const deferredSearch = useDeferredValue(searchInput);

  const filteredSnippets = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return snippetsQuery.data ?? [];
    }

    return (snippetsQuery.data ?? []).filter((snippet) =>
      snippet.name.toLowerCase().includes(normalizedSearch));
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
    <main className="space-y-6">
      <nav aria-label="Settings sections" className="inline-flex h-10 items-center rounded-md bg-muted p-1 text-muted-foreground">
        <Link to="/settings" className={SETTINGS_LINK_CLASSES}>Settings</Link>
        <span className="inline-flex items-center justify-center rounded-sm bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm">
          Snippets
        </span>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Snippets</h1>
          <p className="text-sm text-muted-foreground">
            Save reusable text and hashtag sets to insert into any post.
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New snippet
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search snippets"
          placeholder="Search snippets..."
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

      {!snippetsQuery.isLoading && filteredSnippets.length === 0 && !hasSearch ? (
        <section className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-foreground">No snippets yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a snippet to insert reusable text or hashtag sets into any post.
          </p>
          <Button type="button" className="mt-5" onClick={() => setIsCreateOpen(true)}>
            New snippet
          </Button>
        </section>
      ) : null}

      {!snippetsQuery.isLoading && filteredSnippets.length === 0 && hasSearch ? (
        <section className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-foreground">No matching snippets</h2>
          <p className="mt-2 text-sm text-muted-foreground">Try a different search term.</p>
        </section>
      ) : null}

      {filteredSnippets.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Body preview</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-14 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSnippets.map((snippet) => (
                <TableRow key={snippet.id}>
                  <TableCell className="font-medium text-foreground">{snippet.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {snippet.category === 'hashtag_set' ? 'Hashtag set' : 'Text snippet'}
                  </TableCell>
                  <TableCell className="max-w-[360px] text-sm text-muted-foreground">
                    <span className="block break-words">{bodyPreview(snippet.body)}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(snippet.updatedAt), 'PP')}
                  </TableCell>
                  <TableCell className="text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <DropdownMenu>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Snippet actions for ${snippet.name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <DropdownMenuContent align="end">
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
                        <TooltipContent>
                          <p>{`Snippet actions for ${snippet.name}`}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <SnippetFormDialog
        open={isCreateOpen || !!editingSnippet}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsCreateOpen(false);
            setEditingSnippet(undefined);
            return;
          }

          if (!editingSnippet) {
            setIsCreateOpen(true);
          }
        }}
        snippet={editingSnippet}
      />

      <ConfirmDestructiveDialog
        open={!!deletingSnippet}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeletingSnippet(null);
          }
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
    </main>
  );
}
