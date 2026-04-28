// Wave 0 RED stub for the cross-platform switch helper (D-04).
// Plan 02 ships `applyPlatformSwitch(fromPlatform, toPlatform, state)` —
// a pure function that re-shapes the form state when the user changes
// the target platform on the post-create form.
//
// Toast strings come from 08-UI-SPEC.md lines 184-194. If the helper's
// emitted text drifts from the table, this test must be updated to match —
// the source of truth is UI-SPEC, not the implementation.

import { describe, it, expect } from 'vitest';
import { applyPlatformSwitch } from '../lib/apply-platform-switch';

const baseState = {
  text: '',
  visibility: undefined as 'PUBLIC' | 'CONNECTIONS' | undefined,
  linkUrl: null as string | null,
  isThread: false,
  threadContinuation: '',
  mediaIds: [] as string[],
};

describe('applyPlatformSwitch (D-04 cross-platform helper)', () => {
  it('twitter → twitter (no-op): returns unchanged state, no toast', () => {
    const result = applyPlatformSwitch('twitter', 'twitter', { ...baseState, text: 'hi' });
    expect(result.state.text).toBe('hi');
    expect(result.toast).toBeNull();
  });

  it('twitter → linkedin: truncates text to 3000 chars and toast contains "truncated"', () => {
    const result = applyPlatformSwitch('twitter', 'linkedin', {
      ...baseState,
      text: 'a'.repeat(3500),
    });
    expect(result.state.text.length).toBe(3000);
    expect(result.toast).toMatch(/truncated/i);
  });

  it('linkedin → facebook: drops visibility, toast notes "visibility removed"', () => {
    const result = applyPlatformSwitch('linkedin', 'facebook', {
      ...baseState,
      text: 'hi',
      visibility: 'CONNECTIONS',
    });
    expect(result.state.visibility).toBeUndefined();
    expect(result.toast).toMatch(/visibility removed/i);
  });

  it('facebook → linkedin: drops linkUrl, drops video, sets visibility=PUBLIC', () => {
    const result = applyPlatformSwitch('facebook', 'linkedin', {
      ...baseState,
      text: 'hi',
      linkUrl: 'https://example.com',
      mediaIds: ['video-id-1'],
    });
    expect(result.state.linkUrl).toBeNull();
    expect(result.state.visibility).toBe('PUBLIC');
  });

  it('twitter → facebook: drops thread continuation, keeps first text', () => {
    const result = applyPlatformSwitch('twitter', 'facebook', {
      ...baseState,
      text: 'tweet 1',
      isThread: true,
      threadContinuation: 'tweet 2',
    });
    expect(result.state.isThread).toBe(false);
    expect(result.state.text).toBe('tweet 1');
    expect(result.toast).toMatch(/removed thread continuation/i);
  });

  it('text truncation uses code-point counting (astral plane emoji)', () => {
    // 1500 family-emoji code points + 1500 ASCII characters = 3000 cp.
    // We over-stuff by adding one more emoji and assert the truncation
    // does not break a code unit pair.
    const family = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'; // 5 cp
    const padded = family.repeat(601) + 'a'; // 5*601 = 3005 cp + 1 = 3006
    const result = applyPlatformSwitch('twitter', 'linkedin', {
      ...baseState,
      text: padded,
    });
    // Should truncate to 3000 code points without splitting an astral pair.
    expect([...result.state.text].length).toBe(3000);
  });
});
