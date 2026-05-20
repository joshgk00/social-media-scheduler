import type { PostStatus } from '../constants/post-states.js';

export type PostPlatform = 'twitter' | 'linkedin' | 'facebook';
export type PostVisibility = 'PUBLIC' | 'CONNECTIONS';

export interface PostState {
  status: PostStatus;
  postVersion: number;
  scheduledAt: Date | string | null;
  platform?: PostPlatform | null;
  isThread?: boolean;
  platformPostId?: string | null;
}

export interface PlanUpdateInput {
  platform?: PostPlatform;
  text?: string;
  isThread?: boolean;
  status?: 'draft' | 'scheduled';
  scheduledAt?: string | null;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  visibility?: PostVisibility | null;
  linkUrl?: string | null;
  postVersion: number;
}

export interface PostPatch {
  text?: string;
  isThread?: boolean;
  status?: PostStatus;
  scheduledAt?: Date | null;
  publishedAt?: Date;
  failedAt?: Date | null;
  lastAttemptAt?: Date;
  failureReason?: string | null;
  platformPostId?: string;
  hasSpinnableText?: boolean;
  autoDestructAfter?: string | null;
  notes?: string | null;
  visibility?: PostVisibility | null;
  linkUrl?: string | null;
  bumpVersion: boolean;
}

export interface PostTransitionProfile {
  platform: PostPlatform;
}

export type TransitionDecision =
  | { kind: 'proceed'; patch: PostPatch }
  | { kind: 'recover'; recoveryPlatformPostId: string };

export interface PreflightState {
  mediaReady: boolean;
  tokenHealthy: boolean;
  budgetExhausted: boolean;
  rateLimitExhausted: boolean;
}
