import { AppError } from '@sms/shared';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
