import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  recoveryVerifyEmailSchema,
  recoveryResetPasswordSchema,
  SECURITY_QUESTIONS,
  type RecoveryVerifyEmailInput,
  type RecoveryResetPasswordInput,
} from '@sms/shared';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';

type Step = 'email' | 'questions' | 'reset';

export default function RecoverPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [questionIndices, setQuestionIndices] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailForm = useForm<RecoveryVerifyEmailInput>({
    resolver: zodResolver(recoveryVerifyEmailSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  const resetForm = useForm<RecoveryResetPasswordInput>({
    resolver: zodResolver(recoveryResetPasswordSchema),
    defaultValues: { newPassword: '', confirmNewPassword: '' },
    mode: 'onBlur',
  });

  const newPasswordValue = resetForm.watch('newPassword');
  const newPasswordLength = newPasswordValue?.length ?? 0;

  function resetToStep1(message?: string) {
    setStep('email');
    setEmail('');
    setQuestionIndices([]);
    setAnswers(['', '', '']);
    setEmailError(null);
    setQuestionsError(null);
    setResetError(null);
    emailForm.reset();
    resetForm.reset();
    if (message) {
      setEmailError(message);
    }
  }

  async function onEmailSubmit(data: RecoveryVerifyEmailInput) {
    setEmailError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<{ questionsConfigured: boolean; questionIndices?: number[] }>(
        '/api/auth/recover/verify-email',
        data
      );
      if (!result.questionsConfigured) {
        setEmailError(
          'No recovery method configured. Security questions must be set up in Settings before account recovery is available.'
        );
      } else if (result.questionIndices) {
        setEmail(data.email);
        setQuestionIndices(result.questionIndices);
        setAnswers(new Array(result.questionIndices.length).fill(''));
        setStep('questions');
      }
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error.status === 429) {
        setEmailError('Too many failed attempts. Try again in 15 minutes.');
      } else {
        setEmailError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onQuestionsSubmit() {
    setQuestionsError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post('/api/auth/recover/verify-answers', {
        email,
        answers,
      });
      setStep('reset');
    } catch (err: unknown) {
      const error = err as { status?: number; body?: { error?: string } };
      if (
        error.status === 401 &&
        error.body?.error?.toLowerCase().includes('start over')
      ) {
        resetToStep1('Recovery session expired. Please start over.');
      } else if (error.status === 401) {
        setQuestionsError('Incorrect answers. Please try again.');
      } else if (error.status === 429) {
        setQuestionsError('Too many failed attempts. Try again in 15 minutes.');
      } else {
        setQuestionsError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onResetSubmit(data: RecoveryResetPasswordInput) {
    setResetError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post('/api/auth/recover/reset-password', data);
      toast.success(
        'Password reset. 2FA has been disabled. Sign in with your new password.'
      );
      navigate('/login');
    } catch (err: unknown) {
      const error = err as { status?: number; body?: { error?: string } };
      if (
        error.status === 401 &&
        error.body?.error?.toLowerCase().includes('start over')
      ) {
        resetToStep1('Recovery session expired. Please start over.');
      } else if (error.status === 429) {
        setResetError('Too many failed attempts. Try again in 15 minutes.');
      } else {
        setResetError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-[400px]">
          {step === 'email' && (
            <>
              <CardHeader>
                <div aria-live="polite">
                  <CardTitle className="text-2xl font-semibold">
                    Account Recovery
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Answer your security questions to reset your password.
                </p>

                {emailError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{emailError}</AlertDescription>
                  </Alert>
                )}

                <Form {...emailForm}>
                  <form
                    onSubmit={emailForm.handleSubmit(onEmailSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={emailForm.control}
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

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting}
                      aria-busy={isSubmitting}
                    >
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Continue
                    </Button>
                  </form>
                </Form>

                <div className="mt-4 text-center">
                  <a
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Back to login
                  </a>
                </div>
              </CardContent>
            </>
          )}

          {step === 'questions' && (
            <>
              <CardHeader>
                <div aria-live="polite">
                  <CardTitle className="text-2xl font-semibold">
                    Security Questions
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {questionsError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{questionsError}</AlertDescription>
                  </Alert>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onQuestionsSubmit();
                  }}
                  className="space-y-4"
                >
                  {questionIndices.map((qIndex, i) => (
                    <div key={qIndex} className="space-y-2">
                      <Label className="text-sm font-medium">
                        {SECURITY_QUESTIONS[qIndex]}
                      </Label>
                      <Input
                        type="text"
                        autoComplete="off"
                        value={answers[i]}
                        onChange={(e) => {
                          const updated = [...answers];
                          updated[i] = e.target.value;
                          setAnswers(updated);
                        }}
                        required
                      />
                    </div>
                  ))}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || answers.some((a) => !a.trim())}
                    aria-busy={isSubmitting}
                  >
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Verify Answers
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {step === 'reset' && (
            <>
              <CardHeader>
                <div aria-live="polite">
                  <CardTitle className="text-2xl font-semibold">
                    Set New Password
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {resetError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{resetError}</AlertDescription>
                  </Alert>
                )}

                <Form {...resetForm}>
                  <form
                    onSubmit={resetForm.handleSubmit(onResetSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={resetForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <p
                            className={`text-sm ${
                              newPasswordLength >= 12
                                ? 'text-success'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {newPasswordLength} / 12 minimum
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={resetForm.control}
                      name="confirmNewPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!resetForm.formState.isValid || isSubmitting}
                      aria-busy={isSubmitting}
                    >
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Reset Password
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
