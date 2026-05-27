import { Loader2, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface SplitButtonProps {
  onPrimary: () => void;
  onDraft: () => void;
  onPublishNow?: () => void;
  primaryLabel?: string;
  isLoading: boolean;
  disabled: boolean;
}

export function SplitButton({
  onPrimary,
  onDraft,
  onPublishNow,
  primaryLabel = 'Schedule Post',
  isLoading,
  disabled,
}: SplitButtonProps) {
  return (
    <div className="flex">
      <Button
        onClick={onPrimary}
        disabled={disabled || isLoading}
        className="rounded-r-none"
      >
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {primaryLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={disabled || isLoading}
            className="rounded-l-none border-l border-primary-foreground/20 px-2"
            aria-label="More options"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onDraft}>Save as Draft</DropdownMenuItem>
          {onPublishNow && (
            <DropdownMenuItem onClick={onPublishNow}>Publish Now</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
