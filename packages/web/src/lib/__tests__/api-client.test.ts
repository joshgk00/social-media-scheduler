import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api-client.js';

describe('apiClient cache directive contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  function findFetchCall(path: string): [RequestInfo | URL, RequestInit | undefined] | undefined {
    return fetchSpy.mock.calls.find(
      (call: [RequestInfo | URL, RequestInit | undefined]) =>
        typeof call[0] === 'string' && call[0].includes(path),
    );
  }

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({ token: 'csrf-stub' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("get() can opt into cache: 'no-store' for freshness-sensitive reads", async () => {
    await apiClient.get('/api/notifications/unread-count', { cache: 'no-store' });

    const lastCall = fetchSpy.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const init = lastCall![1] as RequestInit;
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('include');
  });

  it("get() does NOT pass cache: 'no-store' by default", async () => {
    await apiClient.get('/api/profiles');

    const getCall = findFetchCall('/api/profiles');
    expect(getCall).toBeDefined();
    const init = getCall![1] as RequestInit;
    expect(init.cache).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it("post() does NOT pass cache: 'no-store' (mutations bypass this directive)", async () => {
    await apiClient.post('/api/notifications/abc/read', {});

    const postCall = findFetchCall('/api/notifications/abc/read');
    expect(postCall).toBeDefined();
    const init = postCall![1] as RequestInit;
    expect(init.cache).toBeUndefined();
  });

  it("patch() does NOT pass cache: 'no-store'", async () => {
    await apiClient.patch('/api/users/me/notification-prefs', { rows: [] });

    const patchCall = findFetchCall('/api/users/me/notification-prefs');
    expect(patchCall).toBeDefined();
    const init = patchCall![1] as RequestInit;
    expect(init.cache).toBeUndefined();
  });

  it("put() does NOT pass cache: 'no-store'", async () => {
    await apiClient.put('/api/posts/abc', { text: 'Updated' });

    const putCall = findFetchCall('/api/posts/abc');
    expect(putCall).toBeDefined();
    const init = putCall![1] as RequestInit;
    expect(init.cache).toBeUndefined();
  });

  it("delete() does NOT pass cache: 'no-store'", async () => {
    await apiClient.delete('/api/posts/abc');

    const deleteCall = findFetchCall('/api/posts/abc');
    expect(deleteCall).toBeDefined();
    const init = deleteCall![1] as RequestInit;
    expect(init.cache).toBeUndefined();
  });
});
