import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  transitionPost,
  EDITABLE_STATES,
  DELETABLE_STATES,
  POST_STATUSES,
  type PostStatus,
} from '@sms/shared';

describe('post state machine', () => {
  describe('isValidTransition', () => {
    it('allows draft -> scheduled', () => {
      expect(isValidTransition('draft', 'scheduled')).toBe(true);
    });

    it('allows draft -> publishing', () => {
      expect(isValidTransition('draft', 'publishing')).toBe(true);
    });

    it('allows scheduled -> draft', () => {
      expect(isValidTransition('scheduled', 'draft')).toBe(true);
    });

    it('allows scheduled -> queued', () => {
      expect(isValidTransition('scheduled', 'queued')).toBe(true);
    });

    it('allows scheduled -> publishing', () => {
      expect(isValidTransition('scheduled', 'publishing')).toBe(true);
    });

    it('allows queued -> publishing', () => {
      expect(isValidTransition('queued', 'publishing')).toBe(true);
    });

    it('allows publishing -> published', () => {
      expect(isValidTransition('publishing', 'published')).toBe(true);
    });

    it('allows publishing -> failed', () => {
      expect(isValidTransition('publishing', 'failed')).toBe(true);
    });

    it('allows published -> auto_destructing', () => {
      expect(isValidTransition('published', 'auto_destructing')).toBe(true);
    });

    it('allows failed -> draft', () => {
      expect(isValidTransition('failed', 'draft')).toBe(true);
    });

    it('allows failed -> scheduled', () => {
      expect(isValidTransition('failed', 'scheduled')).toBe(true);
    });

    it('allows auto_destructing -> destroyed', () => {
      expect(isValidTransition('auto_destructing', 'destroyed')).toBe(true);
    });

    it('rejects destroyed -> any state', () => {
      for (const status of POST_STATUSES) {
        expect(isValidTransition('destroyed', status)).toBe(false);
      }
    });

    it('rejects publishing -> draft (no backwards from publishing)', () => {
      expect(isValidTransition('publishing', 'draft')).toBe(false);
    });

    it('rejects published -> scheduled (no backwards from published)', () => {
      expect(isValidTransition('published', 'scheduled')).toBe(false);
    });
  });

  describe('transitionPost (shared helper)', () => {
    it('returns new status when transition is valid', () => {
      expect(transitionPost('draft', 'scheduled')).toBe('scheduled');
      expect(transitionPost('publishing', 'published')).toBe('published');
      expect(transitionPost('failed', 'draft')).toBe('draft');
    });

    it('throws descriptive error when transition is invalid', () => {
      expect(() => transitionPost('publishing', 'draft')).toThrow(
        /Invalid state transition.*publishing.*draft/
      );
      expect(() => transitionPost('destroyed', 'draft')).toThrow(
        /Invalid state transition.*destroyed.*draft/
      );
    });

    it('is importable from @sms/shared for use by both API and worker', () => {
      expect(typeof transitionPost).toBe('function');
    });
  });

  describe('EDITABLE_STATES', () => {
    it('includes draft, scheduled, failed', () => {
      expect(EDITABLE_STATES).toContain('draft');
      expect(EDITABLE_STATES).toContain('scheduled');
      expect(EDITABLE_STATES).toContain('failed');
    });

    it('excludes publishing, published, auto_destructing, destroyed', () => {
      expect(EDITABLE_STATES).not.toContain('publishing');
      expect(EDITABLE_STATES).not.toContain('published');
      expect(EDITABLE_STATES).not.toContain('auto_destructing');
      expect(EDITABLE_STATES).not.toContain('destroyed');
    });
  });

  describe('DELETABLE_STATES', () => {
    it('includes draft, scheduled, published, failed', () => {
      expect(DELETABLE_STATES).toContain('draft');
      expect(DELETABLE_STATES).toContain('scheduled');
      expect(DELETABLE_STATES).toContain('published');
      expect(DELETABLE_STATES).toContain('failed');
    });

    it('excludes publishing, auto_destructing, destroyed', () => {
      expect(DELETABLE_STATES).not.toContain('publishing');
      expect(DELETABLE_STATES).not.toContain('auto_destructing');
      expect(DELETABLE_STATES).not.toContain('destroyed');
    });
  });
});
