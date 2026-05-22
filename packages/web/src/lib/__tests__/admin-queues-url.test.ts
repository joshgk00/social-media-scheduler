import { describe, expect, it } from 'vitest';
import { getAdminQueuesUrl } from '../admin-queues-url';

describe('getAdminQueuesUrl', () => {
  it('uses the same-origin admin proxy when running from the Vite dev server', () => {
    expect(getAdminQueuesUrl(new URL('http://localhost:5173/dashboard'))).toBe(
      '/admin/queues',
    );
  });

  it('uses a relative path outside direct Vite dev server origins', () => {
    expect(getAdminQueuesUrl(new URL('http://localhost:8080/dashboard'))).toBe(
      '/admin/queues',
    );
  });

  it('does not rewrite other 517x localhost ports', () => {
    expect(getAdminQueuesUrl(new URL('http://localhost:5174/dashboard'))).toBe(
      '/admin/queues',
    );
  });
});
