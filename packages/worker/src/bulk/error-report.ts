import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BulkCsvRowError {
  rowNumber: number;
  reason: string;
  row: Record<string, unknown>;
}

function sanitizeCsvCell(value: string): string {
  return CSV_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function isBulkCsvRowError(value: unknown): value is BulkCsvRowError {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.rowNumber === 'number' &&
    typeof candidate.reason === 'string' &&
    !!candidate.row &&
    typeof candidate.row === 'object' &&
    !Array.isArray(candidate.row)
  );
}

export async function writeBulkErrorReport(
  storageRoot: string,
  jobId: string,
  errors: BulkCsvRowError[],
): Promise<string | null> {
  if (errors.length === 0) {
    return null;
  }

  if (!UUID_PATTERN.test(jobId)) {
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
  const csvRows = [
    'row_number,reason,row',
    ...errors.map((error) =>
      [
        escapeCsvCell(String(error.rowNumber)),
        escapeCsvCell(sanitizeCsvCell(error.reason)),
        escapeCsvCell(sanitizeCsvCell(JSON.stringify(error.row))),
      ].join(',')),
  ];

  await writeFile(reportPath, `${csvRows.join('\n')}\n`, 'utf8');
  return reportPath;
}
