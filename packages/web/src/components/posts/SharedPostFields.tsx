import type { RefObject } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { ScheduleConflictBanner } from './ScheduleConflictBanner';
import { TagSelector } from './TagSelector';
import { AutoDestructPicker } from './AutoDestructPicker';
import { SnippetPicker } from '../snippets/SnippetPicker';
import { utcToLocalInput, localInputToUtc } from '../../lib/timezone';
import { useTags } from '../../hooks/use-tags';
import { useCheckConflicts } from '../../hooks/use-posts';

interface SharedPostFieldsProps {
  /**
   * - 'new'   — full schedule + draft controls
   * - 'edit'  — full schedule + draft controls (edit existing post)
   * - 'queue' — schedule fields hidden (queue posts inherit cadence)
   */
  mode: 'new' | 'edit' | 'queue';
  userTimezone: string;
  effectiveProfileId: string;
  excludePostId?: string;

  scheduledAt: string | null;
  onScheduledAtChange: (utcIso: string | null, wasAdjusted: boolean) => void;
  scheduledAtError?: string | null;
  scheduleInputRef?: RefObject<HTMLInputElement | null>;

  tagIds: string[];
  onTagIdsChange: (ids: string[]) => void;
  onOpenTagManagement: () => void;

  notes: string;
  onNotesChange: (value: string) => void;

  hasSpinnableText: boolean;
  onHasSpinnableTextChange: (value: boolean) => void;

  autoDestructAfter: string | null;
  onAutoDestructAfterChange: (value: string | null) => void;

  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInsertSnippet: (nextValue: string) => void;
}

/**
 * SharedPostFields — every POST-CMN-* common control rendered as a single
 * component (B-03 closure).
 *
 * Mounted ABOVE the platform-specific branch in BOTH NewPostPage and
 * EditPostPage so every POST-CMN requirement always has a control on the
 * page regardless of platform. Schedule-related fields (POST-CMN-01,
 * POST-CMN-02, POST-CMN-07) hide in queue mode where the queue cadence
 * supplies the schedule.
 *
 * POST-CMN coverage:
 *   - POST-CMN-01: schedule datetime input
 *   - POST-CMN-02: timezone-aware datetime conversion + helper text
 *   - POST-CMN-03: spinnable toggle
 *   - POST-CMN-04: auto-destruct picker
 *   - POST-CMN-05: tag selector + notes textarea
 *   - POST-CMN-06: Save as Draft is delivered by the parent's `<SplitButton>`
 *                  rendered below this component
 *   - POST-CMN-07: schedule conflict banner
 */
export function SharedPostFields({
  mode,
  userTimezone,
  effectiveProfileId,
  excludePostId,
  scheduledAt,
  onScheduledAtChange,
  scheduledAtError,
  scheduleInputRef,
  tagIds,
  onTagIdsChange,
  onOpenTagManagement,
  notes,
  onNotesChange,
  hasSpinnableText,
  onHasSpinnableTextChange,
  autoDestructAfter,
  onAutoDestructAfterChange,
  textareaRef,
  onInsertSnippet,
}: SharedPostFieldsProps) {
  const { data: tagList } = useTags();
  const { data: conflicts } = useCheckConflicts(
    effectiveProfileId,
    scheduledAt ?? '',
    excludePostId,
  );

  function handleScheduledAtInputChange(localValue: string) {
    if (!localValue) {
      onScheduledAtChange(null, false);
      return;
    }
    const { utcIso, wasAdjusted } = localInputToUtc(localValue, userTimezone);
    onScheduledAtChange(utcIso, wasAdjusted);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-start">
        <SnippetPicker textareaRef={textareaRef} onInsert={onInsertSnippet} />
      </div>

      {/* POST-CMN-01 + POST-CMN-02: schedule datetime + timezone (hidden in queue mode) */}
      {mode !== 'queue' && (
        <div className="space-y-2">
          <Label htmlFor="schedule-datetime">Schedule</Label>
          <Input
            id="schedule-datetime"
            ref={scheduleInputRef}
            type="datetime-local"
            value={scheduledAt ? utcToLocalInput(scheduledAt, userTimezone) : ''}
            onChange={(event) => handleScheduledAtInputChange(event.target.value)}
            aria-invalid={scheduledAtError ? 'true' : undefined}
            aria-describedby={scheduledAtError ? 'schedule-datetime-error schedule-datetime-help' : 'schedule-datetime-help'}
            className={scheduledAtError ? 'border-destructive focus-visible:ring-destructive' : undefined}
          />
          <p id="schedule-datetime-help" className="text-xs text-muted-foreground">
            Times shown in {userTimezone.replace(/_/g, ' ')}
          </p>
          {scheduledAtError && (
            <p id="schedule-datetime-error" className="text-sm text-destructive">
              {scheduledAtError}
            </p>
          )}
          {/* POST-CMN-07: conflict warning when another scheduled post exists at the same time */}
          {conflicts && conflicts.length > 0 && (
            <ScheduleConflictBanner conflicts={conflicts} />
          )}
        </div>
      )}

      {/* POST-CMN-05: tags */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <TagSelector
          selected={tagIds}
          onChange={onTagIdsChange}
          onManage={onOpenTagManagement}
          tags={tagList ?? []}
        />
      </div>

      {/* POST-CMN-05: internal notes */}
      <div className="space-y-2">
        <Label htmlFor="post-notes">Notes</Label>
        <Textarea
          id="post-notes"
          placeholder="Internal notes (not published)..."
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={3}
        />
      </div>

      {/* POST-CMN-03: spinnable text toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="spinnable-toggle"
          checked={hasSpinnableText}
          onCheckedChange={onHasSpinnableTextChange}
        />
        <div>
          <Label htmlFor="spinnable-toggle">Spinnable text</Label>
          <p className="text-xs text-muted-foreground">
            Use {'{'}option1|option2{'}'} syntax. One variant is randomly chosen at publish time.
          </p>
        </div>
      </div>

      {/* POST-CMN-04: auto-destruct picker */}
      <AutoDestructPicker
        value={autoDestructAfter}
        onChange={onAutoDestructAfterChange}
      />
    </div>
  );
}
