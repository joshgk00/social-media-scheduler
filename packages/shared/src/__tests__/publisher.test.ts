import { describe, expect, it } from 'vitest';
import { PublishFailure } from '../publisher.js';

describe('PublishFailure', () => {
  it('captures permanent failure details', () => {
    const failure = new PublishFailure({
      kind: 'permanent',
      errorCode: 'invalid_media',
      message: 'media is not accepted by the platform',
      httpStatus: 400,
    });

    expect(failure).toBeInstanceOf(PublishFailure);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe('PublishFailure');
    expect(failure.message).toBe('media is not accepted by the platform');
    expect(failure.kind).toBe('permanent');
    expect(failure.errorCode).toBe('invalid_media');
    expect(failure.httpStatus).toBe(400);
  });

  it('supports instanceof discrimination in catch blocks', () => {
    let failureKind: string | undefined;

    try {
      throw new PublishFailure({
        kind: 'transient',
        errorCode: 'rate_limited',
        message: 'platform rate limit exceeded',
      });
    } catch (error) {
      if (error instanceof PublishFailure) {
        failureKind = error.kind;
      }
    }

    expect(failureKind).toBe('transient');
  });
});
