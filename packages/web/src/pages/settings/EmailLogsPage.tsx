import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { NOTIFICATION_EVENTS, type NotificationEventType } from '@sms/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEmailLogs, type EmailLogRow, type EmailLogsFilters } from '@/hooks/use-notifications';

type TestEmailLogRow = Partial<EmailLogRow> & Pick<EmailLogRow, 'id' | 'eventType' | 'recipientEmail' | 'subject' | 'status' | 'sentAt'>;

export interface EmailLogsPageProps {
  rows?: TestEmailLogRow[];
  onFilter?: (filters: EmailLogsFilters) => void;
}

function toEmailLogRow(emailLogRow: TestEmailLogRow): EmailLogRow {
  return {
    errorMessage: null,
    smtpMessageId: null,
    ...emailLogRow,
  };
}

function getEventLabel(eventType: NotificationEventType): string {
  return NOTIFICATION_EVENTS.find((eventSpec) => eventSpec.eventType === eventType)?.label ?? eventType;
}

function useIsNarrowViewport() {
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    function syncViewport() {
      setIsNarrowViewport(window.innerWidth < 768);
    }

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  return isNarrowViewport;
}

function EmailLogsPageView({ rows, onFilter }: { rows: EmailLogRow[]; onFilter?: (filters: EmailLogsFilters) => void }) {
  const [status, setStatus] = useState<'all' | 'sent' | 'failed'>('all');
  const [eventType, setEventType] = useState<'all' | NotificationEventType>('all');
  const [recipientInput, setRecipientInput] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const isNarrowViewport = useIsNarrowViewport();

  useEffect(() => {
    if (!onFilter) return undefined;

    const timer = setTimeout(() => {
      onFilter?.({
        status: status === 'all' ? undefined : status,
        eventType: eventType === 'all' ? undefined : [eventType],
        recipient: recipientInput || undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [eventType, onFilter, recipientInput, status]);

  function toggleExpanded(rowId: string) {
    setExpandedRows((previousExpandedRows) => {
      const nextExpandedRows = new Set(previousExpandedRows);
      if (nextExpandedRows.has(rowId)) {
        nextExpandedRows.delete(rowId);
      } else {
        nextExpandedRows.add(rowId);
      }
      return nextExpandedRows;
    });
  }

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Email logs</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(value) => setStatus(value as 'all' | 'sent' | 'failed')}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={eventType} onValueChange={(value) => setEventType(value as 'all' | NotificationEventType)}>
          <SelectTrigger className="w-[220px]" aria-label="Event type">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {NOTIFICATION_EVENTS.map((eventSpec) => (
              <SelectItem key={eventSpec.eventType} value={eventSpec.eventType}>
                {eventSpec.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="search"
          role="searchbox"
          aria-label="Recipient"
          placeholder="Recipient"
          value={recipientInput}
          onChange={(event) => setRecipientInput(event.target.value)}
          className="w-[240px]"
        />
      </div>

      {isNarrowViewport ? (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-md border border-border px-4 py-12 text-center text-sm text-muted-foreground">
              No emails yet
            </div>
          ) : null}
          {rows.map((emailLogRow) => {
            const isExpanded = expandedRows.has(emailLogRow.id);
            const canExpand = emailLogRow.status === 'failed' && Boolean(emailLogRow.errorMessage);

            return (
              <div key={emailLogRow.id} className="overflow-hidden rounded-md border border-border">
                <div className="grid gap-3 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Event type</p>
                      <p className="font-medium text-foreground">{getEventLabel(emailLogRow.eventType)}</p>
                    </div>
                    <Badge variant={emailLogRow.status === 'failed' ? 'destructive' : 'secondary'}>
                      {emailLogRow.status}
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Sent at</p>
                      <p className="text-foreground">{format(new Date(emailLogRow.sentAt), 'PPp')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Recipient</p>
                      <p className="break-words text-foreground">{emailLogRow.recipientEmail}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="break-words text-foreground">{emailLogRow.subject}</p>
                  </div>
                  {canExpand ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => toggleExpanded(emailLogRow.id)}
                      aria-label={isExpanded ? 'Collapse failed email' : 'Expand failed email'}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {isExpanded ? 'Hide failure' : 'Show failure'}
                    </Button>
                  ) : null}
                </div>
                {isExpanded ? (
                  <div className="border-t border-border bg-muted/30 px-4 py-3 text-sm text-destructive">
                    {emailLogRow.errorMessage}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Sent at</TableHead>
                <TableHead>Event type</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No emails yet
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((emailLogRow) => {
                const isExpanded = expandedRows.has(emailLogRow.id);
                const canExpand = emailLogRow.status === 'failed' && Boolean(emailLogRow.errorMessage);

                return (
                  <Fragment key={emailLogRow.id}>
                    <TableRow>
                      <TableCell>
                        {canExpand ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleExpanded(emailLogRow.id)}
                            aria-label={isExpanded ? 'Collapse failed email' : 'Expand failed email'}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell>{format(new Date(emailLogRow.sentAt), 'PPp')}</TableCell>
                      <TableCell>{getEventLabel(emailLogRow.eventType)}</TableCell>
                      <TableCell>{emailLogRow.recipientEmail}</TableCell>
                      <TableCell>{emailLogRow.subject}</TableCell>
                      <TableCell>
                        <Badge variant={emailLogRow.status === 'failed' ? 'destructive' : 'secondary'}>
                          {emailLogRow.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={5} className="bg-muted/30 text-sm text-destructive">
                          {emailLogRow.errorMessage}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}

function EmailLogsPageContainer() {
  const [filters, setFilters] = useState<EmailLogsFilters>({ page: 1 });
  const emailLogsQuery = useEmailLogs(filters);

  return (
    <EmailLogsPageView
      rows={emailLogsQuery.data?.rows ?? []}
      onFilter={(nextFilters) => setFilters((previousFilters) => ({ ...previousFilters, ...nextFilters, page: 1 }))}
    />
  );
}

export function EmailLogsPage(props: EmailLogsPageProps) {
  if (props.rows !== undefined || props.onFilter !== undefined) {
    return <EmailLogsPageView rows={(props.rows ?? []).map(toEmailLogRow)} onFilter={props.onFilter} />;
  }

  return <EmailLogsPageContainer />;
}

export default EmailLogsPage;
