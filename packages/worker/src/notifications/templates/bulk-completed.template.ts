import { renderEmailShell } from './email-shell.js';
import type { RenderedNotificationEmail } from './types.js';

export interface BulkCompletedEmailPayload {
  operationLabel: string;
  successCount: number;
  failureCount: number;
  errorReportUrl: string | null;
}

export function renderBulkCompletedEmail(
  payload: BulkCompletedEmailPayload,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const subject = `[SMS] ${payload.operationLabel} complete`;
  const textLines = [
    `${payload.operationLabel} finished.`,
    '',
    `Succeeded: ${payload.successCount}`,
    `Failed: ${payload.failureCount}`,
  ];
  if (payload.errorReportUrl) textLines.push('', `Error report: ${payload.errorReportUrl}`);
  const html = renderEmailShell({
    appBaseUrl,
    heading: `${payload.operationLabel} complete`,
    bodyParagraphs: [
      `Succeeded: ${payload.successCount}`,
      `Failed: ${payload.failureCount}`,
    ],
    cta: payload.errorReportUrl ? { url: payload.errorReportUrl, label: 'Open error report' } : undefined,
  });
  return { subject, text: textLines.join('\n'), html };
}
