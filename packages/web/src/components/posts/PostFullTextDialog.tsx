import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { deserializeThread } from '../../lib/thread';

interface PostFullTextDialogProps {
  post: { text: string; isThread: boolean } | null;
  onOpenChange: (open: boolean) => void;
}

export function PostFullTextDialog({ post, onOpenChange }: PostFullTextDialogProps) {
  const isOpen = post !== null;
  const tweets = post?.isThread ? deserializeThread(post.text) : null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Full Post Text</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {post && !post.isThread && (
            <p className="text-sm whitespace-pre-wrap select-text">{post.text}</p>
          )}

          {post && post.isThread && tweets && (
            <div className="space-y-3">
              {tweets.map((tweet, tweetIndex) => (
                <div
                  key={tweet.id}
                  className="rounded-md border border-border p-3"
                >
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    Tweet {tweetIndex + 1}
                  </p>
                  <p className="text-sm whitespace-pre-wrap select-text">{tweet.text}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
