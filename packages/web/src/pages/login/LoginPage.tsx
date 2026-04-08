import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, totpVerifySchema, type LoginInput, type TotpVerifyInput } from '@sms/shared';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useLogin, useVerify2FA } from '@/hooks/use-auth';
import { useAuthStore } from '@/store/auth-store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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

type Step = 'credentials' | 'totp';

const TOTP_TIMEOUT_SECONDS = 300;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginMutation = useLogin();
  const verify2FAMutation = useVerify2FA();
  const { redirectAfterLogin, setRedirectAfterLogin } = useAuthStore();

  const [step, setStep] = useState<Step>('credentials');
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(TOTP_TIMEOUT_SECONDS);

  // Capture redirect param on mount -- validate same-origin to prevent open redirect
  useEffect(() => {
    const redirect = searchParams.get('redirect');
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      setRedirectAfterLogin(redirect);
    }
  }, [searchParams, setRedirectAfterLogin]);

  const redirectToTarget = useCallback(() => {
    const target = redirectAfterLogin || '/';
    setRedirectAfterLogin(null);
    navigate(target);
  }, [redirectAfterLogin, setRedirectAfterLogin, navigate]);

  // 5-minute countdown for TOTP step
  useEffect(() => {
    if (step !== 'totp') return;

    setCountdown(TOTP_TIMEOUT_SECONDS);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setStep('credentials');
          setTotpError(null);
          toast.error('Session expired. Please sign in again.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  const credentialsForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  const totpForm = useForm<TotpVerifyInput>({
    resolver: zodResolver(totpVerifySchema),
    defaultValues: { code: '' },
    mode: 'onBlur',
  });

  async function onCredentialsSubmit(data: LoginInput) {
    setCredentialsError(null);
    try {
      const result = await loginMutation.mutateAsync(data);
      if (result.requiresTwoFactor) {
        setStep('totp');
      } else {
        redirectToTarget();
      }
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error.status === 429) {
        setCredentialsError('Too many failed attempts. Try again in 15 minutes.');
      } else if (error.status === 401) {
        setCredentialsError('Invalid email or password.');
      } else {
        setCredentialsError('Something went wrong. Please try again.');
      }
    }
  }

  async function onTotpSubmit(data: TotpVerifyInput) {
    setTotpError(null);
    try {
      await verify2FAMutation.mutateAsync(data);
      redirectToTarget();
    } catch (err: unknown) {
      const error = err as { status?: number; body?: { error?: string } };
      if (error.status === 401 && error.body?.error?.toLowerCase().includes('session expired')) {
        setStep('credentials');
        setTotpError(null);
        totpForm.reset();
        toast.error('Session expired. Please sign in again.');
      } else if (error.status === 401) {
        setTotpError('Invalid code. Please try again.');
      } else {
        setTotpError('Something went wrong. Please try again.');
      }
    }
  }

  function handleBackToLogin() {
    setStep('credentials');
    setTotpError(null);
    totpForm.reset();
  }

  return (
    <main>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-[400px]">
          {step === 'credentials' && (
            <>
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">
                  Social Media Scheduler
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...credentialsForm}>
                  <form
                    onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={credentialsForm.control}
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
                      control={credentialsForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="current-password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {credentialsError && (
                      <Alert variant="destructive">
                        <AlertDescription>{credentialsError}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loginMutation.isPending}
                      aria-busy={loginMutation.isPending}
                    >
                      {loginMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Sign In
                    </Button>

                    <div className="text-center">
                      <a
                        href="/recover"
                        className="text-sm text-muted-foreground hover:text-foreground underline"
                      >
                        Forgot password?
                      </a>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </>
          )}

          {step === 'totp' && (
            <>
              <CardHeader>
                <div aria-live="polite">
                  <CardTitle className="text-2xl font-semibold">
                    Two-Factor Authentication
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Enter the 6-digit code from your authenticator app.
                </p>
                <Form {...totpForm}>
                  <form
                    onSubmit={totpForm.handleSubmit(onTotpSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={totpForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              pattern="[0-9]{6}"
                              autoComplete="one-time-code"
                              aria-label="6-digit verification code"
                              className="h-11 text-center text-xl"
                              maxLength={6}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {totpError && (
                      <Alert variant="destructive">
                        <AlertDescription>{totpError}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={verify2FAMutation.isPending}
                      aria-busy={verify2FAMutation.isPending}
                    >
                      {verify2FAMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Verify
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={handleBackToLogin}
                        className="text-sm text-muted-foreground hover:text-foreground underline"
                      >
                        Back to login
                      </button>
                    </div>
                  </form>
                </Form>

                <p
                  className="mt-4 text-center text-sm text-muted-foreground"
                  aria-live="off"
                >
                  Code expires in {formatCountdown(countdown)}
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
