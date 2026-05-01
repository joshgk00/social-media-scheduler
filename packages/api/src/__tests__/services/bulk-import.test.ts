import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseCsvBuffer, writeErrorReport } from '../../services/bulk-import.service.js';

describe('bulk CSV import service', () => {
  it('rejects CSV files above the configured row cap', async () => {
    const csv = Buffer.from('text\none\ntwo\n', 'utf8');

    await expect(parseCsvBuffer(csv, z.object({ text: z.string() }).strict(), 1))
      .rejects
      .toThrow('CSV row limit exceeded');
  });

  it('rejects non-UUID bulk operation ids for error reports', async () => {
    await expect(writeErrorReport('/tmp', '../escape', [
      { rowNumber: 2, reason: '=boom', row: { text: '=boom' } },
    ])).rejects.toThrow('Invalid bulk operation id');
  });
});
