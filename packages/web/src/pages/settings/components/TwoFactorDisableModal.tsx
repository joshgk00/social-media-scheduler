import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDisable2FA } from '../../../hooks/use-settings';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../../components/ui/dialog';

interface TwoFactorDisableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TwoFactorDisableModal({ open, onOpenChange }: TwoFactorDisableModalProps) {
  const disable2FA = useDisable2FA();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      await disable2FA.mutateAsync({ password, code });
      resetAndClose();
      toast.success('Two-factor authentication disabled.');
    } catch {
      setError('Invalid password or code.');
    }
  }

  function resetAndClose() {
    setPassword('');
    setCode('');
    setError('');
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setPassword('');
      setCode('');
      setError('');
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            This will remove two-factor authentication from your account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="disable-2fa-password">Current Password</Label>
            <Input
              id="disable-2fa-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="disable-2fa-code">Current TOTP Code</Label>
            <Input
              id="disable-2fa-code"
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(val);
                setError('');
              }}
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-[44px] text-center text-xl"
              aria-label="6-digit verification code"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!password || code.length !== 6 || disable2FA.isPending}
            >
              {disable2FA.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Disable 2FA
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
