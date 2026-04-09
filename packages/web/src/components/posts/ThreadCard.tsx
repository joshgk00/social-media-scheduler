import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Card } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { CharacterCountRing } from './CharacterCountRing';

interface ThreadCardProps {
  id: string;
  index: number;
  total: number;
  text: string;
  onTextChange: (text: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function ThreadCard({
  id,
  index,
  total,
  text,
  onTextChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ThreadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: prefersReducedMotion ? undefined : transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            {...listeners}
            aria-roledescription="sortable"
            aria-label={`Drag to reorder tweet ${index + 1} of ${total}`}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground">
            {index + 1}/{total}
          </span>
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isFirst}
              onClick={onMoveUp}
              aria-label="Move tweet up"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isLast}
              onClick={onMoveDown}
              aria-label="Move tweet down"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <Textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          placeholder="What's happening?"
          className="resize-none"
          aria-label={`Tweet ${index + 1} text`}
        />
        <div className="flex items-center justify-between mt-2">
          <CharacterCountRing text={text} size="sm" />
          {total > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label="Remove tweet"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
