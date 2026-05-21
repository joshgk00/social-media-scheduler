import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { setupSchema, type SetupInput } from "@sms/shared";
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
import { NativeSelect } from "@/components/ui/native-select";
import { useLogin, useSetup } from "@/hooks/use-auth";
import { AuthShell, Brandmark } from "../auth/AuthShell";

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function getTimezoneList(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [browserTimezone];
  }
}

export default function SetupPage() {
  const navigate = useNavigate();
  const setupMutation = useSetup();
  const loginMutation = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const allTimezones = useMemo(() => getTimezoneList(), []);

  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      timezone: browserTimezone,
    },
    mode: "onBlur",
  });

  const passwordValue = form.watch("password");
  const passwordLength = passwordValue?.length ?? 0;
  const isSubmitting = setupMutation.isPending || loginMutation.isPending;

  async function onSubmit(data: SetupInput) {
    setServerError(null);
    try {
      await setupMutation.mutateAsync(data);
      await loginMutation.mutateAsync({
        email: data.email,
        password: data.password,
      });
      toast.success("Account created. Welcome aboard.");
      navigate("/dashboard", { replace: true });
    } catch (error: unknown) {
      const typedError = error as {
        status?: number;
        body?: { error?: string };
      };
      if (typedError.status === 403) {
        setServerError("exists");
      } else {
        setServerError(
          typedError.body?.error ?? "Something went wrong. Please try again.",
        );
      }
    }
  }

  return (
    <AuthShell widthClassName="max-w-[460px]" showHeader={false}>
      <div className="mb-4 flex justify-center">
        <Brandmark className="h-14 w-14 text-lg" />
      </div>

      <Card className="rounded-md border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h1 className="text-xl font-semibold">Welcome aboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One-time setup. You own this deployment — no SaaS layer.
        </p>

        {serverError === "exists" && (
          <Banner tone="danger" className="mt-4">
            Account already exists.{" "}
            <Link to="/login" className="font-medium underline">
              Sign in instead.
            </Link>
          </Banner>
        )}
        {serverError && serverError !== "exists" && (
          <Banner tone="danger" className="mt-4">
            {serverError}
          </Banner>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-4 space-y-3"
          >
            <FormField
              control={form.control}
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

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
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
                      passwordLength >= 12
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
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
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

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <NativeSelect disabled={isSubmitting} {...field}>
                      {allTimezones.map((timezone) => (
                        <option key={timezone} value={timezone}>
                          {timezone}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="primary"
              className="h-9 w-full"
              disabled={!form.formState.isValid || isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </Form>
      </Card>
    </AuthShell>
  );
}
