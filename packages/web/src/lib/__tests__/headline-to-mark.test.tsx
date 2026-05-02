import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHeadline } from '../headline-to-mark';

function serializeHeadline(headline: string): string[] {
  return renderHeadline(headline).map((node) => {
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object' && 'type' in node && node.type === 'mark') {
      return `mark:${String(node.props.children)}`;
    }
    return String(node);
  });
}

describe('renderHeadline', () => {
  it('returns an empty array for empty input', () => {
    expect(renderHeadline('')).toEqual([]);
  });

  it('returns plain text when no markers exist', () => {
    expect(renderHeadline('plain text no markers')).toEqual(['plain text no markers']);
  });

  it('maps a single bold segment to a mark node', () => {
    expect(serializeHeadline('<b>match</b> rest')).toEqual(['mark:match', ' rest']);
  });

  it('maps multiple bold segments to mark nodes', () => {
    expect(serializeHeadline('a <b>b</b> c <b>d</b> e')).toEqual([
      'a ',
      'mark:b',
      ' c ',
      'mark:d',
      ' e',
    ]);
  });

  it('decodes headline entities', () => {
    expect(renderHeadline('&amp; &lt; &gt; &quot; &#39;')).toEqual(['& < > " \'']);
  });

  it('treats unclosed bold markers as marked text without throwing', () => {
    expect(serializeHeadline('<b>unclosed')).toEqual(['mark:unclosed']);
  });

  it('renders script content as escaped text instead of injected DOM', () => {
    render(<div>{renderHeadline('<script>alert(1)</script>')}</div>);

    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
