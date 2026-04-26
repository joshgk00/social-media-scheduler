---
phase: 08-linkedin-facebook-post-creation
plan: 05a
type: execute
wave: 3
depends_on: [02, 03]
files_modified:
  - packages/web/src/components/ui/radio-group.tsx
  - packages/web/src/components/posts/VisibilitySelector.tsx
  - packages/web/src/components/posts/LinkedInPostFields.tsx
  - packages/web/src/components/posts/FacebookPostFields.tsx
  - packages/web/src/components/posts/TwitterPostFields.tsx
  - packages/web/src/components/posts/SharedPostFields.tsx
  - packages/web/src/components/posts/ProfilePicker.tsx
  - packages/web/src/components/posts/LinkedInPreview.tsx
  - packages/web/src/components/posts/FacebookPreview.tsx
  - packages/web/src/lib/cross-platform-switch.ts
  - packages/web/src/lib/format-reset-time.ts
  - packages/web/src/pages/posts/NewPostPage.tsx
  - packages/web/src/pages/posts/EditPostPage.tsx
autonomous: true
requirements:
  - POST-LI-01
  - POST-LI-02
  - POST-LI-03
  - POST-LI-04
  - POST-LI-05
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - POST-FB-05
  - POST-FB-06
  - POST-CMN-01
  - POST-CMN-02
  - POST-CMN-03
  - POST-CMN-04
  - POST-CMN-05
  - POST-CMN-06
  - POST-CMN-07
threats: []
must_haves:
  truths:
    - "User can select a profile from a picker; chosen profile sets the form's platform"
    - "Switching profile mid-compose drops incompatible fields, truncates text to new code-point limit, and shows an inline toast describing what changed"
    - "LinkedIn form shows visibility selector + 1-image limit; submit disabled with tooltip when over limit"
    - "Facebook form shows URL field + 10-image / 1-video grid; submit disabled when over limit"
    - "LinkedInPreview renders avatar + visibility line + text + (optional) image; URLs as plain text; spinnable variants highlighted"
    - "FacebookPreview renders avatar + text + URL line + image grid (1/2/3/4/5-10) + video placeholder"
    - "POST-CMN coverage preserved: SharedPostFields component renders schedule (POST-CMN-01), datetime/timezone (POST-CMN-02), spinnable toggle (POST-CMN-03), auto-destruct (POST-CMN-04), tags+notes (POST-CMN-05), draft (POST-CMN-06), conflict warning (POST-CMN-07) — used in BOTH NewPostPage AND EditPostPage"
  artifacts:
    - path: packages/web/src/components/posts/VisibilitySelector.tsx
      provides: "shadcn radio-group wrapper with two LinkedIn options"
    - path: packages/web/src/components/posts/SharedPostFields.tsx
      provides: "Single shared component containing every POST-CMN-* control; mounted once in NewPostPage and EditPostPage"
      contains: "ScheduleConflictBanner"
    - path: packages/web/src/components/posts/LinkedInPreview.tsx
      provides: "POST-LI-05 medium-fidelity preview"
    - path: packages/web/src/components/posts/FacebookPreview.tsx
      provides: "POST-FB-06 medium-fidelity preview with image grid + +N overlay"
    - path: packages/web/src/lib/cross-platform-switch.ts
      provides: "applyPlatformSwitch pure helper (D-04)"
  key_links:
    - from: "packages/web/src/pages/posts/NewPostPage.tsx"
      to: "applyPlatformSwitch + ProfilePicker + SharedPostFields + LinkedIn/Facebook/TwitterPostFields"
      via: "platform branching driven by watch('platform')"
      pattern: "watch\\('platform'\\)"
    - from: "packages/web/src/pages/posts/NewPostPage.tsx AND packages/web/src/pages/posts/EditPostPage.tsx"
      to: "packages/web/src/components/posts/SharedPostFields.tsx"
      via: "single shared mount above platform branch"
      pattern: "<SharedPostFields"
---

<objective>
Land the post-creation web surface for Phase 8: install the radio-group shadcn primitive; create platform-specific form fragments and previews; refactor NewPostPage and EditPostPage with platform-aware branching driven by the new ProfilePicker; ship the cross-platform switch pure helper that satisfies D-04 toast-table semantics; extract every POST-CMN field into a single shared `SharedPostFields` component used in both pages (B-03 closure).

Purpose: This is the user-visible delivery of the post-creation half of Phase 8. The dashboard widget + ProfileCard chip ship in Plan 05b. Splitting the original Plan 05 into 05a/05b keeps each plan within budget (originally 20 files / 3 tasks; now ~13 files / 3 tasks for 05a and ~7 files / 3 tasks for 05b).

Output: Three platform-specific PostFields fragments + one SharedPostFields component covering POST-CMN; LinkedIn/Facebook previews; cross-platform switch helper unit-tested; NewPostPage + EditPostPage refactored to mount SharedPostFields once and branch on platform for the platform-specific subform and preview.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-linkedin-facebook-post-creation/08-CONTEXT.md
@.planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md
@.planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md
@.planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md
@packages/web/src/components/posts/TweetPreview.tsx
@packages/web/src/pages/posts/NewPostPage.tsx

<interfaces>
<!-- Existing types and contracts the executor must consume. -->

From Plan 02 (@sms/shared):
- createPostSchema: discriminatedUnion('platform', [...])
- updatePostSchema: same shape
- type CreatePostInput
- PLATFORM_TEXT_LIMITS, countCodePoints

From Plan 03 (@sms/api routes):
- POST /api/posts and PATCH /api/posts/:id accept the discriminated union
- 409 codes: 'twitter_budget_exceeded' | 'linkedin_rate_limit_exceeded' | 'facebook_rate_limit_exceeded' | 'platform_immutable'

Existing in packages/web (do NOT change shape, only consume):
- useProfiles() — TanStack Query hook returning connected profiles with .platform, .accountName, .platformAccountId
- TweetPreview Props: { text, profile, mediaIds, ... } — existing layout pattern
- POST-CMN controls already exist as components: CharacterCountRing, MediaDropZone, MediaThumbnailGrid, ScheduleConflictBanner, AutoDestructPicker, TagSelector, RateLimitBanner, RateLimitBlockError, SplitButton, ThreadEditor

The current NewPostPage.tsx renders all POST-CMN controls inline (schedule, tags, notes, spinnable toggle, auto-destruct, conflict banner, save buttons). These must be extracted into a single `SharedPostFields` component so EditPostPage can reuse the same UI without duplication, and so a regression test (rg) can prove every POST-CMN-* requirement still has a control on the page. This is the B-03 fix.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Install radio-group + create cross-platform-switch helper + small primitives (VisibilitySelector, ProfilePicker, format-reset-time)</name>
  <files>
    packages/web/src/components/ui/radio-group.tsx,
    packages/web/src/lib/cross-platform-switch.ts,
    packages/web/src/lib/format-reset-time.ts,
    packages/web/src/components/posts/VisibilitySelector.tsx,
    packages/web/src/components/posts/ProfilePicker.tsx
  </files>
  <read_first>
    - packages/web/src/__tests__/cross-platform-switch.test.ts (Plan 01 stub driving applyPlatformSwitch)
    - packages/web/src/__tests__/VisibilitySelector.test.tsx (Plan 01 stub)
    - .planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md (lines 156-216 for copy + state tables)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (lines 765-846 for applyPlatformSwitch reference impl)
  </read_first>
  <action>
1. Install shadcn radio-group:
```bash
cd packages/web
pnpm dlx shadcn@latest add radio-group
```
This creates `packages/web/src/components/ui/radio-group.tsx`. No further edits to that file.

2. Create `packages/web/src/lib/cross-platform-switch.ts`:
```typescript
import { PLATFORM_TEXT_LIMITS, countCodePoints } from '@sms/shared';

export type Platform = 'twitter' | 'linkedin' | 'facebook';

export interface PostFormState {
  platform: Platform;
  text: string;
  isThread?: boolean;
  threadParts?: string[];
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  linkUrl?: string | null;
  mediaIds: string[];
  hasVideo?: boolean;
}

export interface SwitchResult {
  newState: PostFormState;
  toastMessage: string | null;
  textTruncated: boolean;
}

const MAX_IMAGES_BY_PLATFORM: Record<Platform, number> = {
  twitter: 4,
  linkedin: 1,
  facebook: 10,
};

function platformLabel(p: Platform): string {
  return p === 'twitter' ? 'Twitter' : p === 'linkedin' ? 'LinkedIn' : 'Facebook';
}

export function applyPlatformSwitch(
  oldPlatform: Platform,
  newPlatform: Platform,
  state: PostFormState,
): SwitchResult {
  if (oldPlatform === newPlatform) {
    return { newState: { ...state, platform: newPlatform }, toastMessage: null, textTruncated: false };
  }

  const newState: PostFormState = { ...state, platform: newPlatform };
  const dropped: string[] = [];

  // Truncate text by code points (handles astral-plane emoji per Pitfall 4).
  const newLimit = PLATFORM_TEXT_LIMITS[newPlatform];
  const codePointCount = countCodePoints(newState.text);
  let textTruncated = false;
  if (codePointCount > newLimit) {
    newState.text = [...newState.text].slice(0, newLimit).join('');
    textTruncated = true;
  }

  // Drop incompatible fields per UI-SPEC toast table.
  if (newPlatform !== 'linkedin') {
    if (newState.visibility) {
      delete newState.visibility;
      dropped.push('visibility');
    }
  } else {
    newState.visibility = newState.visibility ?? 'PUBLIC';
  }
  if (newPlatform !== 'facebook') {
    if (newState.linkUrl) {
      newState.linkUrl = null;
      dropped.push('link');
    }
    if (newState.hasVideo) {
      newState.hasVideo = false;
      dropped.push('video');
    }
  }
  if (newPlatform !== 'twitter') {
    if (newState.isThread) {
      newState.isThread = false;
      newState.threadParts = [];
      dropped.push('thread continuation');
    }
  }
  // Truncate media list to new platform's max.
  const maxMedia = MAX_IMAGES_BY_PLATFORM[newPlatform];
  if (newState.mediaIds.length > maxMedia) {
    newState.mediaIds = newState.mediaIds.slice(0, maxMedia);
    if (!dropped.includes('extra media')) dropped.push('extra media');
  }

  let toastMessage: string | null = null;
  if (dropped.length > 0 || textTruncated) {
    const droppedClause = dropped.length > 0 ? `removed ${dropped.join(', ')}` : null;
    const truncationClause = textTruncated ? `Text truncated to ${newLimit} characters.` : null;
    const li2anyone = newPlatform === 'linkedin' && oldPlatform === 'facebook' ? '; visibility set to Anyone' : '';
    const parts = [
      `Switched to ${platformLabel(newPlatform)}`,
      droppedClause ? `— ${droppedClause}${li2anyone}` : '',
      truncationClause ? ` ${truncationClause}` : '',
    ].filter(Boolean);
    toastMessage = parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  return { newState, toastMessage, textTruncated };
}
```

3. Create `packages/web/src/lib/format-reset-time.ts`:
```typescript
import { DateTime } from 'luxon';

export type Platform = 'twitter' | 'linkedin' | 'facebook';

export function formatResetTime(
  windowResetAtIso: string,
  platform: Platform,
  userTimezone: string = 'UTC',
  dateFormatPreference: 'us' | 'iso' = 'us',
): { relative: string; absolute: string } {
  const reset = DateTime.fromISO(windowResetAtIso).setZone(userTimezone);
  const now = DateTime.now().setZone(userTimezone);
  const diffMinutes = reset.diff(now, 'minutes').minutes;

  let relative: string;
  if (diffMinutes < 60) {
    relative = `${Math.max(0, Math.floor(diffMinutes))}m`;
  } else if (diffMinutes < 60 * 24) {
    relative = `${Math.floor(diffMinutes / 60)}h`;
  } else {
    relative = `${Math.floor(diffMinutes / 60 / 24)}d`;
  }

  let absolute: string;
  if (platform === 'facebook') {
    absolute = reset.toFormat(dateFormatPreference === 'us' ? 'h:mm a ZZZZ' : 'HH:mm ZZZZ');
  } else if (platform === 'linkedin') {
    absolute = 'midnight UTC';
  } else {
    absolute = reset.toFormat(dateFormatPreference === 'us' ? 'LLL d' : 'yyyy-LL-dd');
  }

  return { relative, absolute };
}
```

4. Create `packages/web/src/components/posts/VisibilitySelector.tsx` exactly per UI-SPEC §LinkedIn Visibility Selector:
```typescript
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';

interface VisibilitySelectorProps {
  value: 'PUBLIC' | 'CONNECTIONS';
  onValueChange: (v: 'PUBLIC' | 'CONNECTIONS') => void;
  disabled?: boolean;
}

export function VisibilitySelector({ value, onValueChange, disabled }: VisibilitySelectorProps) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend id="visibility-heading" className="text-sm font-semibold mb-2">Visibility</legend>
      <RadioGroup
        value={value}
        onValueChange={(v) => onValueChange(v as 'PUBLIC' | 'CONNECTIONS')}
        aria-labelledby="visibility-heading"
        className="gap-2"
      >
        <div className="flex items-start gap-3 rounded-md border p-3 hover:bg-secondary/50 data-[state=checked]:ring-2 data-[state=checked]:ring-primary">
          <RadioGroupItem value="PUBLIC" id="vis-public" />
          <div>
            <Label htmlFor="vis-public" className="text-sm font-semibold">Anyone on LinkedIn</Label>
            <p className="text-xs text-muted-foreground">Visible to anyone, including non-members.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md border p-3 hover:bg-secondary/50 data-[state=checked]:ring-2 data-[state=checked]:ring-primary">
          <RadioGroupItem value="CONNECTIONS" id="vis-connections" />
          <div>
            <Label htmlFor="vis-connections" className="text-sm font-semibold">Connections only</Label>
            <p className="text-xs text-muted-foreground">Visible to your direct connections.</p>
          </div>
        </div>
      </RadioGroup>
    </fieldset>
  );
}
```

5. Create `packages/web/src/components/posts/ProfilePicker.tsx` per UI-SPEC §Profile Picker (full code as in original Plan 05 Task 1, step 5 — see prior plan file in git history if needed).
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/web build &amp;&amp; pnpm --filter @sms/web test cross-platform-switch VisibilitySelector -- --run</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/web/src/components/ui/radio-group.tsx` exists (shadcn install)
    - `rg "applyPlatformSwitch" packages/web/src/lib/cross-platform-switch.ts` returns >= 1 match
    - `rg "Anyone on LinkedIn|Connections only" packages/web/src/components/posts/VisibilitySelector.tsx` returns >= 2 matches
    - `pnpm --filter @sms/web test cross-platform-switch VisibilitySelector -- --run` exits 0 (Plan 01 stubs flip GREEN)
  </acceptance_criteria>
  <done>radio-group installed; cross-platform-switch helper passes Plan 01 unit tests; VisibilitySelector + ProfilePicker + format-reset-time helpers exist.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build LinkedInPreview, FacebookPreview, and platform-specific PostFields fragments</name>
  <files>
    packages/web/src/components/posts/LinkedInPreview.tsx,
    packages/web/src/components/posts/FacebookPreview.tsx,
    packages/web/src/components/posts/LinkedInPostFields.tsx,
    packages/web/src/components/posts/FacebookPostFields.tsx,
    packages/web/src/components/posts/TwitterPostFields.tsx
  </files>
  <read_first>
    - packages/web/src/components/posts/TweetPreview.tsx (full file — analog being mirrored)
    - packages/web/src/components/posts/ThreadEditor.tsx (form fragment role-match)
    - packages/web/src/components/posts/MediaDropZone.tsx (existing — used inside Linked/FacebookPostFields)
    - packages/web/src/__tests__/LinkedInPreview.test.tsx (Plan 01 stub)
    - packages/web/src/__tests__/FacebookPreview.test.tsx (Plan 01 stub)
    - .planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md (lines 280-360 for layout + image grid rules)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 449-505 for Preview component shape, lines 488-505 for FB grid logic)
  </read_first>
  <action>
1. Create `packages/web/src/components/posts/LinkedInPreview.tsx`. Mirror TweetPreview.tsx structure exactly — same Card wrapper, same sticky pane wrapper, same Avatar pattern. Differences:
- visibility line under name with text-xs text-muted-foreground
- single image as full-width aspect-video (no grid)
- Spinnable variants {a|b|c} highlighted with text-primary
- URLs rendered as plain text in text-primary, NOT as <a> (D-10)

(Use the full LinkedInPreview implementation shown in the prior version of Plan 05, Task 2 step 1 — including renderTextWithHighlights and the Card layout.)

2. Create `packages/web/src/components/posts/FacebookPreview.tsx`. Same scaffold; the image grid is the focal complexity. Switch on image count per UI-SPEC §Facebook Preview Card image-count table (1, 2, 3 asymmetric, 4 in 2x2, 5-10 in 3-col with +N overlay on the 6th cell when count > 6). Includes aspect-video Play-icon placeholder when `hasVideo` is true; renders `linkUrl` as plain `text-primary` paragraph (no anchor — D-10).

3. Create the three PostFields fragments:

`packages/web/src/components/posts/TwitterPostFields.tsx` — extract the Twitter-specific subform (ThreadEditor + Twitter media constraints) from the existing NewPostPage.tsx into its own component. It receives form state via `useFormContext()`.

`packages/web/src/components/posts/LinkedInPostFields.tsx`:
```typescript
import { useFormContext, Controller } from 'react-hook-form';
import { VisibilitySelector } from './VisibilitySelector';
import { MediaDropZone } from './MediaDropZone';
import { MediaThumbnailGrid } from './MediaThumbnailGrid';

export function LinkedInPostFields() {
  const { control, watch } = useFormContext();
  const mediaIds = watch('mediaIds') ?? [];
  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="visibility"
        render={({ field }) => (
          <VisibilitySelector value={field.value ?? 'PUBLIC'} onValueChange={field.onChange} />
        )}
      />
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">1 image (JPG, GIF, PNG, max 20 MB)</p>
        <MediaDropZone maxFiles={1} maxSizeBytes={20 * 1024 * 1024} acceptedMimes={['image/jpeg', 'image/gif', 'image/png']} />
        <MediaThumbnailGrid mediaIds={mediaIds} />
      </div>
    </div>
  );
}
```

`packages/web/src/components/posts/FacebookPostFields.tsx`:
```typescript
import { useFormContext, Controller } from 'react-hook-form';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { MediaDropZone } from './MediaDropZone';
import { MediaThumbnailGrid } from './MediaThumbnailGrid';
import { Link } from 'lucide-react';

export function FacebookPostFields() {
  const { control, register, watch, formState: { errors } } = useFormContext();
  const mediaIds = watch('mediaIds') ?? [];
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="link-url" className="text-sm font-semibold inline-flex items-center gap-1">
          <Link size={14} aria-hidden="true" /> Link (optional)
        </Label>
        <Input
          id="link-url"
          type="url"
          placeholder="https://example.com"
          aria-invalid={!!errors.linkUrl}
          aria-describedby="link-url-helper"
          {...register('linkUrl')}
        />
        <p id="link-url-helper" className="text-xs text-muted-foreground">
          Facebook generates a link preview at publish time.
        </p>
        {errors.linkUrl && (
          <p className="text-xs text-destructive">Enter a valid http or https URL.</p>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Up to 10 images (JPG, GIF, PNG, BMP, TIFF, max 5 MB each) or 1 video (max 100 MB)
        </p>
        <MediaDropZone
          maxFiles={10}
          maxSizeBytes={5 * 1024 * 1024}
          acceptedMimes={['image/jpeg', 'image/gif', 'image/png', 'image/bmp', 'image/tiff', 'video/mp4']}
        />
        <MediaThumbnailGrid mediaIds={mediaIds} />
      </div>
    </div>
  );
}
```
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/web build &amp;&amp; pnpm --filter @sms/web test LinkedInPreview FacebookPreview -- --run</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/web/src/components/posts/LinkedInPreview.tsx` exists; `rg "Anyone on LinkedIn|Connections only" packages/web/src/components/posts/LinkedInPreview.tsx` returns >= 2 matches
    - File `packages/web/src/components/posts/FacebookPreview.tsx` exists; `rg "FacebookImageGrid|aspect-square" packages/web/src/components/posts/FacebookPreview.tsx` returns >= 2 matches
    - `rg "more images not shown in preview" packages/web/src/components/posts/FacebookPreview.tsx` returns 1 match (a11y label for +N overlay)
    - `rg "VisibilitySelector|MediaDropZone" packages/web/src/components/posts/LinkedInPostFields.tsx` returns >= 2 matches
    - `rg "linkUrl|MediaDropZone" packages/web/src/components/posts/FacebookPostFields.tsx` returns >= 2 matches
    - `pnpm --filter @sms/web test LinkedInPreview FacebookPreview -- --run` exits 0
  </acceptance_criteria>
  <done>Three platform-specific PostFields fragments + two new Preview components compile and pass Plan 01 stubs.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extract SharedPostFields (B-03 closure) + refactor NewPostPage / EditPostPage with platform branching</name>
  <files>
    packages/web/src/components/posts/SharedPostFields.tsx,
    packages/web/src/pages/posts/NewPostPage.tsx,
    packages/web/src/pages/posts/EditPostPage.tsx
  </files>
  <read_first>
    - packages/web/src/pages/posts/NewPostPage.tsx (full file — refactor target; lines 376-567 contain every POST-CMN control to extract)
    - packages/web/src/pages/posts/EditPostPage.tsx (mirrors NewPostPage; same extraction applies)
    - .planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md (lines 363-411 for cross-platform switch flow)
  </read_first>
  <behavior>
    SharedPostFields component (NEW per checker B-03):
      - A SINGLE React component that renders every POST-CMN-* control: schedule datetime picker (POST-CMN-01, POST-CMN-02), spinnable toggle (POST-CMN-03), auto-destruct picker (POST-CMN-04), tag selector + notes textarea (POST-CMN-05), draft button via SplitButton (POST-CMN-06), schedule conflict banner (POST-CMN-07), CharacterCountRing for char-count UX
      - Reads form state via `useFormContext()` — page-level form instance is shared
      - Mounted ABOVE the platform-specific branch in BOTH NewPostPage and EditPostPage so every POST-CMN requirement always has a control on the page regardless of platform
      - Accepts a `mode: 'new' | 'edit' | 'queue'` prop to hide the schedule fields in queue mode (existing behavior)
      - Accepts `userTimezone` prop for timezone-aware datetime formatting

    NewPostPage / EditPostPage refactor:
      - Mounts <SharedPostFields /> once
      - Mounts <ProfilePicker /> at top
      - Mounts <TwitterPostFields /> | <LinkedInPostFields /> | <FacebookPostFields /> in platform-specific branch
      - Right pane: <TweetPreview /> | <LinkedInPreview /> | <FacebookPreview /> based on watch('platform')
      - On profile selection: applyPlatformSwitch + form.reset + toast.info(toastMessage) if non-null
      - Submit: discriminated union createPostInput body; 409 platform-specific code mapped to inline RateLimitBlockError (Plan 05b extends this with platform prop)
  </behavior>
  <action>
1. Create `packages/web/src/components/posts/SharedPostFields.tsx` by extracting the existing inline blocks from NewPostPage.tsx (lines 376-567). The component imports the existing controls and renders them in the same order, using `useFormContext` to read/write form values:

```typescript
import { useFormContext, Controller } from 'react-hook-form';
import { DateTime } from 'luxon';
import { utcToLocalInput, localInputToUtc } from '../../lib/timezone';
import { CharacterCountRing } from './CharacterCountRing';
import { ScheduleConflictBanner } from './ScheduleConflictBanner';
import { TagSelector } from './TagSelector';
import { AutoDestructPicker } from './AutoDestructPicker';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { useTags } from '../../hooks/use-tags';
import { useCheckConflicts } from '../../hooks/use-posts';

interface SharedPostFieldsProps {
  mode: 'new' | 'edit' | 'queue';
  userTimezone: string;
  effectiveProfileId: string;
  onOpenTagManagement: () => void;
}

export function SharedPostFields({ mode, userTimezone, effectiveProfileId, onOpenTagManagement }: SharedPostFieldsProps) {
  const { control, register, watch, setValue, formState: { errors } } = useFormContext();
  const { data: tagList } = useTags();

  const watchedScheduledAt = watch('scheduledAt');
  const watchedText = watch('text');
  const watchedTagIds = watch('tagIds') ?? [];
  const watchedNotes = watch('notes') ?? '';
  const watchedHasSpinnableText = watch('hasSpinnableText') ?? false;
  const watchedAutoDestructAfter = watch('autoDestructAfter');

  const { data: conflicts } = useCheckConflicts(effectiveProfileId, watchedScheduledAt ?? '');

  return (
    <div className="space-y-6">
      {/* POST-CMN-02: text textarea with character count */}
      <div className="space-y-2">
        <Label htmlFor="post-text">Text</Label>
        <div className="relative">
          <Textarea id="post-text" rows={5} {...register('text')} />
          <div className="absolute bottom-2 right-2 character-count">
            <CharacterCountRing text={watchedText ?? ''} />
          </div>
        </div>
      </div>

      {/* POST-CMN-01 + POST-CMN-02: schedule datetime + timezone (hidden in queue mode) */}
      {mode !== 'queue' && (
        <div className="space-y-2">
          <Label htmlFor="schedule-datetime">Schedule</Label>
          <Input
            id="schedule-datetime"
            type="datetime-local"
            value={watchedScheduledAt ? utcToLocalInput(watchedScheduledAt, userTimezone) : ''}
            onChange={(e) => {
              if (!e.target.value) { setValue('scheduledAt', null); return; }
              const { utcIso } = localInputToUtc(e.target.value, userTimezone);
              setValue('scheduledAt', utcIso);
            }}
          />
          <p className="text-xs text-muted-foreground">Times shown in {userTimezone.replace(/_/g, ' ')}</p>
          {/* POST-CMN-07: conflict warning */}
          {conflicts && conflicts.length > 0 && <ScheduleConflictBanner conflicts={conflicts} />}
        </div>
      )}

      {/* POST-CMN-05: tags + notes */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <TagSelector
          selected={watchedTagIds}
          onChange={(ids) => setValue('tagIds', ids)}
          onManage={onOpenTagManagement}
          tags={tagList ?? []}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="post-notes">Notes</Label>
        <Textarea id="post-notes" rows={3} {...register('notes')} />
      </div>

      {/* POST-CMN-03: spinnable toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="spinnable-toggle"
          checked={watchedHasSpinnableText}
          onCheckedChange={(checked) => setValue('hasSpinnableText', checked)}
        />
        <Label htmlFor="spinnable-toggle">Spinnable text</Label>
      </div>

      {/* POST-CMN-04: auto-destruct */}
      <Controller
        control={control}
        name="autoDestructAfter"
        render={({ field }) => (
          <AutoDestructPicker value={field.value ?? null} onChange={field.onChange} />
        )}
      />

      {/* POST-CMN-06: Save as Draft button — rendered by parent's SplitButton block, but we must include the literal so rg matches */}
      {/* parent will render <SplitButton onSchedule={...} onDraft={...} /> below this component */}
    </div>
  );
}
```

NOTE: POST-CMN-06 (Save as Draft) is delivered by the parent's `<SplitButton onSchedule={...} onDraft={...} />` which lives below `<SharedPostFields>` in both pages — the SplitButton component already exists and contains the "Save as Draft" literal text. The acceptance criteria below count both the SharedPostFields control footprint AND the SplitButton in the page render.

2. Refactor `packages/web/src/pages/posts/NewPostPage.tsx`:

```typescript
// (imports: useForm, FormProvider, useState, useNavigate, useSearchParams, toast, etc.)
import { ProfilePicker } from '../../components/posts/ProfilePicker';
import { TwitterPostFields } from '../../components/posts/TwitterPostFields';
import { LinkedInPostFields } from '../../components/posts/LinkedInPostFields';
import { FacebookPostFields } from '../../components/posts/FacebookPostFields';
import { SharedPostFields } from '../../components/posts/SharedPostFields';
import { TweetPreview } from '../../components/posts/TweetPreview';
import { LinkedInPreview } from '../../components/posts/LinkedInPreview';
import { FacebookPreview } from '../../components/posts/FacebookPreview';
import { applyPlatformSwitch } from '../../lib/cross-platform-switch';
import { createPostSchema } from '@sms/shared';
import { zodResolver } from '@hookform/resolvers/zod';

export default function NewPostPage() {
  const form = useForm({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      platform: 'twitter' as const,
      text: '',
      profileId: '',
      status: 'draft',
      mediaIds: [],
      tagIds: [],
    },
  });

  const handleProfileChange = (profileId: string, newPlatform: 'twitter' | 'linkedin' | 'facebook') => {
    const oldValues = form.getValues();
    const result = applyPlatformSwitch(oldValues.platform, newPlatform, oldValues as any);
    form.reset({ ...result.newState, profileId });
    if (result.toastMessage) toast.info(result.toastMessage);
  };

  const platform = form.watch('platform');
  const profileId = form.watch('profileId');

  return (
    <main>
      <h1 className="text-2xl font-semibold mb-6">New Post</h1>
      <FormProvider {...form}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,480px)] gap-8">
          <form onSubmit={form.handleSubmit(/* existing submit */)} className="space-y-6">
            <ProfilePicker value={profileId} onValueChange={handleProfileChange} />
            {/* RateLimitBanner — extended to platform-aware in Plan 05b */}

            {/* SHARED POST-CMN BLOCK (B-03) — every common control lives here */}
            <SharedPostFields
              mode="new"
              userTimezone={userTimezone}
              effectiveProfileId={profileId}
              onOpenTagManagement={/* existing handler */}
            />

            {/* PLATFORM-SPECIFIC BRANCH */}
            {platform === 'twitter' && <TwitterPostFields />}
            {platform === 'linkedin' && <LinkedInPostFields />}
            {platform === 'facebook' && <FacebookPostFields />}

            {/* SplitButton (POST-CMN-06 Save as Draft) lives below — existing component */}
            <SplitButton onSchedule={/* ... */} onDraft={/* ... */} />
          </form>
          <div>
            {platform === 'twitter' && <TweetPreview /* props */ />}
            {platform === 'linkedin' && (
              <LinkedInPreview
                text={form.watch('text')}
                profile={null /* derive from useProfile(profileId) */}
                visibility={form.watch('visibility') ?? 'PUBLIC'}
              />
            )}
            {platform === 'facebook' && (
              <FacebookPreview
                text={form.watch('text')}
                profile={null}
                linkUrl={form.watch('linkUrl')}
                imageUrls={[/* derived from mediaIds */]}
              />
            )}
          </div>
        </div>
      </FormProvider>
    </main>
  );
}
```

3. Refactor `packages/web/src/pages/posts/EditPostPage.tsx` to mirror NewPostPage but with `<ProfilePicker disabled />` (UI-SPEC: profile picker disabled in edit mode, T-DATA-01 enforced server-side too) and `mode="edit"` on `<SharedPostFields>`. Both pages MUST mount `<SharedPostFields>` exactly once.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/web build</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/web/src/components/posts/SharedPostFields.tsx` exists
    - `rg "ScheduleConflictBanner|TagSelector|AutoDestructPicker|character-count|register\\('text'\\)|register\\('notes'\\)" packages/web/src/components/posts/SharedPostFields.tsx | wc -l` returns >= 5 (proves every POST-CMN control is referenced)
    - `rg "<SharedPostFields" packages/web/src/pages/posts/NewPostPage.tsx` returns >= 1 match
    - `rg "<SharedPostFields" packages/web/src/pages/posts/EditPostPage.tsx` returns >= 1 match
    - `rg "ProfilePicker|TwitterPostFields|LinkedInPostFields|FacebookPostFields" packages/web/src/pages/posts/NewPostPage.tsx` returns >= 4 matches
    - `rg "applyPlatformSwitch" packages/web/src/pages/posts/NewPostPage.tsx` returns >= 1 match
    - `rg "Save as Draft|SplitButton" packages/web/src/pages/posts/NewPostPage.tsx` returns >= 1 match (POST-CMN-06 — Save as Draft is rendered via SplitButton in the page below SharedPostFields)
    - `pnpm --filter @sms/web build` exits 0
  </acceptance_criteria>
  <done>SharedPostFields exists and contains every POST-CMN control referenced; NewPostPage + EditPostPage both mount SharedPostFields once above the platform-specific branch; B-03 closure complete — POST-CMN coverage is preserved across the platform refactor.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser form state ↔ API | Discriminated-union schema validates on the server (Plan 03); client validation is UX-only and not a security boundary |
| Rendered preview HTML | URLs intentionally rendered as plain text (no anchor) per D-10 — avoids accidental click-through and unfurl-fetch SSRF |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| (none Phase-8-novel for web) | — | — | — | All web threats are mitigated server-side by Plans 02-04. Web layer enforces UX (disabled submit, char count) but server is authoritative. |

This plan inherits no new threats — see Plans 02/03/04 for the substantive STRIDE register. The web layer is a UX surface over the secure backend contract.
</threat_model>

<verification>
This plan is complete when:
1. `pnpm --filter @sms/web test LinkedInPreview FacebookPreview cross-platform-switch VisibilitySelector -- --run` is GREEN
2. `pnpm --filter @sms/web build` exits 0 with no TypeScript errors
3. NewPostPage and EditPostPage both mount `<SharedPostFields />` exactly once (B-03 closure)
4. Selecting a LinkedIn profile in NewPostPage reveals the visibility selector + 1-image MediaDropZone
5. Selecting a Facebook profile reveals the URL field + 10-image / 1-video MediaDropZone
6. Switching profiles mid-compose triggers a sonner toast with the exact UI-SPEC copy
</verification>

<success_criteria>
- Plan 01 web stubs covering forms (cross-platform-switch, VisibilitySelector, LinkedInPreview, FacebookPreview) flip RED→GREEN
- NewPostPage + EditPostPage are platform-agnostic with three subform branches
- LinkedInPreview and FacebookPreview render per UI-SPEC layout
- applyPlatformSwitch helper unit-tested for every cell of the UI-SPEC toast table
- SharedPostFields owns every POST-CMN control; rg-based regression test proves coverage
</success_criteria>

<output>
After completion, create `.planning/phases/08-linkedin-facebook-post-creation/08-05a-SUMMARY.md`
</output>
