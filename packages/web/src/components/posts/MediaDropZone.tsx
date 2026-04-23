import { useRef, useState, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PLATFORM_MEDIA_LIMITS, type PlatformMediaLimits } from '@sms/shared';

interface MediaDropZoneProps {
  platform: string | null;
  existingMediaCount: number;
  maxFiles: number;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  hasVideo?: boolean;
}

function getPlatformHint(platform: string | null): string {
  if (!platform) return 'Select a profile to see media limits.';
  if (platform === 'twitter') return 'Twitter: up to 4 images (5 MB each) or 1 video (15 MB)';
  if (platform === 'linkedin') return 'LinkedIn: 1 image (20 MB) or 1 video (200 MB)';
  if (platform === 'facebook') return 'Facebook: up to 10 images (5 MB each) or 1 video (100 MB)';
  return 'Select a profile to see media limits.';
}

function getAcceptTypes(limits: PlatformMediaLimits | undefined): string {
  if (!limits) return 'image/*,video/*';
  return [...limits.allowedImageTypes, ...limits.allowedVideoTypes].join(',');
}

function isVideoType(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function validateFiles(
  files: File[],
  platform: string | null,
  existingMediaCount: number,
  hasVideo: boolean,
): File[] {
  if (!platform) {
    toast.error('Select a profile before uploading media.');
    return [];
  }

  const limits = PLATFORM_MEDIA_LIMITS[platform];
  if (!limits) {
    toast.error('Unknown platform. Cannot validate media.');
    return [];
  }

  const validFiles: File[] = [];

  for (const file of files) {
    const isVideo = isVideoType(file.type);
    const isImage = isImageType(file.type);

    if (!isVideo && !isImage) {
      toast.error(`${file.name} is not a supported file type.`);
      continue;
    }

    if (isImage && !limits.allowedImageTypes.includes(file.type)) {
      toast.error(`${file.name} is not a supported file type.`);
      continue;
    }

    if (isVideo && !limits.allowedVideoTypes.includes(file.type)) {
      toast.error(`${file.name} is not a supported file type.`);
      continue;
    }

    if (isImage) {
      const maxSizeBytes = limits.maxImageSizeMb * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        toast.error(`${file.name} exceeds the ${limits.maxImageSizeMb} MB limit.`);
        continue;
      }
    }

    if (isVideo) {
      const maxSizeBytes = limits.maxVideoSizeMb * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        toast.error(`${file.name} exceeds the ${limits.maxVideoSizeMb} MB limit.`);
        continue;
      }
    }

    validFiles.push(file);
  }

  if (validFiles.length === 0) return [];

  const hasNewVideo = validFiles.some((f) => isVideoType(f.type));
  const hasNewImage = validFiles.some((f) => isImageType(f.type));

  if (hasNewVideo && hasNewImage) {
    toast.error('Cannot mix images and video in one post.');
    return [];
  }

  if ((hasNewVideo && existingMediaCount > 0 && !hasVideo) ||
      (hasNewImage && hasVideo)) {
    toast.error('Cannot mix images and video in one post.');
    return [];
  }

  if (hasNewVideo) {
    const totalVideos = (hasVideo ? 1 : 0) + validFiles.filter((f) => isVideoType(f.type)).length;
    if (totalVideos > limits.maxVideos) {
      toast.error(`Maximum of ${limits.maxVideos} files for ${platform}.`);
      return [];
    }
  }

  if (hasNewImage) {
    const totalImages = existingMediaCount + validFiles.filter((f) => isImageType(f.type)).length;
    if (totalImages > limits.maxImages) {
      toast.error(`Maximum of ${limits.maxImages} files for ${platform}.`);
      return [];
    }
  }

  return validFiles;
}

export function MediaDropZone({
  platform,
  existingMediaCount,
  maxFiles,
  onFilesSelected,
  disabled = false,
  hasVideo = false,
}: MediaDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragInvalid, setIsDragInvalid] = useState(false);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const isAtLimit = existingMediaCount >= maxFiles;

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const validFiles = validateFiles(files, platform, existingMediaCount, hasVideo);
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    [platform, existingMediaCount, hasVideo, onFilesSelected],
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isAtLimit) return;

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const limits = platform ? PLATFORM_MEDIA_LIMITS[platform] : null;
      const allTypes = limits
        ? [...limits.allowedImageTypes, ...limits.allowedVideoTypes]
        : [];

      let hasInvalid = false;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && allTypes.length > 0 && items[i].type !== '' && !allTypes.includes(items[i].type)) {
          hasInvalid = true;
          break;
        }
      }

      setIsDragInvalid(hasInvalid);
      setIsDragOver(true);

      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = hasInvalid
          ? 'Unsupported file type'
          : 'File ready to drop';
      }
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsDragInvalid(false);
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = '';
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsDragInvalid(false);
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = '';
    }

    if (disabled || isAtLimit) return;
    handleFiles(e.dataTransfer.files);
  }

  function handleClick() {
    if (disabled || isAtLimit) return;
    fileInputRef.current?.click();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  if (disabled || isAtLimit) return null;

  const limits = platform ? PLATFORM_MEDIA_LIMITS[platform] : undefined;
  const acceptTypes = getAcceptTypes(limits);
  const hasExistingFiles = existingMediaCount > 0;

  const borderClass = isDragInvalid
    ? 'border-destructive border-solid'
    : isDragOver
      ? 'border-primary border-solid'
      : 'border-border border-dashed';

  const bgClass = isDragInvalid
    ? 'bg-destructive/5'
    : isDragOver
      ? 'bg-primary/5'
      : 'bg-card/50';

  const dragText = isDragInvalid
    ? 'Unsupported file type'
    : isDragOver
      ? 'Drop to upload'
      : null;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload media files"
        className={`border-2 ${borderClass} rounded-lg ${bgClass} cursor-pointer transition-colors ${
          hasExistingFiles ? 'p-4 flex items-center gap-2' : 'p-8 flex flex-col items-center justify-center'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {hasExistingFiles ? (
          <>
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {dragText ?? 'Add more files'}
            </span>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {dragText ?? 'Drop files or click to upload'}
            </p>
            {!dragText && (
              <p className="text-xs mt-1 text-muted-foreground">Images, GIFs, or video</p>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        {getPlatformHint(platform)}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptTypes}
        multiple
        className="hidden"
        onChange={handleInputChange}
        tabIndex={-1}
      />

      <div ref={liveRegionRef} aria-live="polite" className="sr-only" />
    </div>
  );
}
