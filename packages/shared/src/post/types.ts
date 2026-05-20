import type { PostStatus } from '../constants/post-states.js';

export type PostPlatform = 'twitter' | 'linkedin' | 'facebook';

export interface PostState {
  status: PostStatus;
  postVersion: number;
  scheduledAt: Date | null;
  platform: PostPlatform;
}

export interface PostPatch {
  text?: string;
  isThread?: boolean;
  status?: PostStatus;
  scheduledAt?: Date | null;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  visibility?: 'PUBLIC' | 'CONNECTIONS' | null;
  linkUrl?: string | null;
  bumpVersion: boolean;
}

export type TransitionDecision =
  | { action: 'skip'; reason: 'unchanged' }
  | { action: 'transition'; from: PostStatus; to: PostStatus };

export interface PreflightState {
  mediaReady: boolean;
  tokenHealthy: boolean;
  budgetExhausted: boolean;
  rateLimitExhausted: boolean;
}
