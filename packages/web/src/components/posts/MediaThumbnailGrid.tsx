import { useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMediaStatus } from '../../hooks/use-media';
import { MediaThumbnail, type MediaItem } from './MediaThumbnail';
import type { UploadFileState } from '../../hooks/use-media-upload';

interface MediaThumbnailGridProps {
  mediaItems: MediaItem[];
  uploadingFiles: Map<string, UploadFileState>;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onRetryTranscode: (id: string) => void;
  readOnly: boolean;
}

interface SortableMediaItemProps {
  media: MediaItem;
  uploadProgress?: number;
  isUploading: boolean;
  onRemove: () => void;
  onRetryTranscode: () => void;
  showDragHandle: boolean;
  readOnly: boolean;
}

function SortableMediaItem({
  media,
  uploadProgress,
  isUploading,
  onRemove,
  onRetryTranscode,
  showDragHandle,
  readOnly,
}: SortableMediaItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: media.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-50 ring-2 ring-primary rounded-md' : ''}
    >
      <MediaThumbnail
        media={media}
        uploadProgress={uploadProgress}
        isUploading={isUploading}
        onRemove={onRemove}
        onRetryTranscode={onRetryTranscode}
        showDragHandle={showDragHandle}
        readOnly={readOnly}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  );
}

function MediaStatusPoller({
  mediaId,
  onStatusUpdate,
}: {
  mediaId: string;
  onStatusUpdate: (mediaId: string, status: string, error: string | null) => void;
}) {
  const shouldPoll = true;
  const { data } = useMediaStatus(mediaId, shouldPoll);

  useEffect(() => {
    if (data) {
      onStatusUpdate(mediaId, data.transcodeStatus, data.transcodeError);
    }
  }, [data, mediaId, onStatusUpdate]);

  return null;
}

export function MediaThumbnailGrid({
  mediaItems,
  uploadingFiles,
  onRemove,
  onReorder,
  onRetryTranscode,
  readOnly,
}: MediaThumbnailGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleStatusUpdate = useCallback(
    (_mediaId: string, _status: string, _error: string | null) => {
      // Status updates are received via TanStack Query cache.
      // The parent component handles state updates when media status changes
      // through the polling mechanism.
    },
    [],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = mediaItems.findIndex((m) => m.id === active.id);
      const newIndex = mediaItems.findIndex((m) => m.id === over.id);
      const reordered = arrayMove(mediaItems, oldIndex, newIndex);
      onReorder(reordered.map((m) => m.id));
    }
  }

  const showDragHandles = mediaItems.length > 1 && !readOnly;

  const pollingMediaIds = mediaItems
    .filter(
      (m) =>
        m.transcodeStatus === 'pending' || m.transcodeStatus === 'processing',
    )
    .map((m) => m.id);

  return (
    <div>
      {pollingMediaIds.map((mediaId) => (
        <MediaStatusPoller
          key={mediaId}
          mediaId={mediaId}
          onStatusUpdate={handleStatusUpdate}
        />
      ))}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={mediaItems.map((m) => m.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {mediaItems.map((media) => {
              const uploadState = uploadingFiles.get(media.id);
              return (
                <SortableMediaItem
                  key={media.id}
                  media={media}
                  uploadProgress={uploadState?.progress}
                  isUploading={uploadState?.status === 'uploading'}
                  onRemove={() => onRemove(media.id)}
                  onRetryTranscode={() => onRetryTranscode(media.id)}
                  showDragHandle={showDragHandles}
                  readOnly={readOnly}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
