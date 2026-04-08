import { describe, it } from 'vitest';

describe('PostForm', () => {
  describe('scheduling', () => {
    it.todo('displays datetime picker for scheduling');
    it.todo('converts datetime-local value to UTC via Luxon using user IANA timezone');
    it.todo('displays scheduled time in user timezone, not browser timezone');
    it.todo('shows conflict warning when another post is within 5 minutes');
    it.todo('fires conflict check on both datetime AND profile changes');
    it.todo('rejects ambiguous DST local times with explicit error');
  });

  describe('spinnable text', () => {
    it.todo('toggle enables hasSpinnableText flag');
    it.todo('help text explains {option|option} syntax');
  });

  describe('common fields', () => {
    it.todo('allows saving as draft without scheduledAt');
    it.todo('requires scheduledAt when scheduling');
    it.todo('renders auto-destruct picker');
    it.todo('renders notes textarea');
    it.todo('renders tag selector');
  });
});
