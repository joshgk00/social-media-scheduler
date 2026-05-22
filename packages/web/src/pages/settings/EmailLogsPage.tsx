import { useMemo, useState } from "react";
import { Link } from "react-router";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailLogs } from "@/hooks/use-notifications";

type StatusFilter = "all" | "sent" | "failed";

function formatSentAt(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export default function EmailLogsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [recipient, setRecipient] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const trimmedRecipient = recipient.trim();
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      status: status === "all" ? undefined : status,
      recipient: trimmedRecipient || undefined,
    }),
    [page, pageSize, status, trimmedRecipient],
  );
  const emailLogsQuery = useEmailLogs(filters);
  const rows = emailLogsQuery.data?.rows ?? [];
  const responsePage = emailLogsQuery.data?.page ?? page;
  const responsePageSize = emailLogsQuery.data?.pageSize ?? pageSize;
  const total = emailLogsQuery.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / responsePageSize));
  const hasPreviousPage = responsePage > 1;
  const hasNextPage = responsePage * responsePageSize < total;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <span className="flex flex-wrap items-center gap-1">
            <Link to="/settings/profile" className="hover:underline">
              Settings
            </Link>
            <span>/</span>
            <span className="text-foreground">Email logs</span>
          </span>
        }
        title="Email logs"
        subtitle="Inspect notification emails that were sent or failed."
      />

      <Card padded>
        <div className="mb-4 grid gap-3 sm:grid-cols-[180px_minmax(0,320px)]">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <NativeSelect
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter);
                setPage(1);
              }}
              aria-label="Email status"
            >
              <option value="all">All</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </NativeSelect>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Recipient</span>
            <Input
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setPage(1);
              }}
              placeholder="Filter by recipient"
            />
          </label>
        </div>

        {emailLogsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-md" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No email log entries match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Event</th>
                  <th className="px-3 py-2 font-semibold">Recipient</th>
                  <th className="px-3 py-2 font-semibold">Subject</th>
                  <th className="py-2 pl-3 text-right font-semibold">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-3 pr-3">
                      <Pill tone={row.status === "failed" ? "danger" : "success"} dot>
                        {row.status}
                      </Pill>
                    </td>
                    <td className="mono px-3 py-3 text-xs text-muted-foreground">
                      {row.eventType}
                    </td>
                    <td className="px-3 py-3">{row.recipientEmail}</td>
                    <td className="px-3 py-3">
                      <div className="max-w-[280px] truncate">{row.subject}</div>
                      {row.errorMessage ? (
                        <div className="mt-1 max-w-[280px] truncate text-xs text-[var(--status-danger)]">
                          {row.errorMessage}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pl-3 text-right text-xs text-muted-foreground">
                      {formatSentAt(row.sentAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(total > responsePageSize || responsePage > 1) && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Page {responsePage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasPreviousPage}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNextPage}
                onClick={() => setPage((currentPage) => currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
