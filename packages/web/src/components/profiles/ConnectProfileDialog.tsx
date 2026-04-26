import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProfileSchema, type CreateProfileInput } from '@sms/shared';
import { Eye, EyeOff, Info, Loader2, Network, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateProfile } from '../../hooks/use-profiles';
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
  FormDescription,
  FormMessage,
} from '../ui/form';
import { Separator } from '../ui/separator';

interface ConnectProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CredentialField = 'consumerKey' | 'consumerSecret' | 'accessToken' | 'accessTokenSecret';

const credentialFields: Array<{
  name: CredentialField;
  label: string;
  description: string;
}> = [
  { name: 'consumerKey', label: 'Consumer Key', description: 'Also called API Key' },
  { name: 'consumerSecret', label: 'Consumer Secret', description: 'Also called API Secret' },
  { name: 'accessToken', label: 'Access Token', description: 'Generated under Authentication Tokens' },
  { name: 'accessTokenSecret', label: 'Access Token Secret', description: 'Generated under Authentication Tokens' },
];

export function ConnectProfileDialog({ open, onOpenChange }: ConnectProfileDialogProps) {
  const createProfile = useCreateProfile();

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

  function toggleFieldVisibility(fieldName: CredentialField) {
    setVisibleFields(previous => ({
      ...previous,
      [fieldName]: !previous[fieldName],
    }));
  }

  async function onSubmit(data: CreateProfileInput) {
    try {
      await createProfile.mutateAsync(data);
      form.reset();
      resetVisibility();
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

  function resetVisibility() {
    setVisibleFields({
      consumerKey: false,
      consumerSecret: false,
      accessToken: false,
      accessTokenSecret: false,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset();
      resetVisibility();
      createProfile.reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a profile</DialogTitle>
          <DialogDescription>
            Choose a platform. You'll be redirected to sign in and authorize posting access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button
            type="button"
            className="w-full justify-center"
            onClick={() =>
              window.location.assign('/api/oauth/start/linkedin?returnTo=/profiles')
            }
          >
            <Network className="h-4 w-4 mr-2" aria-hidden="true" />
            Connect LinkedIn
          </Button>
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
            You'll pick a Personal Profile or Company Page after signing in.
          </p>

          <Button
            type="button"
            className="w-full justify-center"
            onClick={() =>
              window.location.assign('/api/oauth/start/facebook?returnTo=/profiles')
            }
          >
            <Share2 className="h-4 w-4 mr-2" aria-hidden="true" />
            Connect Facebook Page
          </Button>
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
            You'll pick which Page to post to after signing in.
          </p>
        </div>

        <Separator />

        <div>
          <p className="text-sm font-semibold">Connect Twitter/X</p>
          <p className="text-xs text-muted-foreground mb-2 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
            You'll paste your Developer App credentials on the next step.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {credentialFields.map(({ name, label, description }) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={visibleFields[name] ? 'text' : 'password'}
                          autoComplete="off"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-10 w-10"
                          onClick={() => toggleFieldVisibility(name)}
                          aria-label={visibleFields[name] ? `Hide ${label}` : `Show ${label}`}
                        >
                          {visibleFields[name] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>{description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            {form.formState.errors.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Maybe later
              </Button>
              <Button type="submit" disabled={createProfile.isPending}>
                {createProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Connect Twitter/X
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
