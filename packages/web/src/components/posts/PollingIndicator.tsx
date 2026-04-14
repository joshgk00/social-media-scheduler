import { useEffect, useState } from 'react';

interface PollingIndicatorProps {
  dataUpdatedAt: number;
}

export function PollingIndicator({ dataUpdatedAt }: PollingIndicatorProps) {
  const [secondsAgo, setSecondsAgo] = useState(() => computeSecondsAgo(dataUpdatedAt));

  useEffect(() => {
    setSecondsAgo(computeSecondsAgo(dataUpdatedAt));
    const intervalId = window.setInterval(() => {
      setSecondsAgo(computeSecondsAgo(dataUpdatedAt));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [dataUpdatedAt]);

  if (!dataUpdatedAt) return null;

  return (
    <span className="text-xs text-muted-foreground">
      Updated {secondsAgo}s ago
    </span>
  );
}

function computeSecondsAgo(dataUpdatedAt: number): number {
  if (!dataUpdatedAt) return 0;
  return Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
}
