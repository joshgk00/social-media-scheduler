type LocationLike = Pick<Location, 'hostname' | 'port' | 'protocol'>;

export function getAdminQueuesUrl(
  _loc: LocationLike | undefined = typeof location === 'undefined' ? undefined : location,
): string {
  return '/admin/queues';
}
