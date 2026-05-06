import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SNIPPET_INPUT_LENGTH,
  substituteSnippetsInText,
} from '../snippet-tokens.js';

describe('substituteSnippetsInText', () => {
  it('returns an empty result for empty input', () => {
    const resolver = vi.fn<(name: string) => string | undefined>();

    expect(substituteSnippetsInText('', resolver)).toEqual({
      result: '',
      missing: [],
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('returns the original text when no snippet token is present', () => {
    const resolver = vi.fn<(name: string) => string | undefined>();

    expect(substituteSnippetsInText('No tokens here.', resolver)).toEqual({
      result: 'No tokens here.',
      missing: [],
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('substitutes a known snippet token', () => {
    const resolver = vi.fn<(name: string) => string | undefined>((name) =>
      name === 'foo' ? '#tag1 #tag2' : undefined,
    );

    expect(
      substituteSnippetsInText('Hello {{snippet:foo}} world', resolver),
    ).toEqual({
      result: 'Hello #tag1 #tag2 world',
      missing: [],
    });
    expect(resolver).toHaveBeenCalledWith('foo');
  });

  it('preserves a missing snippet token and reports its name', () => {
    const resolver = vi.fn<(name: string) => string | undefined>();

    expect(substituteSnippetsInText('A {{snippet:bar}} B', resolver)).toEqual({
      result: 'A {{snippet:bar}} B',
      missing: ['bar'],
    });
    expect(resolver).toHaveBeenCalledWith('bar');
  });

  it('normalizes snippet names before resolving them', () => {
    const resolver = vi.fn<(name: string) => string | undefined>((name) =>
      name === 'foo' ? 'resolved' : undefined,
    );

    expect(substituteSnippetsInText('{{snippet:  Foo  }}', resolver)).toEqual({
      result: 'resolved',
      missing: [],
    });
    expect(resolver).toHaveBeenCalledWith('foo');
  });

  it('handles multiple tokens with mixed hit and miss results', () => {
    const resolver = vi.fn<(name: string) => string | undefined>((name) => {
      if (name === 'first') return 'ONE';
      if (name === 'third') return 'THREE';
      return undefined;
    });

    expect(
      substituteSnippetsInText(
        '{{snippet:first}} + {{snippet:second}} + {{snippet:third}}',
        resolver,
      ),
    ).toEqual({
      result: 'ONE + {{snippet:second}} + THREE',
      missing: ['second'],
    });
    expect(resolver).toHaveBeenNthCalledWith(1, 'first');
    expect(resolver).toHaveBeenNthCalledWith(2, 'second');
    expect(resolver).toHaveBeenNthCalledWith(3, 'third');
  });

  it('does not match malformed or unsupported token content', () => {
    const resolver = vi.fn<(name: string) => string | undefined>();
    const input = 'Bad {{snippet:foo/bar}} and nested {{snippet:foo{{bar}}}} tokens';

    expect(substituteSnippetsInText(input, resolver)).toEqual({
      result: input,
      missing: [],
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('short-circuits oversized input before applying the regex', () => {
    const resolver = vi.fn<(name: string) => string | undefined>();
    const input = `x${'a'.repeat(MAX_SNIPPET_INPUT_LENGTH)}`;

    expect(substituteSnippetsInText(input, resolver)).toEqual({
      result: input,
      missing: [],
    });
    expect(resolver).not.toHaveBeenCalled();
  });
});
