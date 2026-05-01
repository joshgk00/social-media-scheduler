import { describe, expect, it } from 'vitest';
import { postStatusEnum } from '../../schema/posts.js';

describe('post_status enum paused value', () => {
  it('contains paused at the expected order position', () => {
    expect(postStatusEnum.enumValues).toHaveLength(9);
    expect(postStatusEnum.enumValues[3]).toBe('paused');
  });

  it('matches the Phase 10 post status order', () => {
    expect(postStatusEnum.enumValues).toEqual([
      'draft',
      'scheduled',
      'queued',
      'paused',
      'publishing',
      'published',
      'failed',
      'auto_destructing',
      'destroyed',
    ]);
  });
});
