export function getAdminQueuesUrl(locationLike: Pick<Location, 'hostname' | 'origin' | 'port'> = window.location): string {
  const isViteDevServer =
    (locationLike.hostname === '127.0.0.1' || locationLike.hostname === 'localhost') &&
    locationLike.port === '5173';

  if (isViteDevServer) {
    return `${locationLike.origin.replace(/:5173$/, ':8080')}/admin/queues`;
  }

  return '/admin/queues';
}
