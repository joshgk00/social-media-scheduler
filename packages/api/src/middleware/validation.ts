import { AppError } from '@sms/shared';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Subclass exists so structured logs show 'ValidationError' instead of 'AppError'.
// All behavior comes from AppError; the subclass adds no fields or methods.
export class ValidationError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

export function validateUuidParam(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new ValidationError('Invalid ID format', 400);
  }
  return id;
}
