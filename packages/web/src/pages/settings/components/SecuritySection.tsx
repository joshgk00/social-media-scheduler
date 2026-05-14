import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '../../../hooks/use-auth';
import { useSecurityQuestionsStatus, useSessionCount, useLogoutOthers } from '../../../hooks/use-settings';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Password</p>
              <p className="text-sm text-muted-foreground">Never changed</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setPasswordModalOpen(true)}>
              Change Password
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Two-Factor Authentication</p>
              {user.totpEnabled ? (
                <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/20">Enabled</Badge>
              ) : (
                <Badge variant="secondary">Disabled</Badge>
              )}
            </div>
            {user.totpEnabled ? (
              <Button variant="secondary" size="sm" onClick={() => setTwoFactorDisableOpen(true)}>
                Disable 2FA
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setTwoFactorSetupOpen(true)}>
                Set Up 2FA
              </Button>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Security Questions</p>
              <p className="text-sm text-muted-foreground">{sqLabel}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSecurityQuestionsOpen(true)}>
              Configure
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Active Sessions</p>
              <p className="text-sm text-muted-foreground">
                You are logged in on {sessionCount} device{sessionCount !== 1 ? 's' : ''}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogoutOthers}
              disabled={logoutOthers.isPending || sessionCount <= 1}
            >
              {logoutOthers.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Log Out Other Sessions
            </Button>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-semibold">Last Login</p>
            <p className="text-sm text-muted-foreground">{lastLoginDisplay}</p>
          </div>
        </CardContent>
      </Card>

      <ChangePasswordModal open={passwordModalOpen} onOpenChange={setPasswordModalOpen} />
      <TwoFactorSetupModal open={twoFactorSetupOpen} onOpenChange={setTwoFactorSetupOpen} />
      <TwoFactorDisableModal open={twoFactorDisableOpen} onOpenChange={setTwoFactorDisableOpen} />
      <SecurityQuestionsModal open={securityQuestionsOpen} onOpenChange={setSecurityQuestionsOpen} />
    </>
  );
}
