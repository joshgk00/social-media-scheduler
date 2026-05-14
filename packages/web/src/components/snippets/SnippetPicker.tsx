import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Hash, Settings2 } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useSnippets } from '../../hooks/use-snippets';

interface SnippetPickerProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInsert: (nextValue: string) => void;
}

export function SnippetPicker({ textareaRef, onInsert }: SnippetPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const capturedSelection = useRef({ start: 0, end: 0 });
  const snippetsQuery = useSnippets();
  const snippets = snippetsQuery.data ?? [];

  const filteredSnippets = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (!normalizedSearch) return snippets;
    return snippets.filter((snippet) => snippet.name.toLowerCase().includes(normalizedSearch));
  }, [searchQuery, snippets]);

  function captureSelection() {
    const textarea = textareaRef.current;
    if (!textarea) {
      capturedSelection.current = { start: 0, end: 0 };
      return;
    }

    capturedSelection.current = {
      start: textarea.selectionStart ?? textarea.value.length,
      end: textarea.selectionEnd ?? textarea.value.length,
    };
  }

  function handleInsert(snippetBody: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const { start, end } = capturedSelection.current;
    const nextValue = `${textarea.value.slice(0, start)}${snippetBody}${textarea.value.slice(end)}`;
    const nextCaret = start + snippetBody.length;

    onInsert(nextValue);
    setIsOpen(false);
    setSearchQuery('');

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      captureSelection();
    }
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setSearchQuery('');
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      captureSelection();
    }
  }

  const hasSnippets = snippets.length > 0;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Insert snippet"
          onPointerDown={captureSelection}
          onKeyDown={handleTriggerKeyDown}
          className="w-fit"
        >
          <Hash className="h-4 w-4" aria-hidden="true" />
          Insert snippet
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={8}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search snippets..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {snippetsQuery.isLoading ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">Loading snippets...</div>
            ) : null}

            {!snippetsQuery.isLoading && !hasSnippets ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                No snippets yet. Create your first snippet to insert reusable text.
              </div>
            ) : null}

            {hasSnippets ? (
              <>
                <CommandEmpty>No snippets match "{searchQuery}".</CommandEmpty>
                <CommandGroup>
                  {filteredSnippets.map((snippet) => (
                    <CommandItem
                      key={snippet.id}
                      value={snippet.name}
                      onSelect={() => handleInsert(snippet.body)}
                      className="flex-col items-start gap-1"
                    >
                      <span className="font-medium text-foreground">{snippet.name}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {snippet.body}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}

            <CommandSeparator />
            <div className="px-3 py-2">
              <Link
                to="/settings/snippets"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                onClick={() => setIsOpen(false)}
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Manage snippets
              </Link>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
