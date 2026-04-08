import { describe, it } from 'vitest';

describe('profiles routes', () => {
  describe('POST /api/profiles', () => {
    it.todo('returns 201 with profile data on successful credential validation');
    it.todo('returns 422 when Twitter credential validation fails');
    it.todo('returns 401 when not authenticated');
    it.todo('does not include consumer keys or secrets in response body');
    it.todo('does not log consumer keys or secrets');
    it.todo('returns 409 when profile already connected for same Twitter account');
    it.todo('distinguishes invalid credentials from rate-limited and transient failures');
  });

  describe('GET /api/profiles', () => {
    it.todo('returns array of profiles without credential data');
    it.todo('returns 401 when not authenticated');
  });

  describe('DELETE /api/profiles/:id', () => {
    it.todo('returns 200 on successful deletion');
    it.todo('returns 404 when profile not found');
  });
});
