import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { DateTime } from 'luxon';
import { toast } from 'sonner';
import { EDITABLE_STATES, PLATFORM_MEDIA_LIMITS, type PostStatus } from '@sms/shared';
import type { Platform } from '../../hooks/use-profiles';
import { useAuth } from '../../hooks/use-auth';
import { useProfiles } from '../../hooks/use-profiles';
import { usePost, useUpdatePost } from '../../hooks/use-posts';
import { useMediaUpload } from '../../hooks/use-media-upload';
import { useDeleteMedia, useRetryTranscode } from '../../hooks/use-media';
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
import { RateLimitSettingsDialog } from '../../components/profiles/RateLimitSettingsDialog';
import type { MediaItem } from '../../components/posts/MediaThumbnail';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';

const URL_REGEX = /^https?:\/\/.+/i;

interface EditFormState {
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

const INITIAL_FORM_STATE: EditFormState = {
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

export default function EditPostPage() {
  const { id: postId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: post, isLoading: isPostLoading, error: postError, refetch } = usePost(postId!);
  const updatePostMutation = useUpdatePost();
  const { data: profiles } = useProfiles();
  const { data: authUser } = useAuth();
  const userTimezone = authUser?.timezone ?? 'UTC';

  const [formState, setFormState] = useState<EditFormState>(INITIAL_FORM_STATE);
  const [tweets, setTweets] = useState<TweetSegment[]>([
    { id: crypto.randomUUID(), text: '' },
  ]);
  const [isTagManageOpen, setIsTagManageOpen] = useState(false);
  const [isFormInitialized, setIsFormInitialized] = useState(false);
  const [isRateLimitDialogOpen, setIsRateLimitDialogOpen] = useState(false);
  const postTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const scheduleInputRef = useRef<HTMLInputElement>(null);
  const [scheduledAtError, setScheduledAtError] = useState<string | null>(null);

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const { upload, uploadingFiles, isUploading } = useMediaUpload();
  const deleteMediaMutation = useDeleteMedia();
  const retryTranscodeMutation = useRetryTranscode();

  const updateForm = useCallback(
    <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => {
      setFormState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Hydrate form state once when the post is loaded.
  useEffect(() => {
    if (post && !isFormInitialized && profiles) {
      const profile = profiles.find((p) => p.id === post.profileId);
      const platform: Platform = profile?.platform ?? 'twitter';
      const postRecord = post as unknown as {
        visibility?: 'PUBLIC' | 'CONNECTIONS' | null;
        linkUrl?: string | null;
      };
      setFormState({
        platform,
        profileId: post.profileId ?? '',
        text: post.isThread ? '' : post.text,
        scheduledAt: post.scheduledAt,
        hasSpinnableText: post.hasSpinnableText,
        autoDestructAfter: post.autoDestructAfter,
        notes: post.notes ?? '',
        tagIds: post.tags.map((t) => t.id),
        visibility: postRecord.visibility ?? 'PUBLIC',
        linkUrl: postRecord.linkUrl ?? '',
        isThread: post.isThread,
      });
      if (post.isThread) {
        setTweets(deserializeThread(post.text));
      } else {
        setTweets([{ id: crypto.randomUUID(), text: '' }]);
      }
      setIsFormInitialized(true);

      const postWithMedia = post as unknown as {
        media?: Array<{
          id: string;
          fileName: string;
          mimeType: string;
          thumbnailUrl: string | null;
          transcodeStatus: string;
          transcodeError: string | null;
        }>;
      };
      if (postWithMedia.media && Array.isArray(postWithMedia.media)) {
        setMediaItems(
          postWithMedia.media.map((m) => ({
            id: m.id,
            fileName: m.fileName,
            mimeType: m.mimeType,
            thumbnailUrl: m.thumbnailUrl,
            transcodeStatus: m.transcodeStatus as MediaItem['transcodeStatus'],
            transcodeError: m.transcodeError,
          })),
        );
      }
    }
  }, [post, profiles, isFormInitialized]);

  const platformLimits = PLATFORM_MEDIA_LIMITS[formState.platform];
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

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!formState.platform || !formState.profileId) return;
      for (const file of files) {
        try {
          const response = await upload(file, formState.profileId, formState.platform);
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
    [formState.platform, formState.profileId, upload],
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

  function getSubmitDisabledReason(): string | null {
    if (hasTranscodingMedia) return 'Video is still transcoding.';
    if (hasFailedMedia) return 'Fix or remove failed media before submitting.';
    if (formState.platform === 'facebook' && formState.linkUrl && !URL_REGEX.test(formState.linkUrl)) {
      return 'Enter a valid http or https URL.';
    }
    return null;
  }

  const hasLinkedProfile = !!post?.profileId;
  const isEditable = post ? hasLinkedProfile && EDITABLE_STATES.includes(post.status as PostStatus) : false;

  const selectedProfile = profiles?.find((p) => p.id === formState.profileId) ?? null;
  const previewProfile = selectedProfile
    ? {
        displayName: selectedProfile.displayName,
        handle: `@${selectedProfile.handle}`,
        avatarUrl: selectedProfile.avatarUrl ?? '',
      }
    : null;

  if (isPostLoading) {
    return (
      <main>
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 lg:max-w-[60%] space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="lg:w-[40%]">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </main>
    );
  }

  if (postError || !post) {
    const isNotFound = postError && 'status' in postError && (postError as { status: number }).status === 404;
    return (
      <main>
        <h1 className="text-2xl font-semibold mb-4">
          {isNotFound ? 'Post not found' : 'Error loading post'}
        </h1>
        <p className="text-muted-foreground mb-4">
          {isNotFound
            ? 'The post you are looking for does not exist or has been deleted.'
            : 'Something went wrong while loading this post.'}
        </p>
        <Button asChild variant="outline">
          <Link to="/posts">Back to Posts</Link>
        </Button>
      </main>
    );
  }

  if (!isEditable) {
    const readOnlySegments = post.isThread
      ? deserializeThread(post.text).map((s) => s.text)
      : [post.text];
    const readOnlyProfile = profiles?.find((p) => p.id === post.profileId);

    return (
      <main>
        <h1 className="text-2xl font-semibold mb-4">View Post</h1>
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-md p-4 mb-6">
          <p className="text-sm text-amber-400">
            This post cannot be edited
            {hasLinkedProfile ? ` because it is in "${post.status}" state.` : ' because its connected profile has been disconnected.'}
            {post.status === 'publishing' && ' It is currently being published.'}
            {post.status === 'published' && ' It has already been published.'}
            {post.status === 'destroyed' && ' It has been destroyed.'}
          </p>
        </div>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 lg:max-w-[60%] space-y-4">
            {readOnlyProfile && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Profile</p>
                <p className="text-sm">{readOnlyProfile.displayName} (@{readOnlyProfile.handle})</p>
              </div>
            )}
            {post.isThread && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Thread ({readOnlySegments.length} tweets)</p>
                {readOnlySegments.map((segment, segmentIndex) => (
                  <div key={segmentIndex} className="border border-border rounded-md p-3 mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Tweet {segmentIndex + 1}</p>
                    <p className="text-sm whitespace-pre-wrap">{segment}</p>
                  </div>
                ))}
              </div>
            )}
            {!post.isThread && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Text</p>
                <p className="text-sm whitespace-pre-wrap">{post.text}</p>
              </div>
            )}
            {post.scheduledAt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Scheduled at</p>
                <p className="text-sm">
                  {DateTime.fromISO(post.scheduledAt, { zone: 'utc' })
                    .setZone(userTimezone)
                    .toFormat('MMM d, yyyy h:mm a')}
                  {' '}({userTimezone.replace(/_/g, ' ')})
                </p>
              </div>
            )}
            {post.notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{post.notes}</p>
              </div>
            )}
            {post.tags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tags</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {post.tags.map((tag) => (
                    <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="lg:w-[40%]">
            <TweetPreview
              text={post.isThread ? '' : post.text}
              profile={readOnlyProfile ? { displayName: readOnlyProfile.displayName, handle: `@${readOnlyProfile.handle}`, avatarUrl: readOnlyProfile.avatarUrl ?? '' } : null}
              isThread={post.isThread}
              tweets={post.isThread ? readOnlySegments.map((segment, segmentIndex) => ({ id: String(segmentIndex), text: segment })) : undefined}
            />
          </div>
        </div>
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link to="/posts">Back to Posts</Link>
          </Button>
        </div>
      </main>
    );
  }

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

  function buildUpdatePayload(action: 'schedule' | 'draft', text: string) {
    const status = action === 'draft' ? ('draft' as const) : ('scheduled' as const);
    const scheduledAt = action === 'schedule' ? formState.scheduledAt : null;
    const base = {
      text,
      status,
      scheduledAt,
      hasSpinnableText: formState.hasSpinnableText,
      autoDestructAfter: formState.autoDestructAfter,
      notes: formState.notes || null,
      tagIds: formState.tagIds,
      mediaIds: mediaItems.map((m) => m.id),
    };

    if (formState.platform === 'twitter') {
      return {
        platform: 'twitter' as const,
        ...base,
        isThread: formState.isThread,
      };
    }
    if (formState.platform === 'linkedin') {
      return {
        platform: 'linkedin' as const,
        ...base,
        visibility: formState.visibility,
      };
    }
    return {
      platform: 'facebook' as const,
      ...base,
      linkUrl: formState.linkUrl ? formState.linkUrl : null,
    };
  }

  function handleSubmit(action: 'schedule' | 'draft') {
    const text = formState.isThread ? serializeThread(tweets) : formState.text;

    if (!text.trim() && mediaItems.length === 0 && !(formState.platform === 'facebook' && formState.linkUrl)) {
      toast.error('Add text, media, or a link before publishing.');
      return;
    }

    if (action === 'schedule') {
      if (!formState.scheduledAt) {
        setScheduledAtError('Select a scheduled time before scheduling.');
        scheduleInputRef.current?.focus();
        toast.error('Please select a scheduled time.');
        return;
      }
      if (DateTime.fromISO(formState.scheduledAt) <= DateTime.utc()) {
        setScheduledAtError('Scheduled time must be in the future.');
        scheduleInputRef.current?.focus();
        toast.error('Scheduled time must be in the future.');
        return;
      }
    }

    if (action !== 'draft' && isMediaBlocking) return;

    updatePostMutation.mutate(
      {
        postId: postId!,
        postInput: buildUpdatePayload(action, text),
        postVersion: post!.postVersion,
      },
      {
        onSuccess: () => {
          toast.success('Post updated.');
          navigate('/posts');
        },
        onError: (error: Error & { status?: number; body?: Record<string, unknown> }) => {
          if (error.status === 409) {
            const code = error.body?.code;
            if (code === 'twitter_budget_exceeded') {
              toast.error(
                `Twitter monthly budget reached (${error.body?.currentCount}/${error.body?.budget}).`,
              );
              return;
            }
            if (code === 'linkedin_rate_limit_exceeded' || code === 'facebook_rate_limit_exceeded') {
              toast.error(
                `${formState.platform === 'linkedin' ? 'LinkedIn' : 'Facebook'} rate limit reached. Save as draft instead.`,
              );
              return;
            }
            if (code === 'platform_immutable') {
              toast.error('Cannot change platform on an existing post.');
              return;
            }
            const errorMsg = String(error.body?.error ?? '');
            if (errorMsg.includes('modified elsewhere')) {
              toast.error('This post was modified elsewhere. Refreshing to show latest version.');
            } else {
              toast.error('This post is currently being published and cannot be edited.');
            }
            refetch();
            setIsFormInitialized(false);
          } else {
            toast.error(error.message || 'Failed to update post.');
          }
        },
      },
    );
  }

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
      <h1 className="text-2xl font-semibold mb-6">Edit Post</h1>
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left column: form */}
        <div className="flex-1 lg:max-w-[60%] space-y-6">
          <RateLimitBanner
            profileId={formState.profileId || null}
            onEditBudget={() => setIsRateLimitDialogOpen(true)}
          />

          {/* ProfilePicker disabled in edit mode — platform locked once persisted (T-DATA-01). */}
          <ProfilePicker
            value={formState.profileId}
            onValueChange={() => { /* disabled in edit mode */ }}
            disabled
          />

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
              disabled={updatePostMutation.isPending || isUploading}
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
                disabled={updatePostMutation.isPending || isUploading}
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
                disabled={updatePostMutation.isPending || isUploading}
              />
            </>
          )}

          {/* SHARED POST-CMN BLOCK (B-03) — every common control lives here */}
          <SharedPostFields
            mode="edit"
            platform={formState.platform}
            userTimezone={userTimezone}
            effectiveProfileId={formState.profileId}
            excludePostId={postId}
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

          {/* SplitButton — Update as primary, Save as Draft in dropdown */}
          {(() => {
            const disabledReason = getSubmitDisabledReason();
            const scheduleDisabled = updatePostMutation.isPending || isUploading || !!disabledReason;

            const submitContent = (
              <SplitButton
                onSchedule={() => handleSubmit('schedule')}
                onDraft={() => handleSubmit('draft')}
                isLoading={updatePostMutation.isPending}
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
        profileId={formState.profileId || null}
        handle={selectedProfile?.handle ?? ''}
        open={isRateLimitDialogOpen}
        onOpenChange={setIsRateLimitDialogOpen}
      />
    </main>
  );
}
