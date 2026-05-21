import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  recoveryResetPasswordSchema,
  recoveryVerifyEmailSchema,
  SECURITY_QUESTIONS,
  type RecoveryResetPasswordInput,
  type RecoveryVerifyEmailInput,
} from "@sms/shared";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";
import { AuthShell } from "../auth/AuthShell";

type Step = "email" | "questions" | "reset";

const stepNumber: Record<Step, number> = {
  email: 1,
  questions: 2,
  reset: 3,
};

function getStepCopy(step: Step) {
  if (step === "email") {
    return {
      title: "Confirm your email",
      subtitle: "We'll match this against your account.",
    };
  }
  if (step === "questions") {
    return {
      title: "Answer security questions",
      subtitle: "These answers verify that you own this deployment.",
    };
  }
  return {
    title: "Set a new password",
    subtitle: "12+ characters. Choose something memorable.",
  };
}

function getServerMessage(error: unknown, fallback: string): string {
  const typedError = error as { body?: { error?: string } };
  return typedError.body?.error ?? fallback;
}

function StepIndicator({ step }: { step: Step }) {
  const activeStep = stepNumber[step];
  return (
    <div className="mb-4 grid grid-cols-3 gap-1">
      {[1, 2, 3].map((segment) => (
        <div
          key={segment}
          className={
            segment <= activeStep
              ? "h-1 rounded-full bg-[var(--brand-accent)]"
              : "h-1 rounded-full bg-[var(--bg-active)]"
          }
        />
      ))}
    </div>
  );
}

export default function RecoverPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [questionIndices, setQuestionIndices] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailForm = useForm<RecoveryVerifyEmailInput>({
    resolver: zodResolver(recoveryVerifyEmailSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  const resetForm = useForm<RecoveryResetPasswordInput>({
    resolver: zodResolver(recoveryResetPasswordSchema),
    defaultValues: { newPassword: "", confirmNewPassword: "" },
    mode: "onBlur",
  });

  const newPasswordValue = resetForm.watch("newPassword");
  const newPasswordLength = newPasswordValue?.length ?? 0;
  const copy = getStepCopy(step);

  function resetToStep1(message?: string) {
    setStep("email");
    setEmail("");
    setQuestionIndices([]);
    setAnswers(["", "", ""]);
    setEmailError(message ?? null);
    setQuestionsError(null);
    setResetError(null);
    emailForm.reset();
    resetForm.reset();
  }

  async function onEmailSubmit(data: RecoveryVerifyEmailInput) {
    setEmailError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<{
        questionsConfigured: boolean;
        questionIndices?: number[];
      }>("/api/auth/recover/verify-email", data);
      if (!result.questionsConfigured) {
        setEmailError(
          "No recovery method configured. Security questions must be set up in Settings before account recovery is available.",
        );
        return;
      }
      if (result.questionIndices) {
        setEmail(data.email);
        setQuestionIndices(result.questionIndices);
        setAnswers(new Array(result.questionIndices.length).fill(""));
        setStep("questions");
      }
    } catch (error: unknown) {
      setEmailError(
        getServerMessage(error, "Something went wrong. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onQuestionsSubmit() {
    setQuestionsError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post("/api/auth/recover/verify-answers", {
        email,
        answers,
      });
      setStep("reset");
    } catch (error: unknown) {
      const typedError = error as {
        status?: number;
        body?: { error?: string };
      };
      if (
        typedError.status === 401 &&
        typedError.body?.error?.toLowerCase().includes("start over")
      ) {
        resetToStep1("Recovery session expired. Please start over.");
      } else {
        setQuestionsError(
          getServerMessage(error, "Something went wrong. Please try again."),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onResetSubmit(data: RecoveryResetPasswordInput) {
    setResetError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post("/api/auth/recover/reset-password", data);
      toast.success("Password updated. Sign in with your new credentials.");
      navigate("/login");
    } catch (error: unknown) {
      const typedError = error as {
        status?: number;
        body?: { error?: string };
      };
      if (
        typedError.status === 401 &&
        typedError.body?.error?.toLowerCase().includes("start over")
      ) {
        resetToStep1("Recovery session expired. Please start over.");
      } else {
        setResetError(
          getServerMessage(error, "Something went wrong. Please try again."),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBack() {
    if (step === "email") {
      navigate("/login");
      return;
    }
    if (step === "questions") {
      setQuestionsError(null);
      setStep("email");
      return;
    }
    setResetError(null);
    setStep("questions");
  }

  return (
    <AuthShell widthClassName="max-w-[420px]" showHeader={false}>
      <div className="mb-4 flex justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-[var(--shadow-md)]">
          C&amp;M
        </div>
      </div>

      <Card className="rounded-md border-border bg-card p-4 shadow-[var(--shadow-sm)]">
        <StepIndicator step={step} />
        <p className="mono text-[11px] font-medium uppercase text-muted-foreground">
          Step {stepNumber[step]} of 3
        </p>
        <h1 className="mt-1 text-lg font-semibold">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>

        <div className="mt-4">
          {step === "email" && (
            <Form {...emailForm}>
              <form
                onSubmit={emailForm.handleSubmit(onEmailSubmit)}
                className="space-y-4"
              >
                {emailError && <Banner tone="danger">{emailError}</Banner>}
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <RecoveryFooter
                  onBack={handleBack}
                  isSubmitting={isSubmitting}
                  continueLabel="Continue"
                />
              </form>
            </Form>
          )}

          {step === "questions" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onQuestionsSubmit();
              }}
              className="space-y-4"
            >
              {questionsError && (
                <Banner tone="danger">{questionsError}</Banner>
              )}
              {questionIndices.map((questionIndex, index) => (
                <div key={questionIndex} className="space-y-1.5">
                  <Label htmlFor={`answer-${questionIndex}`}>
                    {SECURITY_QUESTIONS[questionIndex]}
                  </Label>
                  <Input
                    id={`answer-${questionIndex}`}
                    type="text"
                    autoComplete="off"
                    value={answers[index]}
                    onChange={(event) => {
                      const updatedAnswers = [...answers];
                      updatedAnswers[index] = event.target.value;
                      setAnswers(updatedAnswers);
                    }}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              ))}
              <RecoveryFooter
                onBack={handleBack}
                isSubmitting={isSubmitting}
                continueLabel="Verify answers"
                disabled={answers.some((answer) => !answer.trim())}
              />
            </form>
          )}

          {step === "reset" && (
            <Form {...resetForm}>
              <form
                onSubmit={resetForm.handleSubmit(onResetSubmit)}
                className="space-y-4"
              >
                {resetError && <Banner tone="danger">{resetError}</Banner>}
                <FormField
                  control={resetForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <p
                        className={
                          newPasswordLength >= 12
                            ? "text-xs text-success"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        12 character minimum
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
                      <FormLabel>Confirm new password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <RecoveryFooter
                  onBack={handleBack}
                  isSubmitting={isSubmitting}
                  continueLabel="Reset password"
                  disabled={!resetForm.formState.isValid}
                />
              </form>
            </Form>
          )}
        </div>
      </Card>
    </AuthShell>
  );
}

interface RecoveryFooterProps {
  onBack: () => void;
  isSubmitting: boolean;
  continueLabel: string;
  disabled?: boolean;
}

function RecoveryFooter({
  onBack,
  isSubmitting,
  continueLabel,
  disabled = false,
}: RecoveryFooterProps) {
  return (
    <div className="flex items-center justify-between pt-1">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        Back
      </Button>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        disabled={isSubmitting || disabled}
        aria-busy={isSubmitting}
      >
        {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {continueLabel}
      </Button>
    </div>
  );
}

export { StepIndicator };
