import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { DateTime } from 'luxon';
import { toast } from 'sonner';
import { PLATFORM_MEDIA_LIMITS } from '@sms/shared';
import { useAuth } from '../../hooks/use-auth';
import { useProfiles } from '../../hooks/use-profiles';
import { useTags } from '../../hooks/use-tags';
import { useCreatePost, useCheckConflicts } from '../../hooks/use-posts';
import { useQueue } from '../../hooks/use-queues';
import { useAddToQueue } from '../../hooks/use-queue-posts';
import { useMediaUpload } from '../../hooks/use-media-upload';
import { useDeleteMedia, useRetryTranscode } from '../../hooks/use-media';
import { utcToLocalInput, localInputToUtc } from '../../lib/timezone';
import { serializeThread, deserializeThread, type TweetSegment } from '../../lib/thread';
import { ThreadEditor } from '../../components/posts/ThreadEditor';
import { TweetPreview } from '../../components/posts/TweetPreview';
import { CharacterCountRing } from '../../components/posts/CharacterCountRing';
import { SplitButton } from '../../components/posts/SplitButton';
import { TagSelector } from '../../components/posts/TagSelector';
import { AutoDestructPicker } from '../../components/posts/AutoDestructPicker';
import { ScheduleConflictBanner } from '../../components/posts/ScheduleConflictBanner';
import { TagManagementDialog } from '../../components/posts/TagManagementDialog';
import { RateLimitBanner } from '../../components/posts/RateLimitBanner';
import { RateLimitBlockError, type RateLimitBlockErrorDetail } from '../../components/posts/RateLimitBlockError';
import { RateLimitSettingsDialog } from '../../components/profiles/RateLimitSettingsDialog';
import { MediaDropZone } from '../../components/posts/MediaDropZone';
import { MediaThumbnailGrid } from '../../components/posts/MediaThumbnailGrid';
import type { MediaItem } from '../../components/posts/MediaThumbnail';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

interface PostFormValues {
  profileId: string;
  text: string;
  scheduledAt: string | null;
  hasSpinnableText: boolean;
  autoDestructAfter: string | null;
  notes: string;
  tagIds: string[];
}

export default function NewPostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queueId = searchParams.get('queueId');
  const isQueueMode = !!queueId;

  const { data: authUser } = useAuth();
  const userTimezone = authUser?.timezone ?? 'UTC';
  const { data: profiles } = useProfiles();
  const { data: tagList } = useTags();
  const createPostMutation = useCreatePost();
  const { data: queueData } = useQueue(queueId ?? '');
  const addToQueueMutation = useAddToQueue(queueId ?? '');

  const [isThread, setIsThread] = useState(false);
  const [tweets, setTweets] = useState<TweetSegment[]>([
    { id: crypto.randomUUID(), text: '' },
  ]);
  const [isTagManageOpen, setIsTagManageOpen] = useState(false);
  const [rateLimitBlockError, setRateLimitBlockError] = useState<RateLimitBlockErrorDetail | null>(null);
  const [isRateLimitDialogOpen, setIsRateLimitDialogOpen] = useState(false);

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const { upload, uploadingFiles, isUploading } = useMediaUpload();
  const deleteMediaMutation = useDeleteMedia();
  const retryTranscodeMutation = useRetryTranscode();

  const form = useForm<PostFormValues>({
    defaultValues: {
      profileId: '',
      text: '',
      scheduledAt: null,
      hasSpinnableText: false,
      autoDestructAfter: null,
      notes: '',
      tagIds: [],
    },
  });

  const watchedProfileId = form.watch('profileId');
  const watchedScheduledAt = form.watch('scheduledAt');
  const watchedText = form.watch('text');
  const watchedTagIds = form.watch('tagIds');
  const watchedNotes = form.watch('notes');
  const watchedHasSpinnableText = form.watch('hasSpinnableText');
  const watchedAutoDestructAfter = form.watch('autoDestructAfter');

  const SPINNABLE_PATTERN = /\{[^{}|]+\|[^{}|]+\}/;
  useEffect(() => {
    const hasSpinSyntax = SPINNABLE_PATTERN.test(watchedText);
    if (hasSpinSyntax && !watchedHasSpinnableText) {
      form.setValue('hasSpinnableText', true);
    }
  }, [watchedText]); // eslint-disable-line react-hooks/exhaustive-deps -- only auto-enable, never auto-disable

  const effectiveProfileId = isQueueMode ? (queueData?.profileId ?? '') : watchedProfileId;

  const selectedProfilePlatform = (() => {
    const profile = profiles?.find((p) => p.id === effectiveProfileId);
    return profile?.platform ?? null;
  })();

  const platformLimits = selectedProfilePlatform
    ? PLATFORM_MEDIA_LIMITS[selectedProfilePlatform]
    : null;

  const maxFilesForPlatform = (() => {
    if (!platformLimits) return 4;
    const hasVideo = mediaItems.some((m) => m.mimeType.startsWith('video/'));
    return hasVideo ? platformLimits.maxVideos : platformLimits.maxImages;
  })();

  const hasTranscodingMedia = mediaItems.some(
    (m) => m.transcodeStatus === 'pending' || m.transcodeStatus === 'processing',
  );
  const hasFailedMedia = mediaItems.some(
    (m) => m.transcodeStatus === 'failed',
  );
  const isMediaBlocking = hasTranscodingMedia || hasFailedMedia;

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!selectedProfilePlatform) return;
      for (const file of files) {
        try {
          const response = await upload(file, effectiveProfileId, selectedProfilePlatform);
          setMediaItems((prev) => [
            ...prev,
            {
              id: response.id,
              fileName: response.fileName,
              mimeType: response.mimeType,
              thumbnailUrl: response.thumbnailUrl,
              transcodeStatus: response.transcodeStatus,
              transcodeError: null,
            },
          ]);
          toast.success('File uploaded.');
        } catch (uploadError) {
          const errorMessage = uploadError instanceof Error ? uploadError.message : 'Upload failed';
          toast.error(`Upload failed: ${errorMessage}`);
        }
      }
    },
    [effectiveProfileId, selectedProfilePlatform, upload],
  );

  function handleRemoveMedia(mediaId: string) {
    deleteMediaMutation.mutate(mediaId, {
      onSuccess: () => {
        setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to remove media.');
      },
    });
  }

  function handleReorderMedia(newOrder: string[]) {
    setMediaItems((prev) => {
      const itemMap = new Map(prev.map((m) => [m.id, m]));
      return newOrder.map((id) => itemMap.get(id)).filter((m): m is MediaItem => m !== undefined);
    });
  }

  function handleRetryTranscode(mediaId: string) {
    retryTranscodeMutation.mutate(mediaId, {
      onSuccess: () => {
        setMediaItems((prev) =>
          prev.map((m) =>
            m.id === mediaId
              ? { ...m, transcodeStatus: 'pending' as const, transcodeError: null }
              : m,
          ),
        );
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Retry failed.');
      },
    });
  }

  const { data: conflicts } = useCheckConflicts(
    effectiveProfileId,
    watchedScheduledAt ?? '',
  );

  const selectedProfile = profiles?.find((p) => p.id === effectiveProfileId);
  const previewProfile = selectedProfile
    ? { displayName: selectedProfile.displayName, handle: `@${selectedProfile.handle}`, avatarUrl: selectedProfile.avatarUrl ?? '' }
    : null;

  function handleThreadToggle(checked: boolean) {
    if (checked) {
      const currentText = form.getValues('text');
      if (currentText.includes('[[tweet]]')) {
        setTweets(deserializeThread(currentText));
      } else {
        setTweets([{ id: crypto.randomUUID(), text: currentText }]);
      }
    } else {
      form.setValue('text', serializeThread(tweets));
    }
    setIsThread(checked);
  }

  function getSubmitText(): string {
    return isThread ? serializeThread(tweets) : form.getValues('text');
  }

  const isSubmitting = createPostMutation.isPending || addToQueueMutation.isPending || isUploading;

  function getSubmitDisabledReason(): string | null {
    if (hasTranscodingMedia) return 'Video is still transcoding.';
    if (hasFailedMedia) return 'Fix or remove failed media before submitting.';
    return null;
  }

  function validateAndSubmit(action: 'schedule' | 'draft' | 'queue') {
    const text = getSubmitText();
    if (!text.trim()) {
      toast.error('Tweet text is required.');
      return;
    }

    if (action !== 'queue' && !form.getValues('profileId')) {
      toast.error('Please select a profile.');
      return;
    }

    if (action === 'schedule') {
      const scheduledAt = form.getValues('scheduledAt');
      if (!scheduledAt) {
        toast.error('Please select a scheduled time.');
        return;
      }
      if (DateTime.fromISO(scheduledAt) <= DateTime.utc()) {
        toast.error('Scheduled time must be in the future.');
        return;
      }
    }

    if (action !== 'draft' && isMediaBlocking) return;

    if (action === 'queue') {
      submitQueuePost(text);
    } else {
      submitPost(action, text);
    }
  }

  function submitQueuePost(text: string) {
    if (!queueId || !queueData) return;

    setRateLimitBlockError(null);
    createPostMutation.mutate(
      {
        profileId: queueData.profileId,
        text,
        isThread,
        status: 'draft',
        hasSpinnableText: form.getValues('hasSpinnableText'),
        autoDestructAfter: form.getValues('autoDestructAfter'),
        notes: form.getValues('notes') || null,
        tagIds: form.getValues('tagIds'),
        mediaIds: mediaItems.map((m) => m.id),
      },
      {
        onSuccess: (createdPost) => {
          addToQueueMutation.mutate(createdPost.id, {
            onSuccess: () => {
              toast.success('Post added to queue.');
              navigate(`/queues/${queueId}/posts`);
            },
            onError: (addError: Error) => {
              toast.error(addError.message || 'Post created but failed to add to queue.');
            },
          });
        },
        onError: (error: Error & { status?: number; body?: Record<string, unknown> }) => {
          if (error.status === 409 && error.body?.code === 'twitter_budget_exceeded') {
            setRateLimitBlockError({
              code: 'twitter_budget_exceeded',
              budget: Number(error.body.budget ?? 0),
              currentCount: Number(error.body.currentCount ?? 0),
            });
            return;
          }
          toast.error(error.message || 'Failed to create post.');
        },
      },
    );
  }

  function submitPost(action: 'schedule' | 'draft', text: string) {
    const scheduledAt = action === 'schedule'
      ? form.getValues('scheduledAt')
      : null;

    setRateLimitBlockError(null);
    createPostMutation.mutate(
      {
        profileId: form.getValues('profileId'),
        text,
        isThread,
        status: action === 'draft' ? 'draft' : 'scheduled',
        scheduledAt: scheduledAt ?? undefined,
        hasSpinnableText: form.getValues('hasSpinnableText'),
        autoDestructAfter: form.getValues('autoDestructAfter'),
        notes: form.getValues('notes') || null,
        tagIds: form.getValues('tagIds'),
        mediaIds: mediaItems.map((m) => m.id),
      },
      {
        onSuccess: () => {
          toast.success(action === 'draft' ? 'Draft saved.' : 'Post scheduled.');
          navigate('/posts');
        },
        onError: (error: Error & { status?: number; body?: Record<string, unknown> }) => {
          if (error.status === 409 && error.body?.code === 'twitter_budget_exceeded') {
            setRateLimitBlockError({
              code: 'twitter_budget_exceeded',
              budget: Number(error.body.budget ?? 0),
              currentCount: Number(error.body.currentCount ?? 0),
            });
            return;
          }
          toast.error(error.message || 'Failed to create post.');
        },
      },
    );
  }

  function handleScheduledAtChange(localValue: string) {
    if (localValue) {
      const { utcIso, wasAdjusted } = localInputToUtc(localValue, userTimezone);
      form.setValue('scheduledAt', utcIso);
      if (wasAdjusted) {
        const adjustedLocal = DateTime.fromISO(utcIso).setZone(userTimezone).toFormat('h:mm a');
        toast.info(`Adjusted to ${adjustedLocal} due to daylight saving time change.`);
      }
    } else {
      form.setValue('scheduledAt', null);
    }
  }

  const previewText = isThread ? '' : watchedText;

  return (
    <main>
      <h1 className="text-2xl font-semibold mb-6">
        {isQueueMode ? 'Add Post to Queue' : 'New Post'}
      </h1>
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left column: form */}
        <div className="flex-1 lg:max-w-[60%] space-y-6">
          <RateLimitBanner
            profileId={effectiveProfileId || null}
            onEditBudget={() => setIsRateLimitDialogOpen(true)}
          />

          {/* Profile selector -- hidden in queue mode */}
          {!isQueueMode && (
            <div className="space-y-2">
              <Label htmlFor="profile-select">Profile</Label>
              <Select
                value={watchedProfileId}
                onValueChange={(value) => form.setValue('profileId', value)}
              >
                <SelectTrigger id="profile-select">
                  <SelectValue placeholder="Select a profile..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.displayName} (@{profile.handle})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Single/Thread toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="thread-toggle"
              checked={isThread}
              onCheckedChange={handleThreadToggle}
            />
            <Label htmlFor="thread-toggle">Thread mode</Label>
          </div>

          {/* Text area or ThreadEditor */}
          {isThread ? (
            <ThreadEditor tweets={tweets} onChange={setTweets} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="tweet-text">Tweet text</Label>
              <div className="relative">
                <Textarea
                  id="tweet-text"
                  placeholder="What's happening?"
                  value={watchedText}
                  onChange={(e) => form.setValue('text', e.target.value)}
                  rows={5}
                />
                <div className="absolute bottom-2 right-2">
                  <CharacterCountRing text={watchedText} />
                </div>
              </div>
            </div>
          )}

          {/* Media upload */}
          <MediaDropZone
            platform={selectedProfilePlatform}
            existingMediaCount={mediaItems.length}
            maxFiles={maxFilesForPlatform}
            onFilesSelected={handleFilesSelected}
            disabled={isSubmitting}
            hasVideo={mediaItems.some((m) => m.mimeType.startsWith('video/'))}
          />
          {mediaItems.length > 0 && (
            <MediaThumbnailGrid
              mediaItems={mediaItems}
              uploadingFiles={uploadingFiles}
              onRemove={handleRemoveMedia}
              onReorder={handleReorderMedia}
              onRetryTranscode={handleRetryTranscode}
              readOnly={false}
            />
          )}

          {/* Schedule datetime picker -- hidden in queue mode */}
          {!isQueueMode && (
            <div className="space-y-2">
              <Label htmlFor="schedule-datetime">Schedule</Label>
              <Input
                id="schedule-datetime"
                type="datetime-local"
                value={watchedScheduledAt ? utcToLocalInput(watchedScheduledAt, userTimezone) : ''}
                onChange={(e) => handleScheduledAtChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Times shown in {userTimezone.replace(/_/g, ' ')}
              </p>
              {conflicts && conflicts.length > 0 && (
                <ScheduleConflictBanner conflicts={conflicts} />
              )}
              {rateLimitBlockError && (
                <RateLimitBlockError
                  error={rateLimitBlockError}
                  onRaiseBudget={() => setIsRateLimitDialogOpen(true)}
                />
              )}
            </div>
          )}

          {/* Tags selector */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagSelector
              selected={watchedTagIds}
              onChange={(ids) => form.setValue('tagIds', ids)}
              onManage={() => setIsTagManageOpen(true)}
              tags={tagList ?? []}
            />
          </div>

          {/* Notes textarea */}
          <div className="space-y-2">
            <Label htmlFor="post-notes">Notes</Label>
            <Textarea
              id="post-notes"
              placeholder="Internal notes (not published)..."
              value={watchedNotes}
              onChange={(e) => form.setValue('notes', e.target.value)}
              rows={3}
            />
          </div>

          {/* Spinnable text toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="spinnable-toggle"
              checked={watchedHasSpinnableText}
              onCheckedChange={(checked) => form.setValue('hasSpinnableText', checked)}
            />
            <div>
              <Label htmlFor="spinnable-toggle">Spinnable text</Label>
              <p className="text-xs text-muted-foreground">
                Use {'{'}option1|option2{'}'} syntax. One variant is randomly chosen at publish time.
              </p>
            </div>
          </div>

          {/* Auto-destruct picker */}
          <AutoDestructPicker
            value={watchedAutoDestructAfter}
            onChange={(value) => form.setValue('autoDestructAfter', value)}
          />

          {/* Submit controls */}
          {(() => {
            const disabledReason = getSubmitDisabledReason();
            const scheduleDisabled = isSubmitting || !!disabledReason;

            const submitContent = isQueueMode ? (
              <Button
                onClick={() => validateAndSubmit('queue')}
                disabled={scheduleDisabled}
              >
                {createPostMutation.isPending || addToQueueMutation.isPending
                  ? 'Saving...'
                  : 'Save to Queue'}
              </Button>
            ) : (
              <SplitButton
                onSchedule={() => validateAndSubmit('schedule')}
                onDraft={() => validateAndSubmit('draft')}
                isLoading={createPostMutation.isPending}
                disabled={scheduleDisabled}
              />
            );

            if (disabledReason) {
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span aria-describedby="submit-disabled-reason">
                        {submitContent}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{disabledReason}</p>
                    </TooltipContent>
                  </Tooltip>
                  <span id="submit-disabled-reason" className="sr-only">
                    {disabledReason}
                  </span>
                </TooltipProvider>
              );
            }

            return submitContent;
          })()}
        </div>

        {/* Right column: live preview */}
        <div className="lg:w-[40%]">
          <TweetPreview
            text={previewText}
            profile={previewProfile}
            isThread={isThread}
            tweets={isThread ? tweets : undefined}
          />
        </div>
      </div>

      <TagManagementDialog open={isTagManageOpen} onOpenChange={setIsTagManageOpen} />

      <RateLimitSettingsDialog
        profileId={effectiveProfileId || null}
        handle={selectedProfile?.handle ?? ''}
        open={isRateLimitDialogOpen}
        onOpenChange={setIsRateLimitDialogOpen}
      />
    </main>
  );
}
