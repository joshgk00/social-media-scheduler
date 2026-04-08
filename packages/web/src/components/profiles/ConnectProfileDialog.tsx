import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProfileSchema, type CreateProfileInput } from '@sms/shared';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
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

interface ConnectProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CredentialField = keyof CreateProfileInput;

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
          <DialogTitle>Connect Profile</DialogTitle>
          <DialogDescription>
            Enter your Twitter Developer App credentials. You can find these in the
            Twitter Developer Portal under your app's Keys and Tokens section.
          </DialogDescription>
        </DialogHeader>

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
                Cancel
              </Button>
              <Button type="submit" disabled={createProfile.isPending}>
                {createProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Connect
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
