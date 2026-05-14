import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { preferencesUpdateSchema, DATE_FORMATS, ENTRIES_PER_PAGE_OPTIONS, type PreferencesUpdateInput } from '@sms/shared';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '../../../hooks/use-auth';
import { useUpdatePreferences } from '../../../hooks/use-settings';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../../../components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

function getTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
      'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
      'Australia/Sydney', 'Pacific/Auckland', 'UTC',
    ];
  }
}

interface PreferencesSectionProps {
  user: User;
}

export function PreferencesSection({ user }: PreferencesSectionProps) {
  const [tzSearch, setTzSearch] = useState('');
  const updatePreferences = useUpdatePreferences();

  const allTimezones = useMemo(() => getTimezones(), []);
  const filteredTimezones = useMemo(() => {
    if (!tzSearch) return allTimezones;
    const lower = tzSearch.toLowerCase();
    return allTimezones.filter(tz => tz.toLowerCase().includes(lower));
  }, [allTimezones, tzSearch]);

  const form = useForm<PreferencesUpdateInput>({
    resolver: zodResolver(preferencesUpdateSchema),
    defaultValues: {
      timezone: user.timezone,
      dateFormat: user.dateFormat,
      entriesPerPage: user.entriesPerPage,
    },
  });

  const hasChanges = form.formState.isDirty;

  async function onSubmit(data: PreferencesUpdateInput) {
    try {
      await updatePreferences.mutateAsync(data);
      form.reset(data);
      toast.success('Preferences saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast.error(message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <div className="p-2">
                        <Input
                          placeholder="Search timezones..."
                          value={tzSearch}
                          onChange={(e) => setTzSearch(e.target.value)}
                          className="h-8"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      {filteredTimezones.map(tz => (
                        <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
                      ))}
                      {filteredTimezones.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No timezones found
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateFormat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date Format</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DATE_FORMATS.map(fmt => (
                        <SelectItem key={fmt.value} value={fmt.value}>
                          {fmt.label} ({fmt.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="entriesPerPage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entries Per Page</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(Number(val))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select entries per page" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ENTRIES_PER_PAGE_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                disabled={!hasChanges || updatePreferences.isPending}
              >
                {updatePreferences.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Preferences
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
