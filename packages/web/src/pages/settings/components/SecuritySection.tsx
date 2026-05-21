import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { KeyRound, Loader2, Monitor, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '../../../hooks/use-auth';
import { useSecurityQuestionsStatus, useSessionCount, useLogoutOthers } from '../../../hooks/use-settings';
import { Card } from '../../../components/ui/card';
import { Pill } from '../../../components/ui/pill';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { ChangePasswordModal } from './ChangePasswordModal';
import { TwoFactorSetupModal } from './TwoFactorSetupModal';
import { TwoFactorDisableModal } from './TwoFactorDisableModal';
import { SecurityQuestionsModal } from './SecurityQuestionsModal';

interface SecuritySectionProps {
  user: User;
}

export function SecuritySection({ user }: SecuritySectionProps) {
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [twoFactorSetupOpen, setTwoFactorSetupOpen] = useState(false);
  const [twoFactorDisableOpen, setTwoFactorDisableOpen] = useState(false);
  const [securityQuestionsOpen, setSecurityQuestionsOpen] = useState(false);

  const { data: sqStatus } = useSecurityQuestionsStatus();
  const { data: sessionData } = useSessionCount();
  const logoutOthers = useLogoutOthers();

  async function handleLogoutOthers() {
    try {
      await logoutOthers.mutateAsync();
      toast.success('All other sessions have been signed out.');
    } catch {
      toast.error('Failed to log out other sessions.');
    }
  }

  const lastLoginDisplay = user.lastLoginAt
    ? `${formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })} (${format(new Date(user.lastLoginAt), 'PPpp')})`
    : 'Never';

  const sqCount = sqStatus?.configured ? sqStatus.questionIndices.length : 0;
  const sqLabel = sqStatus?.configured ? `${sqCount} of 3 configured` : 'Not configured';
  const sessionCount = sessionData?.count ?? 1;
  const staleSessionCount = Math.min(Math.max(sessionCount - 1, 0), 3);

  return (
    <>
      <Card title="Security" padded>
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Password</p>
                <p className="text-sm text-muted-foreground">Last changed 3 months ago</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPasswordModalOpen(true)}>
              Change password
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">Two-factor authentication</p>
                  <Pill tone={user.totpEnabled ? 'success' : 'neutral'} dot>
                    {user.totpEnabled ? 'On' : 'Off'}
                  </Pill>
                </div>
                <p className="text-sm text-muted-foreground">
                  Add an authenticator app challenge after password sign-in.
                </p>
              </div>
            </div>
            {user.totpEnabled ? (
              <Button variant="outline" size="sm" onClick={() => setTwoFactorDisableOpen(true)}>
                Manage 2FA
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setTwoFactorSetupOpen(true)}>
                Set up 2FA
              </Button>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Security Questions</p>
              <p className="text-sm text-muted-foreground">{sqLabel}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSecurityQuestionsOpen(true)}>
              Configure
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Active sessions</p>
                <p className="text-sm text-muted-foreground">
                  1 active session (last 7 days). {staleSessionCount} stale session{staleSessionCount === 1 ? '' : 's'} cleaned up automatically each night.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogoutOthers}
                disabled={logoutOthers.isPending || sessionCount <= 1}
              >
                {logoutOthers.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign out everywhere else
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-[var(--bg-base)] px-3 py-2">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-foreground">This browser session</span>
              </div>
              <Pill tone="success" dot>Current</Pill>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-semibold">Last login</p>
            <p className="text-sm text-muted-foreground">{lastLoginDisplay}</p>
          </div>
        </div>
      </Card>

      <ChangePasswordModal open={passwordModalOpen} onOpenChange={setPasswordModalOpen} />
      <TwoFactorSetupModal open={twoFactorSetupOpen} onOpenChange={setTwoFactorSetupOpen} />
      <TwoFactorDisableModal open={twoFactorDisableOpen} onOpenChange={setTwoFactorDisableOpen} />
      <SecurityQuestionsModal open={securityQuestionsOpen} onOpenChange={setSecurityQuestionsOpen} />
    </>
  );
}
