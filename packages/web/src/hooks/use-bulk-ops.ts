import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  bulkDeleteInputSchema,
  bulkModifyTagsInputSchema,
  bulkPauseInputSchema,
  queueCopyInputSchema,
  queuePurgeInputSchema,
  queueTextModifyInputSchema,
} from '@sms/shared';
import { apiClient } from '../lib/api-client';
import { announceBulkOperation } from '../lib/bulk-operation-live-region';

type BulkPauseInput = z.infer<typeof bulkPauseInputSchema>;
type BulkDeleteInput = z.infer<typeof bulkDeleteInputSchema>;
type BulkModifyTagsInput = z.infer<typeof bulkModifyTagsInputSchema>;
type QueuePurgeInput = z.infer<typeof queuePurgeInputSchema>;
type QueueCopyInput = z.infer<typeof queueCopyInputSchema>;
type QueueTextModifyInput = z.infer<typeof queueTextModifyInputSchema>;

function useInvalidateBulk() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    queryClient.invalidateQueries({ queryKey: ['queues'] });
  };
}

function showBulkOperationError(error: Error): void {
  const message = error.message || "Couldn't start the bulk operation. Try again.";
  announceBulkOperation(message);
  toast.error(message);
}

function announceBulkOperationQueued(): void {
  announceBulkOperation('Bulk operation queued.');
}

export function useBulkPause() {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (input: BulkPauseInput) => apiClient.post('/api/posts/bulk-pause', input), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useBulkResume() {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (input: BulkPauseInput) => apiClient.post('/api/posts/bulk-resume', input), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useBulkDelete() {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (input: BulkDeleteInput) => apiClient.post('/api/posts/bulk-delete', input), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useBulkModifyTags() {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (input: BulkModifyTagsInput) => apiClient.post('/api/posts/bulk-modify-tags', input), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useBulkExport() {
  return useMutation({ mutationFn: ({ path, filename }: { path: string; filename: string }) => apiClient.downloadCsv(path, filename) });
}

export function useQueueRandomize(queueId: string) {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: () => apiClient.post(`/api/queues/${queueId}/randomize`, {}), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useQueuePurge(queueId: string) {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (input: QueuePurgeInput) => apiClient.post(`/api/queues/${queueId}/purge`, input), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useQueueCopy(queueId: string) {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (input: QueueCopyInput) => apiClient.post(`/api/queues/${queueId}/copy`, input), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useQueueModifyText(queueId: string) {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (input: QueueTextModifyInput) => apiClient.post(`/api/queues/${queueId}/modify-text`, input), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useQueueDedupe(queueId: string) {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: () => apiClient.post(`/api/queues/${queueId}/dedupe`, {}), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}

export function useBulkImport() {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (formData: FormData) => apiClient.uploadCsv('/api/bulk-import', formData), onSuccess: () => { invalidate(); announceBulkOperationQueued(); }, onError: showBulkOperationError });
}
