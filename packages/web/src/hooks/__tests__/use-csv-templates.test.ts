import { describe, expect, it } from 'vitest';
import { getQueueTemplateUrl, getScheduledTemplateUrl } from '../use-csv-templates';
import queueTemplate from '../../../public/templates/queue-posts.csv?raw';
import scheduledTemplate from '../../../public/templates/scheduled-posts.csv?raw';

const templatesByUrl: Record<string, string> = {
  '/templates/queue-posts.csv': queueTemplate,
  '/templates/scheduled-posts.csv': scheduledTemplate,
};

describe('CSV template downloads', () => {
  it('serves a scheduled-post template with import headers and a sample row', () => {
    const csv = templatesByUrl[getScheduledTemplateUrl()];
    const rows = csv.trim().split('\n');

    expect(rows[0]).toBe('text,scheduled_at,tags,spinnable,auto_destruct_after,recycle,notes');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('2026-06-01T14:00:00Z');
  });

  it('serves a queue template with import headers and a sample row', () => {
    const csv = templatesByUrl[getQueueTemplateUrl()];
    const rows = csv.trim().split('\n');

    expect(rows[0]).toBe('text,queue_name,position,tags,spinnable,auto_destruct_after,notes');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('Example Queue');
  });
});
