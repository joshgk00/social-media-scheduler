export const BULK_OPERATION_LIVE_REGION_ID = 'bulk-operation-live-region';

export function announceBulkOperation(message: string): void {
  const liveRegion = document.getElementById(BULK_OPERATION_LIVE_REGION_ID);
  if (!liveRegion) return;

  liveRegion.textContent = '';
  window.setTimeout(() => {
    liveRegion.textContent = message;
  }, 0);
}
