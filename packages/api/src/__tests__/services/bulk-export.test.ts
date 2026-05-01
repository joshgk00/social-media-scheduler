import { describe, expect, it } from 'vitest';
import { sanitizeCsvCell } from '../../services/bulk-export.service.js';

describe('bulk CSV export sanitization', () => {
  it.each(['=SUM(A1:A2)', '+SUM(A1:A2)', '-SUM(A1:A2)', '@SUM(A1:A2)', '\t=SUM(A1:A2)', '\r=SUM(A1:A2)'])(
    'prefixes spreadsheet formula-like cells: %s',
    (cellValue) => {
      expect(sanitizeCsvCell(cellValue)).toBe(`'${cellValue}`);
    },
  );

  it('leaves ordinary text and non-string values unchanged', () => {
    expect(sanitizeCsvCell('ordinary text')).toBe('ordinary text');
    expect(sanitizeCsvCell(42)).toBe(42);
    expect(sanitizeCsvCell(null)).toBeNull();
  });
});
