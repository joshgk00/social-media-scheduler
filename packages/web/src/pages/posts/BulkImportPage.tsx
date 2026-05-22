import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Download, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { FileDropZone } from '../../components/bulk/FileDropZone';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { useProfiles } from '../../hooks/use-profiles';
import { useQueues } from '../../hooks/use-queues';
import { useBulkImport } from '../../hooks/use-bulk-ops';
import { getQueueTemplateUrl, getScheduledTemplateUrl } from '../../hooks/use-csv-templates';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/ui/page-header';
import { Pill } from '../../components/ui/pill';

interface ImportErrorMessage {
  title: string;
  description: string;
  details: string[];
}

function formatImportError(error: unknown): ImportErrorMessage {
  const fallback = error instanceof Error ? error.message : "Couldn't start the import. Try again.";
  const body = (error as { body?: Record<string, unknown> }).body;
  const rawDetails = Array.isArray(body?.details) ? body.details : [];
  const details = rawDetails
    .map((detail) => {
      if (!detail || typeof detail !== 'object') return null;
      const rowNumber = 'rowNumber' in detail ? Number(detail.rowNumber) : null;
      const reason = 'reason' in detail ? String(detail.reason) : '';
      if (!reason) return null;
      return rowNumber && Number.isFinite(rowNumber) ? `Row ${rowNumber}: ${reason}` : reason;
    })
    .filter((detail): detail is string => Boolean(detail));

  if (body?.code === 'csv_validation_failed' || body?.code === 'csv_parse_failed') {
    return {
      title: 'CSV import needs changes',
      description: String(body.error ?? fallback),
      details,
    };
  }

  if (body?.error === 'queue_name_mismatch') {
    return {
      title: 'Queue name does not match',
      description: `Rows must use queue_name "${String(body.expected ?? '')}" for this queue.`,
      details: [`${Number(body.mismatchedRows) || 0} row(s) target a different queue.`],
    };
  }

  return {
    title: "Couldn't start the import",
    description: fallback,
    details,
  };
}

export default function BulkImportPage() {
  const navigate = useNavigate();
  const { data: profiles } = useProfiles();
  const { data: queues } = useQueues();
  const importMutation = useBulkImport();
  const [target, setTarget] = useState<'scheduled' | 'queue'>('scheduled');
  const [profileId, setProfileId] = useState('');
  const [queueId, setQueueId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [validRowCount, setValidRowCount] = useState(0);
  const [budgetError, setBudgetError] = useState<{ budget: number; currentCount: number; attemptedAdditional: number } | null>(null);
  const [importError, setImportError] = useState<ImportErrorMessage | null>(null);
  const filteredQueues = queues?.filter((queue) => !profileId || queue.profileId === profileId) ?? [];
  const isReady = !!target && !!profileId && !!file && (target === 'scheduled' || !!queueId);

  async function handleSubmit() {
    if (!file) return;
    setBudgetError(null);
    setImportError(null);
    const formData = new FormData();
    formData.append('target', target);
    formData.append('profileId', profileId);
    if (queueId) formData.append('queueId', queueId);
    formData.append('file', file);
    try {
      await importMutation.mutateAsync(formData);
      toast.success("Import queued. You'll be notified when it finishes.");
      navigate('/posts');
    } catch (error) {
      const body = (error as { body?: Record<string, unknown> }).body;
      if (body?.code === 'twitter_budget_exceeded') {
        setBudgetError({
          budget: Number(body.budget),
          currentCount: Number(body.currentCount),
          attemptedAdditional: Number(body.attemptedAdditional),
        });
        return;
      }
      setImportError(formatImportError(error));
    }
  }

  const projected = budgetError ? budgetError.currentCount + budgetError.attemptedAdditional : 0;
  const overage = budgetError ? Math.max(0, projected - budgetError.budget) : 0;

  async function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    setBudgetError(null);
    setImportError(null);
    if (!nextFile) {
      setValidRowCount(0);
      return;
    }

    const text =
      typeof nextFile.text === 'function'
        ? await nextFile.text().catch(() => '')
        : '';
    const rows = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean);
    setValidRowCount(Math.max(0, rows.length - 1));
  }

  return (
    <main className="mx-auto max-w-[760px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        breadcrumb={<Link to="/posts" className="hover:underline">Posts</Link>}
        title="Import posts from CSV"
        subtitle="Upload a CSV to create scheduled posts or append posts to an existing queue."
      />

      <section className="space-y-4">
        <div className="rounded-md border bg-card p-4 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[11px] font-semibold text-[var(--text-on-brand)]">1</span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Where should imported posts go?</h2>
              <p className="text-sm text-muted-foreground">Choose whether rows become scheduled posts or queue entries.</p>
            </div>
          </div>
          <RadioGroup value={target} onValueChange={(value) => setTarget(value as 'scheduled' | 'queue')} className="grid gap-3 md:grid-cols-2">
            <Label className={cn('flex cursor-pointer items-start gap-3 rounded-md border bg-[var(--bg-base)] p-4 font-normal transition-colors hover:bg-[var(--bg-hover)]', target === 'scheduled' && 'border-[var(--brand-accent)] bg-[var(--brand-accent-soft)]')}>
              <RadioGroupItem value="scheduled" />
              <span className="space-y-1">
                <span className="block text-sm font-semibold">Scheduled posts</span>
                <span className="block text-sm text-muted-foreground">Each CSV row becomes a scheduled post with its own publish time.</span>
              </span>
            </Label>
            <Label className={cn('flex cursor-pointer items-start gap-3 rounded-md border bg-[var(--bg-base)] p-4 font-normal transition-colors hover:bg-[var(--bg-hover)]', target === 'queue' && 'border-[var(--brand-accent)] bg-[var(--brand-accent-soft)]')}>
              <RadioGroupItem value="queue" />
              <span className="space-y-1">
                <span className="block text-sm font-semibold">Append to a queue</span>
                <span className="block text-sm text-muted-foreground">Each row joins the end of an existing queue, in CSV order.</span>
              </span>
            </Label>
          </RadioGroup>
        </div>

        <div className="rounded-md border bg-card p-4 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[11px] font-semibold text-[var(--text-on-brand)]">2</span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Which profile publishes these posts?</h2>
              <p className="text-sm text-muted-foreground">Queue options are filtered after a profile is selected.</p>
            </div>
          </div>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger><SelectValue placeholder="Select a profile..." /></SelectTrigger>
            <SelectContent>{profiles?.map((profile) => <SelectItem key={profile.id} value={profile.id}>@{profile.handle}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="rounded-md border bg-card p-4 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[11px] font-semibold text-[var(--text-on-brand)]">3</span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Upload your CSV</h2>
              <p className="text-sm text-muted-foreground">Use UTF-8 CSV files up to 10 MB.</p>
            </div>
          </div>
          {target === 'queue' && (
            <div className="mb-4 space-y-2">
              <Label>Add to queue</Label>
              <Select value={queueId} onValueChange={setQueueId}>
                <SelectTrigger><SelectValue placeholder="Select a queue" /></SelectTrigger>
                <SelectContent>{filteredQueues.map((queue) => <SelectItem key={queue.id} value={queue.id}>{queue.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Only queues for the selected profile are shown.</p>
            </div>
          )}
        <FileDropZone
          file={file}
          onFileChange={handleFileChange}
        />
          {file && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-[var(--bg-elevated)] px-3 py-2">
              <Pill tone="success">{validRowCount} rows valid</Pill>
              <Button type="button" variant="ghost" size="sm" onClick={() => handleFileChange(null)}>
                <X size={14} aria-hidden="true" />
                Clear
              </Button>
            </div>
          )}
        {importError && (
          <Alert variant="destructive" role="alert" className="mt-4">
            <AlertTitle>{importError.title}</AlertTitle>
            <AlertDescription>
              <p>{importError.description}</p>
              {importError.details.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {importError.details.map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}
                </ul>
              )}
            </AlertDescription>
            <Button type="button" variant="link" className="mt-2 h-auto p-0 text-destructive" onClick={() => setImportError(null)}>
              Edit CSV and try again
            </Button>
          </Alert>
        )}
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Need a template?</CardTitle>
          <CardDescription>Download the template that matches your target. Tags are semicolon-separated. Spinnable text uses {'{a|b|c}'} syntax verbatim.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Button asChild variant="outline" size="sm">
            <a href={getScheduledTemplateUrl()}>
              <Download size={14} aria-hidden="true" />
              Scheduled template
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={getQueueTemplateUrl()}>
              <Download size={14} aria-hidden="true" />
              Queue template
            </a>
          </Button>
        </CardContent>
      </Card>

      {budgetError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Twitter monthly cap exceeded</AlertTitle>
          <AlertDescription>
            This upload would push you to {projected} tweets this month. Your cap is {budgetError.budget}. Trim {overage} rows or wait until next month.
          </AlertDescription>
          <Button type="button" variant="link" className="mt-2 h-auto p-0 text-destructive" onClick={() => setBudgetError(null)}>
            Edit CSV and try again
          </Button>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link to="/posts">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to posts
          </Link>
        </Button>
        <Button aria-label="Import" onClick={handleSubmit} disabled={!isReady || importMutation.isPending} variant="primary">
          {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {importMutation.isPending ? 'Queuing import...' : `Import ${validRowCount || ''} posts`}
        </Button>
      </div>
      </section>
    </main>
  );
}
