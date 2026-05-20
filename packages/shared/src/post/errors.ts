export type PostInvariantErrorKind =
  | 'platform_mismatch'
  | 'platform_immutable'
  | 'not_editable'
  | 'invalid_transition'
  | 'version_mismatch'
  | 'scheduled_at_required'
  | 'scheduled_at_must_be_future'
  | 'not_deletable'
  | 'tag_not_found'
  | 'thread_unsupported'
  | 'media_pending'
  | 'budget_exhausted'
  | 'rate_limit_exhausted'
  | 'token_unhealthy'
  | 'already_published'
  | 'not_scheduled';

export class PostInvariantError extends Error {
  public readonly kind: PostInvariantErrorKind;

  constructor(kind: PostInvariantErrorKind, message: string) {
    super(message);
    this.name = 'PostInvariantError';
    this.kind = kind;
  }
}
