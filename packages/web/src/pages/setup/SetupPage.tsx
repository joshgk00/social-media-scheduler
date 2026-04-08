import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setupSchema, type SetupInput } from '@sms/shared';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useSetup } from '@/hooks/use-auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';

// Browser timezone detected via Intl.DateTimeFormat().resolvedOptions().timeZone
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function getTimezoneList(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [browserTimezone];
  }
}

export default function SetupPage() {
  const navigate = useNavigate();
  const setupMutation = useSetup();
  const [serverError, setServerError] = useState<string | null>(null);
  const [timezoneFilter, setTimezoneFilter] = useState('');

  const allTimezones = useMemo(() => getTimezoneList(), []);

  const filteredTimezones = useMemo(() => {
    if (!timezoneFilter) return allTimezones;
    const lower = timezoneFilter.toLowerCase();
    return allTimezones.filter((tz) => tz.toLowerCase().includes(lower));
  }, [allTimezones, timezoneFilter]);

  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      timezone: browserTimezone,
    },
    mode: 'onBlur',
  });

  const passwordValue = form.watch('password');
  const passwordLength = passwordValue?.length ?? 0;

  async function onSubmit(data: SetupInput) {
    setServerError(null);
    try {
      await setupMutation.mutateAsync(data);
      toast.success('Account created. Sign in to continue.');
      navigate('/login');
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error.status === 403) {
        setServerError('exists');
      } else {
        setServerError('generic');
      }
    }
  }

  return (
    <main>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-[400px]">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">
              Welcome to Social Media Scheduler
            </CardTitle>
            <CardDescription>Create your account to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            {serverError === 'exists' && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  Account already exists.{' '}
                  <a href="/login" className="underline">
                    Sign in instead.
                  </a>
                </AlertDescription>
              </Alert>
            )}
            {serverError === 'generic' && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>Something went wrong. Please try again.</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <p
                        className={`text-sm ${
                          passwordLength >= 12 ? 'text-success' : 'text-muted-foreground'
                        }`}
                      >
                        {passwordLength} / 12 minimum
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="Search timezones..."
                            value={timezoneFilter}
                            onChange={(e) => {
                              setTimezoneFilter(e.target.value);
                              const match = allTimezones.find(
                                (tz) => tz.toLowerCase() === e.target.value.toLowerCase()
                              );
                              if (match) field.onChange(match);
                            }}
                            onFocus={() => setTimezoneFilter('')}
                            list="timezone-list"
                            autoComplete="off"
                          />
                          <datalist id="timezone-list">
                            {filteredTimezones.slice(0, 50).map((tz) => (
                              <option key={tz} value={tz} />
                            ))}
                          </datalist>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Selected: {field.value}
                          </p>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={!form.formState.isValid || setupMutation.isPending}
                  aria-busy={setupMutation.isPending}
                >
                  {setupMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Account
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
