import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { DateTime } from 'luxon';
import { toast } from 'sonner';
import { PLATFORM_MEDIA_LIMITS } from '@sms/shared';
import type { Platform } from '../../hooks/use-profiles';
import { useAuth } from '../../hooks/use-auth';
import { useProfiles } from '../../hooks/use-profiles';
import { useCreatePost } from '../../hooks/use-posts';
import { useQueue } from '../../hooks/use-queues';
import { useAddToQueue } from '../../hooks/use-queue-posts';
import { useMediaUpload } from '../../hooks/use-media-upload';
import { useDeleteMedia, useRetryTranscode } from '../../hooks/use-media';
import { applyPlatformSwitch } from '../../lib/apply-platform-switch';
import { serializeThread, deserializeThread, type TweetSegment } from '../../lib/thread';
import { ProfilePicker } from '../../components/posts/ProfilePicker';
import { SharedPostFields } from '../../components/posts/SharedPostFields';
import { TwitterPostFields } from '../../components/posts/TwitterPostFields';
import { LinkedInPostFields } from '../../components/posts/LinkedInPostFields';
import { FacebookPostFields } from '../../components/posts/FacebookPostFields';
import { TweetPreview } from '../../components/posts/TweetPreview';
import { LinkedInPreview } from '../../components/posts/LinkedInPreview';
import { FacebookPreview } from '../../components/posts/FacebookPreview';
import { CharacterCountRing } from '../../components/posts/CharacterCountRing';
import { SplitButton } from '../../components/posts/SplitButton';
import { TagManagementDialog } from '../../components/posts/TagManagementDialog';
import { RateLimitBanner } from '../../components/posts/RateLimitBanner';
import { RateLimitBlockError, type RateLimitBlockErrorDetail } from '../../components/posts/RateLimitBlockError';
import { RateLimitSettingsDialog } from '../../components/profiles/RateLimitSettingsDialog';
import type { MediaItem } from '../../components/posts/MediaThumbnail';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';

const SPINNABLE_PATTERN = /\{[^{}|]+\|[^{}|]+\}/;
const URL_REGEX = /^https?:\/\/.+/i;

interface PostFormState {
  platform: Platform;
  profileId: string;
  text: string;
  scheduledAt: string | null;
  hasSpinnableText: boolean;
  autoDestructAfter: string | null;
  notes: string;
  tagIds: string[];
  visibility: 'PUBLIC' | 'CONNECTIONS';
  linkUrl: string;
  isThread: boolean;
}

const INITIAL_FORM_STATE: PostFormState = {
  platform: 'twitter',
  profileId: '',
  text: '',
  scheduledAt: null,
  hasSpinnableText: false,
  autoDestructAfter: null,
  notes: '',
  tagIds: [],
  visibility: 'PUBLIC',
  linkUrl: '',
  isThread: false,
};

export default function NewPostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queueId = searchParams.get('queueId');
  const scheduledAtParam = searchParams.get('scheduledAt');
  const isQueueMode = !!queueId;

  const { data: authUser } = useAuth();
  const userTimezone = authUser?.timezone ?? 'UTC';
  const { data: profiles } = useProfiles();
  const createPostMutation = useCreatePost();
  const { data: queueData } = useQueue(queueId ?? '');
  const addToQueueMutation = useAddToQueue(queueId ?? '');

  const [formState, setFormState] = useState<PostFormState>(INITIAL_FORM_STATE);
  const [tweets, setTweets] = useState<TweetSegment[]>([
    { id: crypto.randomUUID(), text: '' },
  ]);
  const [isTagManageOpen, setIsTagManageOpen] = useState(false);
  const [rateLimitBlockError, setRateLimitBlockError] = useState<RateLimitBlockErrorDetail | null>(null);
  const [isRateLimitDialogOpen, setIsRateLimitDialogOpen] = useState(false);
  const postTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const scheduleInputRef = useRef<HTMLInputElement>(null);
  const [scheduledAtError, setScheduledAtError] = useState<string | null>(null);

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const { upload, uploadingFiles, isUploading } = useMediaUpload();
  const deleteMediaMutation = useDeleteMedia();
  const retryTranscodeMutation = useRetryTranscode();

  const updateForm = useCallback(<K extends keyof PostFormState>(key: K, value: PostFormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Auto-enable spinnable detection on text change.
  useEffect(() => {
    const hasSpinSyntax = SPINNABLE_PATTERN.test(formState.text);
    if (hasSpinSyntax && !formState.hasSpinnableText) {
      setFormState((prev) => ({ ...prev, hasSpinnableText: true }));
    }
  }, [formState.text, formState.hasSpinnableText]);

  useEffect(() => {
    if (queueId || !scheduledAtParam || formState.scheduledAt) return;
    if (!DateTime.fromISO(scheduledAtParam).isValid) return;
    updateForm('scheduledAt', scheduledAtParam);
  }, [formState.scheduledAt, queueId, scheduledAtParam, updateForm]);

  const effectiveProfileId = isQueueMode ? (queueData?.profileId ?? '') : formState.profileId;
  const selectedProfile = profiles?.find((p) => p.id === effectiveProfileId) ?? null;
  const platform = selectedProfile?.platform ?? formState.platform;

  const platformLimits = PLATFORM_MEDIA_LIMITS[platform];
  const maxFilesForPlatform = (() => {
    if (!platformLimits) return 4;
    const hasVideo = mediaItems.some((m) => m.mimeType.startsWith('video/'));
    return hasVideo ? platformLimits.maxVideos : platformLimits.maxImages;
  })();

  const hasTranscodingMedia = mediaItems.some(
    (m) => m.transcodeStatus === 'pending' || m.transcodeStatus === 'processing',
  );
  const hasFailedMedia = mediaItems.some((m) => m.transcodeStatus === 'failed');
  const isMediaBlocking = hasTranscodingMedia || hasFailedMedia;

  function handleProfileChange(profileId: string, newPlatform: Platform) {
    const oldPlatform = formState.platform;
    const result = applyPlatformSwitch(oldPlatform, newPlatform, {
      text: formState.text,
      visibility: formState.visibility,
      linkUrl: formState.linkUrl ? formState.linkUrl : null,
      isThread: formState.isThread,
      threadContinuation: formState.isThread ? serializeThread(tweets) : '',
      mediaIds: mediaItems.map((m) => m.id),
    });
    setFormState((prev) => ({
      ...prev,
      profileId,
      platform: newPlatform,
      text: result.state.text,
      visibility: result.state.visibility ?? 'PUBLIC',
      linkUrl: result.state.linkUrl ?? '',
      isThread: result.state.isThread ?? false,
      autoDestructAfter: newPlatform === 'twitter' ? prev.autoDestructAfter : null,
    }));
    if (result.state.mediaIds.length !== mediaItems.length) {
      const keepIds = new Set(result.state.mediaIds);
      setMediaItems((prev) => prev.filter((m) => keepIds.has(m.id)));
    }
    if (!result.state.isThread) {
      setTweets([{ id: crypto.randomUUID(), text: result.state.text }]);
    }
    if (result.toast) toast.info(result.toast);
  }

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!platform) return;
      for (const file of files) {
        try {
          const response = await upload(file, effectiveProfileId, platform);
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
    [effectiveProfileId, platform, upload],
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

  const handleMediaStatusUpdate = useCallback(
    (
      mediaId: string,
      status: MediaItem['transcodeStatus'],
      error: string | null,
    ) => {
      setMediaItems((prev) =>
        prev.map((m) => {
          if (m.id !== mediaId) return m;
          if (m.transcodeStatus === status && m.transcodeError === error) {
            return m;
          }
          return { ...m, transcodeStatus: status, transcodeError: error };
        }),
      );
    },
    [],
  );

  function handleThreadToggle(checked: boolean) {
    if (checked) {
      const currentText = formState.text;
      if (currentText.includes('[[tweet]]')) {
        setTweets(deserializeThread(currentText));
      } else {
        setTweets([{ id: crypto.randomUUID(), text: currentText }]);
      }
    } else {
      updateForm('text', serializeThread(tweets));
    }
    updateForm('isThread', checked);
  }

  function handleScheduledAtChange(utcIso: string | null, wasAdjusted: boolean) {
    updateForm('scheduledAt', utcIso);
    setScheduledAtError(null);
    if (utcIso && wasAdjusted) {
      const adjustedLocal = DateTime.fromISO(utcIso).setZone(userTimezone).toFormat('h:mm a');
      toast.info(`Adjusted to ${adjustedLocal} due to daylight saving time change.`);
    }
  }

  const previewProfile = selectedProfile
    ? {
        displayName: selectedProfile.displayName,
        handle: `@${selectedProfile.handle}`,
        avatarUrl: selectedProfile.avatarUrl ?? '',
      }
    : null;

  function getSubmitText(): string {
    return formState.isThread ? serializeThread(tweets) : formState.text;
  }

  const isSubmitting = createPostMutation.isPending || addToQueueMutation.isPending || isUploading;

  function getSubmitDisabledReason(): string | null {
    if (hasTranscodingMedia) return 'Video is still transcoding.';
    if (hasFailedMedia) return 'Fix or remove failed media before submitting.';
    if (formState.platform === 'facebook' && formState.linkUrl && !URL_REGEX.test(formState.linkUrl)) {
      return 'Enter a valid http or https URL.';
    }
    return null;
  }

  function buildBasePayload(text: string) {
    return {
      profileId: formState.profileId,
      text,
      hasSpinnableText: formState.hasSpinnableText,
      autoDestructAfter: formState.autoDestructAfter,
      notes: formState.notes || null,
      tagIds: formState.tagIds,
      mediaIds: mediaItems.map((m) => m.id),
    };
  }

  function buildPlatformPayload(action: 'schedule' | 'draft', text: string) {
    const base = buildBasePayload(text);
    const status = action === 'draft' ? ('draft' as const) : ('scheduled' as const);
    const scheduledAt = action === 'schedule' ? formState.scheduledAt ?? undefined : undefined;

    if (formState.platform === 'twitter') {
      return {
        platform: 'twitter' as const,
        ...base,
        status,
        scheduledAt,
        isThread: formState.isThread,
      };
    }
    if (formState.platform === 'linkedin') {
      return {
        platform: 'linkedin' as const,
        ...base,
        status,
        scheduledAt,
        visibility: formState.visibility,
      };
    }
    return {
      platform: 'facebook' as const,
      ...base,
      status,
      scheduledAt,
      linkUrl: formState.linkUrl ? formState.linkUrl : null,
    };
  }

  function validateAndSubmit(action: 'schedule' | 'draft' | 'queue') {
    const text = getSubmitText();
    const profileId = isQueueMode ? queueData?.profileId : formState.profileId;

    if (action === 'queue') {
      if (!text.trim() && mediaItems.length === 0) {
        toast.error('Add text or media before saving.');
        return;
      }
    } else {
      if (!profileId) {
        toast.error('Please select a profile.');
        return;
      }
      if (!text.trim() && mediaItems.length === 0 && !(formState.platform === 'facebook' && formState.linkUrl)) {
        toast.error('Add text, media, or a link before publishing.');
        return;
      }
    }

    if (action === 'schedule') {
      const scheduledAt = formState.scheduledAt;
      if (!scheduledAt) {
        setScheduledAtError('Select a scheduled time before scheduling.');
        scheduleInputRef.current?.focus();
        toast.error('Please select a scheduled time.');
        return;
      }
      if (DateTime.fromISO(scheduledAt) <= DateTime.utc()) {
        setScheduledAtError('Scheduled time must be in the future.');
        scheduleInputRef.current?.focus();
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
    // Queue posts always save as draft regardless of platform; queue cadence
    // promotes them to scheduled at runtime.
    const draftPayload = (() => {
      const payload = buildPlatformPayload('draft', text);
      // Override profileId with queue's profile.
      return { ...payload, profileId: queueData.profileId };
    })();

    createPostMutation.mutate(draftPayload, {
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
      onError: handleSubmitError,
    });
  }

  function submitPost(action: 'schedule' | 'draft', text: string) {
    setRateLimitBlockError(null);
    const payload = buildPlatformPayload(action, text);

    createPostMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(action === 'draft' ? 'Draft saved.' : 'Post scheduled.');
        navigate('/posts');
      },
      onError: handleSubmitError,
    });
  }

  function handleSubmitError(
    error: Error & { status?: number; body?: Record<string, unknown> },
  ) {
    if (error.status === 409) {
      const code = error.body?.code;
      if (code === 'twitter_budget_exceeded') {
        setRateLimitBlockError({
          code: 'twitter_budget_exceeded',
          budget: Number(error.body?.budget ?? 0),
          currentCount: Number(error.body?.currentCount ?? 0),
        });
        return;
      }
      if (code === 'linkedin_rate_limit_exceeded' || code === 'facebook_rate_limit_exceeded') {
        toast.error(
          `${formState.platform === 'linkedin' ? 'LinkedIn' : 'Facebook'} rate limit reached. Save as draft instead.`,
        );
        return;
      }
    }
    toast.error(error.message || 'Failed to create post.');
  }

  // Derive the preview text. Threads are rendered via TweetPreview's threading
  // UI rather than a single text block, so we pass empty text in that branch.
  const previewText = formState.isThread ? '' : formState.text;
  const previewMediaFiles = mediaItems.map((m) => ({
    url: m.thumbnailUrl ?? '',
    type: m.mimeType,
  }));
  const previewImageUrls = mediaItems
    .filter((m) => m.mimeType.startsWith('image/'))
    .map((m) => m.thumbnailUrl ?? '');
  const previewVideoUrl = mediaItems.find((m) => m.mimeType.startsWith('video/'))?.thumbnailUrl ?? null;

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
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

          {/* ProfilePicker drives platform selection (D-04). */}
          {!isQueueMode && (
            <ProfilePicker
              value={formState.profileId}
              onValueChange={handleProfileChange}
            />
          )}

          {/* Platform-specific subform */}
          {formState.platform === 'twitter' && (
            <TwitterPostFields
              text={formState.text}
              onTextChange={(value) => updateForm('text', value)}
              textareaRef={postTextAreaRef}
              isThread={formState.isThread}
              onThreadToggle={handleThreadToggle}
              tweets={tweets}
              onTweetsChange={setTweets}
              mediaItems={mediaItems}
              uploadingFiles={uploadingFiles}
              maxFiles={maxFilesForPlatform}
              onFilesSelected={handleFilesSelected}
              onRemoveMedia={handleRemoveMedia}
              onReorderMedia={handleReorderMedia}
              onRetryTranscode={handleRetryTranscode}
              onMediaStatusUpdate={handleMediaStatusUpdate}
              disabled={isSubmitting}
            />
          )}
          {formState.platform === 'linkedin' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="post-text">Post text</Label>
                <div className="relative">
                  <Textarea
                    id="post-text"
                    ref={postTextAreaRef}
                    placeholder="Share something with your network..."
                    value={formState.text}
                    onChange={(event) => updateForm('text', event.target.value)}
                    rows={5}
                  />
                  <div className="absolute bottom-2 right-2">
                    <CharacterCountRing text={formState.text} platform="linkedin" />
                  </div>
                </div>
              </div>
              <LinkedInPostFields
                visibility={formState.visibility}
                onVisibilityChange={(value) => updateForm('visibility', value)}
                mediaItems={mediaItems}
                uploadingFiles={uploadingFiles}
                onFilesSelected={handleFilesSelected}
                onRemoveMedia={handleRemoveMedia}
                onReorderMedia={handleReorderMedia}
                onRetryTranscode={handleRetryTranscode}
                onMediaStatusUpdate={handleMediaStatusUpdate}
                disabled={isSubmitting}
              />
            </>
          )}
          {formState.platform === 'facebook' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="post-text">Post text</Label>
                <div className="relative">
                  <Textarea
                    id="post-text"
                    ref={postTextAreaRef}
                    placeholder="What's on your mind?"
                    value={formState.text}
                    onChange={(event) => updateForm('text', event.target.value)}
                    rows={5}
                  />
                  <div className="absolute bottom-2 right-2">
                    <CharacterCountRing text={formState.text} platform="facebook" />
                  </div>
                </div>
              </div>
              <FacebookPostFields
                linkUrl={formState.linkUrl}
                onLinkUrlChange={(value) => updateForm('linkUrl', value)}
                linkUrlError={
                  formState.linkUrl && !URL_REGEX.test(formState.linkUrl)
                    ? 'Enter a valid http or https URL.'
                    : null
                }
                mediaItems={mediaItems}
                uploadingFiles={uploadingFiles}
                onFilesSelected={handleFilesSelected}
                onRemoveMedia={handleRemoveMedia}
                onReorderMedia={handleReorderMedia}
                onRetryTranscode={handleRetryTranscode}
                onMediaStatusUpdate={handleMediaStatusUpdate}
                disabled={isSubmitting}
              />
            </>
          )}

          {/* SHARED POST-CMN BLOCK (B-03) — every common control lives here */}
          <SharedPostFields
            mode={isQueueMode ? 'queue' : 'new'}
            platform={platform}
            userTimezone={userTimezone}
            effectiveProfileId={effectiveProfileId}
            scheduledAt={formState.scheduledAt}
            onScheduledAtChange={handleScheduledAtChange}
            scheduledAtError={scheduledAtError}
            scheduleInputRef={scheduleInputRef}
            tagIds={formState.tagIds}
            onTagIdsChange={(ids) => updateForm('tagIds', ids)}
            onOpenTagManagement={() => setIsTagManageOpen(true)}
            notes={formState.notes}
            onNotesChange={(value) => updateForm('notes', value)}
            hasSpinnableText={formState.hasSpinnableText}
            onHasSpinnableTextChange={(value) => updateForm('hasSpinnableText', value)}
            autoDestructAfter={formState.autoDestructAfter}
            onAutoDestructAfterChange={(value) => updateForm('autoDestructAfter', value)}
            textareaRef={postTextAreaRef}
            onInsertSnippet={(nextValue) => updateForm('text', nextValue)}
          />

          {rateLimitBlockError && (
            <RateLimitBlockError
              error={rateLimitBlockError}
              onRaiseBudget={() => setIsRateLimitDialogOpen(true)}
            />
          )}

          {/* POST-CMN-06: Save as Draft is delivered by SplitButton's draft option. */}
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
          {formState.platform === 'twitter' && (
            <TweetPreview
              text={previewText}
              profile={previewProfile}
              isThread={formState.isThread}
              tweets={formState.isThread ? tweets : undefined}
              mediaFiles={previewMediaFiles}
            />
          )}
          {formState.platform === 'linkedin' && (
            <LinkedInPreview
              text={formState.text}
              visibility={formState.visibility}
              profileName={selectedProfile?.displayName}
              profileAvatarUrl={selectedProfile?.avatarUrl}
              imageUrl={previewImageUrls[0] ?? null}
              scheduledAt={formState.scheduledAt}
            />
          )}
          {formState.platform === 'facebook' && (
            <FacebookPreview
              text={formState.text}
              imageUrls={previewImageUrls}
              linkUrl={formState.linkUrl ? formState.linkUrl : null}
              videoUrl={previewVideoUrl}
              profileName={selectedProfile?.displayName}
              profileAvatarUrl={selectedProfile?.avatarUrl}
              scheduledAt={formState.scheduledAt}
            />
          )}
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
