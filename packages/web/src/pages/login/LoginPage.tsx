import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  loginSchema,
  totpVerifySchema,
  type LoginInput,
  type TotpVerifyInput,
} from "@sms/shared";
import { KeyRound, Loader2, Shield, Users } from "lucide-react";
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
import { useLogin, useVerify2FA } from "@/hooks/use-auth";
import { useAuthStore } from "@/store/auth-store";
import { AuthShell } from "../auth/AuthShell";

type Step = "credentials" | "totp";

const TOTP_TIMEOUT_SECONDS = 300;

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getServerMessage(error: unknown, fallback: string): string {
  const typedError = error as { body?: { error?: string } };
  return typedError.body?.error ?? fallback;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginMutation = useLogin();
  const verify2FAMutation = useVerify2FA();
  const { redirectAfterLogin, setRedirectAfterLogin } = useAuthStore();

  const [step, setStep] = useState<Step>("credentials");
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(TOTP_TIMEOUT_SECONDS);

  useEffect(() => {
    const redirect = searchParams.get("redirect");
    if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
      setRedirectAfterLogin(redirect);
    }
  }, [searchParams, setRedirectAfterLogin]);

  const redirectToTarget = useCallback(() => {
    const target = redirectAfterLogin || "/dashboard";
    setRedirectAfterLogin(null);
    navigate(target);
  }, [redirectAfterLogin, setRedirectAfterLogin, navigate]);

  useEffect(() => {
    if (step !== "totp") return;

    setCountdown(TOTP_TIMEOUT_SECONDS);
    const interval = setInterval(() => {
      setCountdown((previousSeconds) => {
        if (previousSeconds <= 1) {
          clearInterval(interval);
          setStep("credentials");
          setTotpError(null);
          toast.error("Session expired. Please sign in again.");
          return TOTP_TIMEOUT_SECONDS;
        }
        return previousSeconds - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  const credentialsForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const totpForm = useForm<TotpVerifyInput>({
    resolver: zodResolver(totpVerifySchema),
    defaultValues: { code: "" },
    mode: "onBlur",
  });

  async function onCredentialsSubmit(data: LoginInput) {
    setCredentialsError(null);
    try {
      const result = await loginMutation.mutateAsync(data);
      if (result.requiresTwoFactor) {
        setCountdown(TOTP_TIMEOUT_SECONDS);
        setStep("totp");
      } else {
        redirectToTarget();
      }
    } catch (error: unknown) {
      const typedError = error as { status?: number };
      if (typedError.status === 401) {
        setCredentialsError("Email or password didn't match. Try again.");
        return;
      }
      setCredentialsError(
        getServerMessage(error, "Something went wrong. Please try again."),
      );
    }
  }

  async function onTotpSubmit(data: TotpVerifyInput) {
    setTotpError(null);
    try {
      await verify2FAMutation.mutateAsync(data);
      redirectToTarget();
    } catch (error: unknown) {
      const typedError = error as {
        status?: number;
        body?: { error?: string };
      };
      if (
        typedError.status === 401 &&
        typedError.body?.error?.toLowerCase().includes("session expired")
      ) {
        setCountdown(TOTP_TIMEOUT_SECONDS);
        setStep("credentials");
        setTotpError(null);
        totpForm.reset();
        toast.error("Session expired. Please sign in again.");
        return;
      }
      setTotpError(
        getServerMessage(error, "Something went wrong. Please try again."),
      );
    }
  }

  function handleBackToLogin() {
    setCountdown(TOTP_TIMEOUT_SECONDS);
    setStep("credentials");
    setTotpError(null);
    totpForm.reset();
  }

  return (
    <AuthShell
      footer={
        <p className="mono mt-4 text-center text-[11px] text-muted-foreground">
          v2.4.1 · Docker · self hosted
        </p>
      }
    >
      <Card className="rounded-md border-border bg-card p-4 shadow-[var(--shadow-sm)]">
        {step === "credentials" && (
          <Form {...credentialsForm}>
            <form
              onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
              className="space-y-3"
            >
              <FormField
                control={credentialsForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        icon={Users}
                        disabled={loginMutation.isPending}
                        {...field}
                      />
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
                      <Input
                        type="password"
                        autoComplete="current-password"
                        icon={Shield}
                        disabled={loginMutation.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {credentialsError && (
                <Banner tone="danger">{credentialsError}</Banner>
              )}

              <Button
                type="submit"
                variant="primary"
                className="h-9 w-full"
                disabled={loginMutation.isPending}
                aria-busy={loginMutation.isPending}
                loading={loginMutation.isPending}
              >
                Sign in
              </Button>
            </form>
          </Form>
        )}

        {step === "totp" && (
          <div aria-live="polite">
            <h2 className="text-lg font-semibold">Two-Factor Authentication</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app.
            </p>
            <Form {...totpForm}>
              <form
                onSubmit={totpForm.handleSubmit(onTotpSubmit)}
                className="mt-4 space-y-3"
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
                          className="h-11 text-center text-xl tracking-[0.25em]"
                          maxLength={6}
                          icon={KeyRound}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {totpError && <Banner tone="danger">{totpError}</Banner>}

                <Button
                  type="submit"
                  variant="primary"
                  className="h-9 w-full"
                  disabled={verify2FAMutation.isPending}
                  aria-busy={verify2FAMutation.isPending}
                  loading={verify2FAMutation.isPending}
                >
                  Verify
                </Button>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Back to login
                  </button>
                  <Link
                    to="/recover"
                    className="font-medium text-[var(--brand-accent)] underline-offset-4 hover:underline"
                  >
                    Use a recovery code instead
                  </Link>
                </div>
              </form>
            </Form>

            <p
              className="mt-4 text-center text-sm text-muted-foreground"
              aria-live="off"
            >
              Code expires in {formatCountdown(countdown)}
            </p>
          </div>
        )}

        {step === "credentials" && (
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
            <span className="text-muted-foreground">Need help signing in?</span>
            <Link
              to="/recover"
              className="text-right font-medium text-[var(--brand-accent)] hover:underline"
            >
              Recover account &rarr;
            </Link>
          </div>
        )}
      </Card>
    </AuthShell>
  );
}
