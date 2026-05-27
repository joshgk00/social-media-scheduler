import type { ReactNode } from 'react';
import type { Platform } from '../../hooks/use-profiles';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { SplitButton } from './SplitButton';

const URL_REGEX = /^https?:\/\/.+/i;
export const INVALID_POST_LINK_URL_MESSAGE = 'Enter a valid http or https URL.';

export function isPostLinkUrlValid(linkUrl: string) {
  return URL_REGEX.test(linkUrl);
}

export function getPostSubmitDisabledReason({
  hasTranscodingMedia,
  hasFailedMedia,
  platform,
  linkUrl,
}: {
  hasTranscodingMedia: boolean;
  hasFailedMedia: boolean;
  platform: Platform;
  linkUrl: string;
}): string | null {
  if (hasTranscodingMedia) return 'Video is still transcoding.';
  if (hasFailedMedia) return 'Fix or remove failed media before submitting.';
  if (platform === 'facebook' && linkUrl && !isPostLinkUrlValid(linkUrl)) {
    return INVALID_POST_LINK_URL_MESSAGE;
  }
  return null;
}

type PostSubmitActionsProps = {
  disabled: boolean;
  disabledReason: string | null;
} & (
  | {
      mode: 'queue';
      isSaving: boolean;
      onSubmit: () => void;
    }
  | {
      mode: 'split';
      isLoading: boolean;
      onDraft: () => void;
      onPrimary: () => void;
      primaryLabel?: string;
    }
);

export function PostSubmitActions(props: PostSubmitActionsProps) {
  const disabled = props.disabled || !!props.disabledReason;
  const submitContent = props.mode === 'queue' ? (
    <Button onClick={props.onSubmit} disabled={disabled}>
      {props.isSaving ? 'Saving...' : 'Save to Queue'}
    </Button>
  ) : (
    <SplitButton
      onPrimary={props.onPrimary}
      onDraft={props.onDraft}
      primaryLabel={props.primaryLabel}
      isLoading={props.isLoading}
      disabled={disabled}
    />
  );

  return (
    <SubmitDisabledTooltip disabledReason={props.disabledReason}>
      {submitContent}
    </SubmitDisabledTooltip>
  );
}

function SubmitDisabledTooltip({
  disabledReason,
  children,
}: {
  disabledReason: string | null;
  children: ReactNode;
}) {
  if (!disabledReason) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span aria-describedby="submit-disabled-reason">
            {children}
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
