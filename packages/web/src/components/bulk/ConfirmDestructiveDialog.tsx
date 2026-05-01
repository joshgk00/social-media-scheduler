import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface ConfirmDestructiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  dismissLabel: string;
  confirmationPhrase: string;
  phraseKind?: 'count' | 'queue-name';
  isPending?: boolean;
}

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  dismissLabel,
  confirmationPhrase,
  phraseKind = 'count',
  isPending = false,
}: ConfirmDestructiveDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState('');
  const helperId = useId();
  const isMatch = typedPhrase.trim() === confirmationPhrase.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {phraseKind === 'queue-name' ? 'Type the queue name ' : 'Type '}
            <code className="font-mono text-foreground">{confirmationPhrase}</code>
            {' to confirm:'}
          </p>
          <Input
            aria-label="Confirmation phrase"
            aria-describedby={helperId}
            aria-invalid={typedPhrase.length > 0 && !isMatch}
            placeholder={confirmationPhrase}
            value={typedPhrase}
            onChange={(event) => setTypedPhrase(event.target.value)}
          />
          <p id={helperId} className={typedPhrase && !isMatch ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'} aria-live="polite">
            {typedPhrase.length === 0
              ? 'Match the phrase exactly to enable the delete button.'
              : isMatch
                ? 'Confirmation phrase matches.'
                : phraseKind === 'queue-name'
                  ? "Name doesn't match. Capitalization counts."
                  : "Phrase doesn't match. Check capitalization and the count."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {dismissLabel}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!isMatch || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
