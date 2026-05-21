import { FileImage, HardDrive, Video } from 'lucide-react';
import { useStorageUsage } from '../../../hooks/use-media';
import { Card } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.floor(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.floor(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMegabytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
}

export function StorageUsageCard() {
  const { data, isLoading, isError } = useStorageUsage();

  const isEmpty = data && data.totalSize === 0 && data.imageCount === 0 && data.videoCount === 0;

  return (
    <div className="space-y-4">
      <Card padded>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Storage usage</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-10 w-32" />
            ) : (
              <p className="mt-2 text-4xl font-semibold text-foreground">{formatMegabytes(data?.totalSize ?? 0)}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">of ∞ (self-hosted, your disk)</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]">
            <HardDrive className="h-7 w-7" aria-hidden="true" />
          </div>
        </div>
      </Card>

      <Card title="Media browser" padded>
        {isLoading && (
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            Couldn't load storage info.
          </p>
        )}

        {data && isEmpty && (
          <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No media uploaded yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Uploaded post images and videos will appear here.
            </p>
          </div>
        )}

        {data && !isEmpty && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div
              className="flex flex-col rounded-md border border-border p-3"
              aria-label={`Images: ${formatBytes(data.imageSize)}, ${data.imageCount} files`}
            >
              <FileImage className="mb-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-2xl font-semibold">{formatBytes(data.imageSize)}</span>
              <span className="text-xs text-muted-foreground">
                Images ({data.imageCount} files)
              </span>
            </div>

            <div
              className="flex flex-col rounded-md border border-border p-3"
              aria-label={`Videos: ${formatBytes(data.videoSize)}, ${data.videoCount} files`}
            >
              <Video className="mb-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-2xl font-semibold">{formatBytes(data.videoSize)}</span>
              <span className="text-xs text-muted-foreground">
                Videos ({data.videoCount} files)
              </span>
            </div>

            <div
              className="flex flex-col rounded-md border border-border p-3"
              aria-label={`Total: ${formatBytes(data.totalSize)}`}
            >
              <HardDrive className="mb-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-2xl font-semibold">{formatBytes(data.totalSize)}</span>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
