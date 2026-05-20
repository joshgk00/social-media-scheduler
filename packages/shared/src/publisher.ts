import type { Buffer } from 'node:buffer';
import type { SupportedPlatform } from './schemas/profiles.js';

export type MediaKind = 'image' | 'video' | 'gif';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  bytes: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface PublishablePost {
  text: string;
  platform: SupportedPlatform;
  isThread: boolean;
  visibility: 'PUBLIC' | 'CONNECTIONS' | null;
  linkUrl: string | null;
  media: MediaItem[];
}

export interface PublishCtx {
  correlationId: string;
}

export interface PublishResult {
  platformPostId: string;
}

export interface Publisher<Profile = unknown> {
  publish(
    profile: Profile,
    post: PublishablePost,
    ctx: PublishCtx,
  ): Promise<PublishResult>;
}

export type PublishFailureKind = 'permanent' | 'transient';

export interface PublishFailureOptions {
  kind: PublishFailureKind;
  errorCode: string;
  message: string;
  httpStatus?: number;
  cause?: unknown;
}

export class PublishFailure extends Error {
  readonly kind: PublishFailureKind;
  readonly errorCode: string;
  readonly httpStatus?: number;

  constructor(options: PublishFailureOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PublishFailure';
    this.kind = options.kind;
    this.errorCode = options.errorCode;
    this.httpStatus = options.httpStatus;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
