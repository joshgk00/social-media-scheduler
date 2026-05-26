import { describe, it, expect } from 'vitest';
import {
  POST_STATUSES,
  POST_STATE_TRANSITIONS,
  isValidTransition,
  transitionPost,
  EDITABLE_STATES,
  DELETABLE_STATES,
  type PostStatus,
} from '../constants/post-states.js';

describe('post state machine', () => {
  describe('POST_STATE_TRANSITIONS — every valid transition succeeds', () => {
    const allValidTransitions: Array<[PostStatus, PostStatus]> = [];
    for (const from of POST_STATUSES) {
      for (const to of POST_STATE_TRANSITIONS[from]) {
        allValidTransitions.push([from, to]);
      }
    }

    it.each(allValidTransitions)(
      '%s -> %s is a valid transition',
      (from, to) => {
        expect(isValidTransition(from, to)).toBe(true);
        expect(transitionPost(from, to)).toBe(to);
      },
    );
  });

  describe('invalid transitions throw errors', () => {
    it('rejects draft -> published (skips intermediate states)', () => {
      expect(isValidTransition('draft', 'published')).toBe(false);
      expect(() => transitionPost('draft', 'published')).toThrow(/Invalid state transition/);
    });

    it('rejects publishing -> draft (no backwards from publishing)', () => {
      expect(isValidTransition('publishing', 'draft')).toBe(false);
      expect(() => transitionPost('publishing', 'draft')).toThrow(/Invalid state transition/);
    });

    it('rejects published -> scheduled (no backwards from published)', () => {
      expect(isValidTransition('published', 'scheduled')).toBe(false);
      expect(() => transitionPost('published', 'scheduled')).toThrow(/Invalid state transition/);
    });

    it('rejects destroyed -> any state', () => {
      for (const status of POST_STATUSES) {
        expect(isValidTransition('destroyed', status)).toBe(false);
      }
    });

    it('allows queued -> draft (queue removal)', () => {
      expect(isValidTransition('queued', 'draft')).toBe(true);
      expect(transitionPost('queued', 'draft')).toBe('draft');
    });
  });

  describe('same-state transition is rejected', () => {
    it.each(POST_STATUSES.map(s => [s]))(
      '%s -> %s is rejected',
      (status) => {
        expect(isValidTransition(status as PostStatus, status as PostStatus)).toBe(false);
        expect(() => transitionPost(status as PostStatus, status as PostStatus)).toThrow(
          /Invalid state transition/,
        );
      },
    );
  });

  describe('EDITABLE_STATES contains correct values', () => {
    it('includes draft, scheduled, queued, paused, failed', () => {
      expect(EDITABLE_STATES).toContain('draft');
      expect(EDITABLE_STATES).toContain('scheduled');
      expect(EDITABLE_STATES).toContain('queued');
      expect(EDITABLE_STATES).toContain('paused');
      expect(EDITABLE_STATES).toContain('failed');
    });

    it('excludes publishing, published, auto_destructing, destroyed', () => {
      expect(EDITABLE_STATES).not.toContain('publishing');
      expect(EDITABLE_STATES).not.toContain('published');
      expect(EDITABLE_STATES).not.toContain('auto_destructing');
      expect(EDITABLE_STATES).not.toContain('destroyed');
    });

    it('has exactly 5 states', () => {
      expect(EDITABLE_STATES).toHaveLength(5);
    });
  });

  describe('DELETABLE_STATES contains correct values', () => {
    it('includes draft, scheduled, paused, published, failed', () => {
      expect(DELETABLE_STATES).toContain('draft');
      expect(DELETABLE_STATES).toContain('scheduled');
      expect(DELETABLE_STATES).toContain('paused');
      expect(DELETABLE_STATES).toContain('published');
      expect(DELETABLE_STATES).toContain('failed');
    });

    it('excludes queued, publishing, auto_destructing, destroyed', () => {
      expect(DELETABLE_STATES).not.toContain('queued');
      expect(DELETABLE_STATES).not.toContain('publishing');
      expect(DELETABLE_STATES).not.toContain('auto_destructing');
      expect(DELETABLE_STATES).not.toContain('destroyed');
    });

    it('has exactly 5 states', () => {
      expect(DELETABLE_STATES).toHaveLength(5);
    });
  });

  describe('transitionPost error messages are descriptive', () => {
    it('includes both current and target state in error message', () => {
      try {
        transitionPost('publishing', 'draft');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('publishing');
        expect(err.message).toContain('draft');
      }
    });

    it('includes allowed transitions in error message', () => {
      try {
        transitionPost('destroyed', 'draft');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('destroyed');
        expect(err.message).toContain('draft');
        expect(err.message).toContain('Allowed transitions');
      }
    });
  });
});
