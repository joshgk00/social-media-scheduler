import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProfileSchema, type CreateProfileInput } from '@sms/shared';
import { AlertCircle, Eye, EyeOff, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateProfile, type Platform } from '../../hooks/use-profiles';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '../ui/form';
import { IconButton } from '../ui/icon';
import { PlatformGlyph } from '../ui/platform-glyph';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';

interface ConnectProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConnectPlatform = Platform;
type CredentialField = 'consumerKey' | 'consumerSecret' | 'accessToken' | 'accessTokenSecret';

const platformTabs: Array<{ value: ConnectPlatform; label: string }> = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'twitter', label: 'Twitter / X' },
];

const credentialFields: Array<{
  name: CredentialField;
  label: string;
}> = [
  { name: 'consumerKey', label: 'Consumer Key (API Key)' },
  { name: 'consumerSecret', label: 'Consumer Secret (API Secret)' },
  { name: 'accessToken', label: 'Access Token' },
  { name: 'accessTokenSecret', label: 'Access Token Secret' },
];

function oauthCopy(platform: Exclude<ConnectPlatform, 'twitter'>) {
  if (platform === 'linkedin') {
    return {
      platformLabel: 'LinkedIn',
      body: "You'll be redirected to LinkedIn to sign in. After signing in, pick a Personal Profile or Company Page to post as.",
      action: 'Sign in with LinkedIn',
      href: '/api/oauth/start/linkedin?returnTo=/profiles',
    };
  }

  return {
    platformLabel: 'Facebook',
    body: "You'll be redirected to Facebook to sign in. After signing in, pick which Page you want to post to.",
    action: 'Sign in with Facebook',
    href: '/api/oauth/start/facebook?returnTo=/profiles',
  };
}

export function ConnectProfileDialog({ open, onOpenChange }: ConnectProfileDialogProps) {
  const createProfile = useCreateProfile();
  const [activePlatform, setActivePlatform] = useState<ConnectPlatform>('linkedin');
  const [visibleFields, setVisibleFields] = useState<Record<CredentialField, boolean>>({
    consumerKey: false,
    consumerSecret: false,
    accessToken: false,
    accessTokenSecret: false,
  });

  const form = useForm<CreateProfileInput>({
    resolver: zodResolver(createProfileSchema),
    defaultValues: {
      platform: 'twitter',
      consumerKey: '',
      consumerSecret: '',
      accessToken: '',
      accessTokenSecret: '',
    },
  });

  function resetDialog() {
    form.reset();
    createProfile.reset();
    setActivePlatform('linkedin');
    setVisibleFields({
      consumerKey: false,
      consumerSecret: false,
      accessToken: false,
      accessTokenSecret: false,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  }

  function toggleFieldVisibility(fieldName: CredentialField) {
    setVisibleFields((previous) => ({
      ...previous,
      [fieldName]: !previous[fieldName],
    }));
  }

  function startOAuth(platform: Exclude<ConnectPlatform, 'twitter'>) {
    window.location.assign(oauthCopy(platform).href);
  }

  async function onSubmit(data: CreateProfileInput) {
    try {
      await createProfile.mutateAsync(data);
      resetDialog();
      onOpenChange(false);
      toast.success('Profile connected');
    } catch (err) {
      const error = err as Error & { status?: number };
      if (error.status === 409) {
        form.setError('root', { message: 'This Twitter account is already connected.' });
      } else if (error.status === 422) {
        form.setError('root', {
          message: error.message || 'Could not verify these credentials. Please check them and try again.',
        });
      } else {
        form.setError('root', {
          message: error.message || 'Something went wrong. Please try again.',
        });
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Connect a social profile</DialogTitle>
          <DialogDescription>
            Authorize publishing access for one platform.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activePlatform} onValueChange={(value) => setActivePlatform(value as ConnectPlatform)}>
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-none border-b bg-transparent p-0">
            {platformTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2 py-2 text-xs shadow-none data-[state=active]:border-[var(--brand-accent)] data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                )}
              >
                <PlatformGlyph platform={tab.value} size={11} />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="linkedin" className="mt-3">
            <OAuthPanel platform="linkedin" onStartOAuth={startOAuth} onCancel={() => handleOpenChange(false)} />
          </TabsContent>

          <TabsContent value="facebook" className="mt-3">
            <OAuthPanel platform="facebook" onStartOAuth={startOAuth} onCancel={() => handleOpenChange(false)} />
          </TabsContent>

          <TabsContent value="twitter" className="mt-3">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <Alert className="border-[var(--status-warning)]/40 bg-[var(--status-warning-soft)]/40">
                  <AlertCircle className="h-4 w-4 text-[var(--status-warning)]" />
                  <AlertTitle className="text-xs">Developer App credentials required</AlertTitle>
                  <AlertDescription className="text-xs">
                    Twitter / X doesn't offer one-click OAuth for self-hosted apps. Create a Developer App, then paste its credentials below.
                  </AlertDescription>
                </Alert>

                {credentialFields.map(({ name, label }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type={visibleFields[name] ? 'text' : 'password'}
                              autoComplete="off"
                              className="pr-9"
                              {...field}
                            />
                          </FormControl>
                          <IconButton
                            icon={visibleFields[name] ? EyeOff : Eye}
                            label={visibleFields[name] ? `Hide ${label}` : `Show ${label}`}
                            variant="ghost"
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                            onClick={() => toggleFieldVisibility(name)}
                          />
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}

                <p className="mono text-[11px] leading-5 text-muted-foreground">
                  Setup: developer.x.com &gt; Projects & Apps &gt; User authentication settings &gt; Read and write.
                </p>

                {form.formState.errors.root ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.root.message}
                  </p>
                ) : null}

                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                    Maybe later
                  </Button>
                  <Button type="submit" variant="accent" disabled={createProfile.isPending}>
                    {createProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Connect Twitter / X
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function OAuthPanel({
  platform,
  onStartOAuth,
  onCancel,
}: {
  platform: Exclude<ConnectPlatform, 'twitter'>;
  onStartOAuth: (platform: Exclude<ConnectPlatform, 'twitter'>) => void;
  onCancel: () => void;
}) {
  const copy = oauthCopy(platform);

  return (
    <div className="space-y-4">
      <Alert className="border-[var(--status-info)]/40 bg-[var(--status-info-soft)]/50">
        <Info className="h-4 w-4 text-[var(--status-info)]" />
        <AlertTitle className="text-xs">One-click OAuth</AlertTitle>
        <AlertDescription className="text-xs">
          {copy.body}
        </AlertDescription>
      </Alert>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Maybe later
        </Button>
        <Button type="button" variant="accent" onClick={() => onStartOAuth(platform)}>
          {copy.action}
        </Button>
      </DialogFooter>
    </div>
  );
}
