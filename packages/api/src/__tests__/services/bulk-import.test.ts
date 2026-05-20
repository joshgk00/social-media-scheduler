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

  it('preserves original row numbers on successfully parsed rows', async () => {
    const csv = Buffer.from('text\nok\nlater\n', 'utf8');

    const result = await parseCsvBuffer(csv, z.object({ text: z.string().min(1) }).strict());

    expect(result.rows).toEqual([
      { rowNumber: 2, text: 'ok' },
      { rowNumber: 3, text: 'later' },
    ]);
  });

  it('collects row-level schema errors instead of throwing', async () => {
    const csv = Buffer.from('text,scheduled_at\nhello,not-a-date\n', 'utf8');

    const result = await parseCsvBuffer(csv, z.object({
      text: z.string().min(1),
      scheduled_at: z.string().datetime({ offset: true }),
    }).strict());

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      {
        rowNumber: 2,
        reason: 'scheduled_at: Invalid datetime',
        row: { text: 'hello', scheduled_at: 'not-a-date' },
      },
    ]);
  });

  it('rejects non-UUID bulk operation ids for error reports', async () => {
    await expect(writeErrorReport('/tmp', '../escape', [
      { rowNumber: 2, reason: '=boom', row: { text: '=boom' } },
    ])).rejects.toThrow('Invalid bulk operation id');
  });
});
