import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify/sync';
import { MAX_BULK_CSV_ROWS } from '@sms/shared';
import type { z, ZodType } from 'zod';
import { sanitizeCsvCell } from './bulk-export.service.js';

export interface CsvRowError {
  rowNumber: number;
  reason: string;
  row: Record<string, unknown>;
}

export interface ParsedCsvRows<T> {
  rows: Array<T & { rowNumber: number }>;
  errors: CsvRowError[];
}

export async function parseCsvBuffer<TSchema extends ZodType<Record<string, unknown>>>(
  buffer: Buffer,
  schema: TSchema,
  maxRows = MAX_BULK_CSV_ROWS,
): Promise<ParsedCsvRows<z.infer<TSchema>>> {
  const rows: Array<z.infer<TSchema> & { rowNumber: number }> = [];
  const errors: CsvRowError[] = [];
  const parser = parse(buffer, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let rowNumber = 1;
  for await (const rawRow of parser as AsyncIterable<Record<string, unknown>>) {
    rowNumber += 1;
    if (rows.length + errors.length >= maxRows) {
      throw new Error(`CSV row limit exceeded: maximum ${maxRows} rows`);
    }
    const parsed = schema.safeParse(rawRow);
    if (parsed.success) {
      rows.push({ ...parsed.data, rowNumber });
      continue;
    }

    errors.push({
      rowNumber,
      reason: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      row: rawRow,
    });
  }

  return { rows, errors };
}

export async function writeErrorReport(
  storageRoot: string,
  jobId: string,
  errors: CsvRowError[],
): Promise<string | null> {
  if (errors.length === 0) {
    return null;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('Invalid bulk operation id for error report path');
  }

  const resolvedRoot = path.resolve(storageRoot);
  const reportDir = path.resolve(resolvedRoot, 'bulk-errors', jobId);
  const resolvedRootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (!reportDir.startsWith(resolvedRootPrefix)) {
    throw new Error('Resolved bulk error report path escapes storage root');
  }

  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'errors.csv');
  const csv = stringify(
    errors.map((error) => ({
      row_number: error.rowNumber,
      reason: sanitizeCsvCell(error.reason),
      row: sanitizeCsvCell(JSON.stringify(error.row)),
    })),
    { header: true },
  );
  await writeFile(reportPath, csv, 'utf8');
  return reportPath;
}
