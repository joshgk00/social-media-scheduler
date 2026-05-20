import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Loader2 } from 'lucide-react';
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

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Import Posts</h1>
        <p className="text-sm text-muted-foreground">Upload a CSV to create scheduled posts or add posts to an existing queue.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">1. Target</h2>
          <p className="text-sm text-muted-foreground">Where should imported posts go?</p>
        </div>
        <RadioGroup value={target} onValueChange={(value) => setTarget(value as 'scheduled' | 'queue')} className="grid gap-3 md:grid-cols-2">
          <Label className={cn('flex items-start gap-3 rounded-md border p-4 font-normal', target === 'scheduled' && 'border-2 border-primary')}>
            <RadioGroupItem value="scheduled" />
            <span className="space-y-1">
              <span className="block text-sm font-semibold">Scheduled posts</span>
              <span className="block text-sm text-muted-foreground">Each row becomes a scheduled post with its own publish time.</span>
            </span>
          </Label>
          <Label className={cn('flex items-start gap-3 rounded-md border p-4 font-normal', target === 'queue' && 'border-2 border-primary')}>
            <RadioGroupItem value="queue" />
            <span className="space-y-1">
              <span className="block text-sm font-semibold">Queue</span>
              <span className="block text-sm text-muted-foreground">Each row joins the end of an existing queue, in CSV order.</span>
            </span>
          </Label>
        </RadioGroup>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">2. Profile</h2>
          <p className="text-sm text-muted-foreground">Which connected profile publishes these posts?</p>
        </div>
        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger className="max-w-md"><SelectValue placeholder="Select a profile" /></SelectTrigger>
          <SelectContent>{profiles?.map((profile) => <SelectItem key={profile.id} value={profile.id}>@{profile.handle}</SelectItem>)}</SelectContent>
        </Select>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{target === 'queue' ? '3. Queue & file' : '3. File'}</h2>
        {target === 'queue' && (
          <div className="max-w-md space-y-2">
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
          onFileChange={(nextFile) => {
            setFile(nextFile);
            setBudgetError(null);
            setImportError(null);
          }}
        />
        {importError && (
          <Alert variant="destructive" role="alert">
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
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Need a template?</CardTitle>
          <CardDescription>Download the template that matches your target. Tags are semicolon-separated. Spinnable text uses {'{a|b|c}'} syntax verbatim.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <a className="text-primary underline-offset-4 hover:underline" href={getScheduledTemplateUrl()}>Download Scheduled Template</a>
          <a className="text-primary underline-offset-4 hover:underline" href={getQueueTemplateUrl()}>Download Queue Template</a>
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

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline"><Link to="/posts">Don't Import</Link></Button>
        <Button onClick={handleSubmit} disabled={!isReady || importMutation.isPending}>
          {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {importMutation.isPending ? 'Queuing import...' : 'Import'}
        </Button>
      </div>
    </main>
  );
}
