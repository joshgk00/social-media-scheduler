import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileUpdateSchema, type ProfileUpdateInput } from '@sms/shared';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '../../../hooks/use-auth';
import { useUpdateProfile, useUploadProfileImage } from '../../../hooks/use-settings';
import { Card } from '../../../components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../../../components/ui/avatar';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../../../components/ui/form';

function getInitials(user: User): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user.firstName) return user.firstName[0].toUpperCase();
  return user.email[0].toUpperCase();
}

interface ProfileSectionProps {
  user: User;
}

export function ProfileSection({ user }: ProfileSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const updateProfile = useUpdateProfile();
  const uploadImage = useUploadProfileImage();

  const form = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      username: user.username ?? '',
      email: user.email,
    },
  });

  const hasChanges = form.formState.isDirty;

  async function onSubmit(data: ProfileUpdateInput) {
    try {
      await updateProfile.mutateAsync(data);
      form.reset(data);
      toast.success('Profile saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast.error(message);
    }
  }

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      await uploadImage.mutateAsync(file);
      toast.success('Profile image updated.');
    } catch (err) {
      setPreviewUrl(null);
      const message = err instanceof Error ? err.message : 'Failed to upload image.';
      toast.error(message);
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const avatarPath = user.profileImagePath?.startsWith('/')
    ? user.profileImagePath
    : user.profileImagePath ? `/avatars/${user.profileImagePath}` : undefined;
  const avatarSrc = previewUrl ?? avatarPath;

  return (
    <Card title="Profile" padded>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleAvatarClick}
            className="group relative cursor-pointer rounded-full"
            aria-label="Change profile image"
          >
            <Avatar className="h-20 w-20">
              {avatarSrc && <AvatarImage src={avatarSrc} alt="Profile" />}
              <AvatarFallback className="text-lg">{getInitials(user)}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="text-xs font-medium text-white">Change</span>
            </div>
            {uploadImage.isPending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </button>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleAvatarClick}
              loading={uploadImage.isPending}
              leadingIcon={<Upload className="h-4 w-4" aria-hidden="true" />}
            >
              Upload avatar
            </Button>
            <p className="max-w-sm text-xs text-muted-foreground">
              JPG, PNG, GIF, or WebP. Images are resized to 200 by 200 pixels.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload profile image"
          />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl>
                      <Input placeholder="First name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl>
                      <Input placeholder="Last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Email address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={!hasChanges || updateProfile.isPending}
              >
                {updateProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save profile
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Card>
  );
}
