const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateUuidParam(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new ValidationError('Invalid ID format', 400);
  }
  return id;
}
