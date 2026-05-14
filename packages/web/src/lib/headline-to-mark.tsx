import * as React from 'react';

export function renderHeadline(headline: string): React.ReactNode[] {
  // ts_headline produces only <b>...</b> markers; everything else is HTML-escaped.
  const parts = headline.split(/(<b>|<\/b>)/g);
  let inMark = false;
  const out: React.ReactNode[] = [];

  parts.forEach((part, index) => {
    if (part === '<b>') {
      inMark = true;
      return;
    }
    if (part === '</b>') {
      inMark = false;
      return;
    }
    if (!part) return;

    const decoded = part
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    out.push(
      inMark
        ? <mark className="bg-warning/30 text-foreground rounded-sm px-1" key={index}>{decoded}</mark>
        : decoded,
    );
  });

  return out;
}
