import { vi } from 'vitest';
import type { SentMessageInfo, Transporter } from 'nodemailer';

interface MockTransporterOptions {
  acceptOnce?: SentMessageInfo;
  rejectWith?: Error;
}

export function createMockTransporter({
  acceptOnce,
  rejectWith,
}: MockTransporterOptions = {}): Transporter {
  const sendMail = vi.fn().mockImplementation(async () => {
    if (rejectWith) {
      throw rejectWith;
    }

    return acceptOnce ?? { messageId: 'mock-message-id' };
  });

  return { sendMail } as unknown as Transporter;
}
