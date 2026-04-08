let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch('/api/auth/csrf-token', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch CSRF token');
  const data = await res.json();
  const token: string = data.token;
  csrfToken = token;
  return token;
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  return fetchCsrfToken();
}

function createError(message: string, status: number, body: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { status, body });
}

async function parseErrorBody(res: Response): Promise<Record<string, unknown>> {
  return res.json().catch(() => ({}));
}

function isCsrfError(status: number, body: Record<string, unknown>): boolean {
  if (status !== 403) return false;
  const msg = ((body.error as string) ?? '').toLowerCase();
  return msg.includes('csrf') || msg.includes('token');
}

async function mutationRequest<T>(method: string, path: string, data?: unknown): Promise<T> {
  const token = await getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-csrf-token': token,
  };

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  if (res.status === 403) {
    const body = await parseErrorBody(res);
    if (isCsrfError(res.status, body)) {
      csrfToken = null;
      const newToken = await getCsrfToken();
      const retryRes = await fetch(path, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': newToken },
        body: data ? JSON.stringify(data) : undefined,
      });
      if (!retryRes.ok) {
        const retryBody = await parseErrorBody(retryRes);
        throw createError((retryBody.error as string) || retryRes.statusText, retryRes.status, retryBody);
      }
      return retryRes.json();
    }
    throw createError((body.error as string) || res.statusText, res.status, body);
  }

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw createError((body.error as string) || res.statusText, res.status, body);
  }
  return res.json();
}

export const apiClient = {
  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) {
      const body = await parseErrorBody(res);
      throw createError((body.error as string) || res.statusText, res.status, body);
    }
    return res.json();
  },

  async post<T = unknown>(path: string, data?: unknown): Promise<T> {
    return mutationRequest<T>('POST', path, data);
  },

  async put<T = unknown>(path: string, data?: unknown): Promise<T> {
    return mutationRequest<T>('PUT', path, data);
  },

  async delete<T = unknown>(path: string): Promise<T> {
    return mutationRequest<T>('DELETE', path);
  },

  async postFormData<T = unknown>(path: string, formData: FormData): Promise<T> {
    const token = await getCsrfToken();
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-csrf-token': token },
      body: formData,
    });
    if (res.status === 403) {
      const body = await parseErrorBody(res);
      if (isCsrfError(res.status, body)) {
        csrfToken = null;
        const newToken = await getCsrfToken();
        const retryRes = await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'x-csrf-token': newToken },
          body: formData,
        });
        if (!retryRes.ok) {
          const retryBody = await parseErrorBody(retryRes);
          throw createError((retryBody.error as string) || retryRes.statusText, retryRes.status, retryBody);
        }
        return retryRes.json();
      }
      throw createError((body.error as string) || res.statusText, res.status, body);
    }
    if (!res.ok) {
      const body = await parseErrorBody(res);
      throw createError((body.error as string) || res.statusText, res.status, body);
    }
    return res.json();
  },
};
