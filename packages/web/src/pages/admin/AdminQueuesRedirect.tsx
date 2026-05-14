import { useEffect } from 'react';
import { getAdminQueuesUrl } from '@/lib/admin-queues-url';

export default function AdminQueuesRedirect() {
  useEffect(() => {
    window.location.assign(getAdminQueuesUrl());
  }, []);

  return (
    <main className="flex min-h-[240px] items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Opening admin queues...</p>
    </main>
  );
}
