import type { Response } from 'express';
import { stringify } from 'csv-stringify';

const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return CSV_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
}

function sanitizeCsvRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([columnName, cellValue]) => [columnName, sanitizeCsvCell(cellValue)]),
  );
}

export function beginCsvDownload(res: Response, filename: string): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

export async function writeCsvRows(
  res: Response,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const stringifier = stringify({ header: true, columns });
  await new Promise<void>((resolve, reject) => {
    stringifier.on('error', (err) => {
      res.destroy(err);
      reject(err);
    });
    res.on('error', reject);
    res.on('finish', resolve);

    stringifier.pipe(res);
    for (const row of rows) {
      stringifier.write(sanitizeCsvRow(row));
    }
    stringifier.end();
  });
}
