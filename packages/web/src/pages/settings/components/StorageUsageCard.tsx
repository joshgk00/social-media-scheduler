import { HardDrive } from 'lucide-react';
import { useStorageUsage } from '../../../hooks/use-media';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.floor(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.floor(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function StorageUsageCard() {
  const { data, isLoading, isError } = useStorageUsage();

  const isEmpty = data && data.totalSize === 0 && data.imageCount === 0 && data.videoCount === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <HardDrive className="h-5 w-5" />
          Storage Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
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
          <p className="text-center text-sm text-muted-foreground">
            No media uploaded yet.
          </p>
        )}

        {data && !isEmpty && (
          <div className="grid grid-cols-3 gap-4">
            <div
              className="flex flex-col"
              aria-label={`Images: ${formatBytes(data.imageSize)}, ${data.imageCount} files`}
            >
              <span className="text-2xl font-semibold">{formatBytes(data.imageSize)}</span>
              <span className="text-xs text-muted-foreground">
                Images ({data.imageCount} files)
              </span>
            </div>

            <div
              className="flex flex-col"
              aria-label={`Videos: ${formatBytes(data.videoSize)}, ${data.videoCount} files`}
            >
              <span className="text-2xl font-semibold">{formatBytes(data.videoSize)}</span>
              <span className="text-xs text-muted-foreground">
                Videos ({data.videoCount} files)
              </span>
            </div>

            <div
              className="flex flex-col"
              aria-label={`Total: ${formatBytes(data.totalSize)}`}
            >
              <span className="text-2xl font-semibold">{formatBytes(data.totalSize)}</span>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
