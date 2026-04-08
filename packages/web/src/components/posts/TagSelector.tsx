import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
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

interface TagSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  onManage: () => void;
  tags: Array<{ id: string; name: string; color: string }>;
}

export function TagSelector({ selected, onChange, onManage, tags }: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  function toggleTag(tagId: string) {
    if (selected.includes(tagId)) {
      onChange(selected.filter((id) => id !== tagId));
    } else {
      onChange([...selected, tagId]);
    }
  }

  function removeTag(tagId: string) {
    onChange(selected.filter((id) => id !== tagId));
  }

  return (
    <div>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={isOpen} className="w-full justify-start">
            {selected.length === 0 ? 'Select tags...' : `${selected.length} tag(s) selected`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandList>
              <CommandEmpty>No tags found.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem key={tag.id} onSelect={() => toggleTag(tag.id)} className="gap-2">
                    <Checkbox
                      checked={selected.includes(tag.id)}
                      className="pointer-events-none"
                    />
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={() => { onManage(); setIsOpen(false); }}>
                  <Settings className="mr-2 h-4 w-4" />
                  Manage Tags
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((id) => {
            const tag = tags.find((t) => t.id === id);
            if (!tag) return null;
            return (
              <Badge key={id} variant="outline" className="text-xs">
                <span
                  className="h-2 w-2 rounded-full mr-1 shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
                <button
                  onClick={() => removeTag(id)}
                  aria-label={`Remove tag ${tag.name}`}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
