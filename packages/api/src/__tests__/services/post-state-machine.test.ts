import { describe, it } from 'vitest';

describe('post state machine', () => {
  describe('isValidTransition', () => {
    it.todo('allows draft -> scheduled');
    it.todo('allows draft -> publishing');
    it.todo('allows scheduled -> draft');
    it.todo('allows scheduled -> queued');
    it.todo('allows scheduled -> publishing');
    it.todo('allows queued -> publishing');
    it.todo('allows publishing -> published');
    it.todo('allows publishing -> failed');
    it.todo('allows published -> auto_destructing');
    it.todo('allows failed -> draft');
    it.todo('allows failed -> scheduled');
    it.todo('allows auto_destructing -> destroyed');
    it.todo('rejects destroyed -> any state');
    it.todo('rejects publishing -> draft (no backwards from publishing)');
    it.todo('rejects published -> scheduled (no backwards from published)');
  });

  describe('transitionPost (shared helper)', () => {
    it.todo('returns new status when transition is valid');
    it.todo('throws descriptive error when transition is invalid');
    it.todo('is importable from @sms/shared for use by both API and worker');
  });

  describe('EDITABLE_STATES', () => {
    it.todo('includes draft, scheduled, failed');
    it.todo('excludes publishing, published, auto_destructing, destroyed');
  });

  describe('DELETABLE_STATES', () => {
    it.todo('includes draft, scheduled, published, failed');
    it.todo('excludes publishing, auto_destructing, destroyed');
  });
});
