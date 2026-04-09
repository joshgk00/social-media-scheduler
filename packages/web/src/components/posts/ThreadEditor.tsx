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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { ThreadCard } from './ThreadCard';
import type { TweetSegment } from '../../lib/thread';

const MAX_THREAD_TWEETS = 25;

interface ThreadEditorProps {
  tweets: TweetSegment[];
  onChange: (tweets: TweetSegment[]) => void;
}

export function ThreadEditor({ tweets, onChange }: ThreadEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tweets.findIndex((t) => t.id === active.id);
      const newIndex = tweets.findIndex((t) => t.id === over.id);
      onChange(arrayMove(tweets, oldIndex, newIndex));
    }
  }

  function addTweet() {
    if (tweets.length >= MAX_THREAD_TWEETS) return;
    onChange([...tweets, { id: crypto.randomUUID(), text: '' }]);
  }

  function removeTweet(id: string) {
    if (tweets.length <= 1) return;
    onChange(tweets.filter((t) => t.id !== id));
  }

  function updateTweetText(id: string, text: string) {
    onChange(tweets.map((t) => (t.id === id ? { ...t, text } : t)));
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    onChange(arrayMove(tweets, index, index - 1));
  }

  function moveDown(index: number) {
    if (index >= tweets.length - 1) return;
    onChange(arrayMove(tweets, index, index + 1));
  }

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tweets.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tweets.map((tweet, index) => (
            <ThreadCard
              key={tweet.id}
              id={tweet.id}
              index={index}
              total={tweets.length}
              text={tweet.text}
              onTextChange={(text) => updateTweetText(tweet.id, text)}
              onRemove={() => removeTweet(tweet.id)}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              isFirst={index === 0}
              isLast={index === tweets.length - 1}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button
        variant="outline"
        size="sm"
        onClick={addTweet}
        disabled={tweets.length >= MAX_THREAD_TWEETS}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add tweet
      </Button>
    </div>
  );
}
