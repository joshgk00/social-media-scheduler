import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card } from '../ui/card';

interface TweetPreviewProps {
  text: string;
  profile: { displayName: string; handle: string; avatarUrl: string } | null;
  isThread: boolean;
  tweets?: Array<{ id: string; text: string }>;
  mediaFiles?: Array<{ url: string; type: string }>;
}

interface TweetCardProps {
  text: string;
  profile: TweetPreviewProps['profile'];
  isFirst: boolean;
  showThread?: boolean;
  mediaFiles?: Array<{ url: string; type: string }>;
}

function TweetCard({ text, profile, isFirst: _isFirst, showThread, mediaFiles }: TweetCardProps) {
  const displayName = profile?.displayName ?? 'Select a profile';
  const handle = profile?.handle ?? '@username';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div>
      <Card className="bg-card border-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            {profile?.avatarUrl && (
              <AvatarImage src={profile.avatarUrl} alt={displayName} />
            )}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold truncate">{displayName}</span>
              <span className="text-sm text-muted-foreground truncate">{handle}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words mt-1">
              {text || <span className="text-muted-foreground italic">Your tweet preview will appear here...</span>}
            </p>
            {mediaFiles && mediaFiles.length > 0 && (
              <div className={`grid gap-1 mt-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {mediaFiles.map((file, fileIndex) => (
                  <div key={fileIndex} className="relative rounded-lg overflow-hidden bg-muted aspect-video">
                    {file.type.startsWith('image') ? (
                      <img
                        src={file.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        Video
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
      {showThread && (
        <div className="border-l-2 border-border ml-4 h-4" />
      )}
    </div>
  );
}

/**
 * Live Twitter-style preview. This is a structural approximation only --
 * not pixel-perfect Twitter rendering. Shows the rough shape of how a tweet
 * will appear: avatar, name, text, and thread connector.
 */
export function TweetPreview({ text, profile, isThread, tweets, mediaFiles }: TweetPreviewProps) {
  return (
    <div className="sticky top-6">
      <h3 className="text-sm font-semibold mb-4">Preview</h3>

      {isThread && tweets ? (
        <div className="space-y-0">
          {tweets.map((tweet, tweetIndex) => (
            <TweetCard
              key={tweet.id}
              text={tweet.text}
              profile={profile}
              isFirst={tweetIndex === 0}
              showThread={tweetIndex < tweets.length - 1}
              mediaFiles={tweetIndex === 0 ? mediaFiles : undefined}
            />
          ))}
        </div>
      ) : (
        <TweetCard
          text={text}
          profile={profile}
          isFirst={true}
          mediaFiles={mediaFiles}
        />
      )}
    </div>
  );
}
