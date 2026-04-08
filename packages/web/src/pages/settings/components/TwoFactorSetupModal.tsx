import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useSetup2FA, useVerifySettings2FA } from '../../../hooks/use-settings';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../components/ui/dialog';

interface TwoFactorSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TwoFactorSetupModal({ open, onOpenChange }: TwoFactorSetupModalProps) {
  const setup2FA = useSetup2FA();
  const verify2FA = useVerifySettings2FA();
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCode('');
    setError('');
    setCopied(false);
    setSecret('');
    setUri('');

    setup2FA.mutateAsync()
      .then((data) => {
        setSecret(data.secret);
        setUri(data.uri);
      })
      .catch(() => {
        toast.error('Failed to generate 2FA secret. Please try again.');
        onOpenChange(false);
      });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  }

  async function handleVerify() {
    if (code.length !== 6) return;
    setError('');

    try {
      await verify2FA.mutateAsync({ code });
      onOpenChange(false);
      toast.success('Two-factor authentication enabled.');
    } catch {
      setError('Invalid code. Make sure your authenticator time is synced.');
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && codeInputRef.current === document.activeElement) return;
    onOpenChange(nextOpen);
  }

  const isLoading = setup2FA.isPending || (!secret && open);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onInteractOutside={(e) => {
          if (codeInputRef.current === document.activeElement) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Enable Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
            or manually enter the secret key.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-center">
              <QRCodeSVG value={uri} size={200} bgColor="transparent" fgColor="#fafafa" />
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2">
              <code className="flex-1 font-mono text-sm break-all">{secret}</code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totp-verify">Enter the 6-digit code from your app to verify setup</Label>
              <Input
                id="totp-verify"
                ref={codeInputRef}
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
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={code.length !== 6 || verify2FA.isPending}
              onClick={handleVerify}
            >
              {verify2FA.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify & Enable 2FA
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
