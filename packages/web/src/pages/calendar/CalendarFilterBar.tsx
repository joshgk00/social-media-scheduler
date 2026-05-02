import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { CalendarQuery } from '@sms/shared';
import { useProfiles } from '../../hooks/use-profiles';
import { useTags } from '../../hooks/use-tags';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../components/ui/command';
import { Input } from '../../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

type CalendarFilterState = Pick<CalendarQuery, 'scope' | 'platforms' | 'profileIds' | 'tagIds' | 'search'>;

interface CalendarFilterBarProps {
  filters: CalendarFilterState;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onFiltersChange: (filters: CalendarFilterState) => void;
}

interface FilterOption {
  id: string;
  label: string;
  color?: string;
}

interface MultiSelectFilterProps {
  label: string;
  placeholder: string;
  selected: string[];
  options: FilterOption[];
  onChange: (nextSelected: string[]) => void;
  searchPlaceholder: string;
}

function MultiSelectFilter({
  label,
  placeholder,
  selected,
  options,
  onChange,
  searchPlaceholder,
}: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  function toggleOption(optionId: string) {
    if (selected.includes(optionId)) {
      onChange(selected.filter((value) => value !== optionId));
      return;
    }

    onChange([...selected, optionId]);
  }

  function removeOption(optionId: string) {
    onChange(selected.filter((value) => value !== optionId));
  }

  const selectedOptions = options.filter((option) => selected.includes(option.id));

  return (
    <div className="min-w-[180px] flex-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={isOpen} className="w-full justify-start">
            {selected.length === 0 ? placeholder : `${selected.length} ${label.toLowerCase()} selected`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.id} onSelect={() => toggleOption(option.id)} className="gap-2">
                    <Checkbox checked={selected.includes(option.id)} className="pointer-events-none" />
                    {option.color ? (
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: option.color }}
                        aria-hidden="true"
                      />
                    ) : null}
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedOptions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <Badge key={option.id} variant="outline" className="text-xs">
              {option.color ? (
                <span
                  className="mr-1 h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: option.color }}
                  aria-hidden="true"
                />
              ) : null}
              {option.label}
              <button
                onClick={() => removeOption(option.id)}
                aria-label={`Remove ${label.toLowerCase()} ${option.label}`}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CalendarFilterBar({
  filters,
  searchInput,
  onSearchInputChange,
  onFiltersChange,
}: CalendarFilterBarProps) {
  const { data: profiles } = useProfiles();
  const { data: tags } = useTags();

  const platformOptions = useMemo<FilterOption[]>(
    () => [
      { id: 'twitter', label: 'Twitter' },
      { id: 'linkedin', label: 'LinkedIn' },
      { id: 'facebook', label: 'Facebook' },
    ],
    [],
  );
  const profileOptions = useMemo<FilterOption[]>(
    () =>
      (profiles ?? []).map((profile) => ({
        id: profile.id,
        label: `${profile.displayName} (@${profile.handle})`,
      })),
    [profiles],
  );
  const tagOptions = useMemo<FilterOption[]>(
    () =>
      (tags ?? []).map((tag) => ({
        id: tag.id,
        label: tag.name,
        color: tag.color,
      })),
    [tags],
  );

  return (
    <section aria-label="Calendar filters" className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <MultiSelectFilter
          label="Platforms"
          placeholder="All platforms"
          selected={filters.platforms ?? []}
          options={platformOptions}
          onChange={(platforms) => onFiltersChange({ ...filters, platforms: platforms.length > 0 ? platforms as CalendarQuery['platforms'] : undefined })}
          searchPlaceholder="Search platforms..."
        />
        <MultiSelectFilter
          label="Profiles"
          placeholder="All profiles"
          selected={filters.profileIds ?? []}
          options={profileOptions}
          onChange={(profileIds) => onFiltersChange({ ...filters, profileIds: profileIds.length > 0 ? profileIds : undefined })}
          searchPlaceholder="Search profiles..."
        />
        <MultiSelectFilter
          label="Tags"
          placeholder="All tags"
          selected={filters.tagIds ?? []}
          options={tagOptions}
          onChange={(tagIds) => onFiltersChange({ ...filters, tagIds: tagIds.length > 0 ? tagIds : undefined })}
          searchPlaceholder="Search tags..."
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Tabs value={filters.scope} onValueChange={(scope) => onFiltersChange({ ...filters, scope: scope as CalendarQuery['scope'] })}>
          <TabsList>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="queued">Queued</TabsTrigger>
            <TabsTrigger value="both">Both</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts..."
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            className="pl-9"
            aria-label="Search posts"
          />
        </div>
      </div>
    </section>
  );
}
