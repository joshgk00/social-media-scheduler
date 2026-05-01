import { ConfirmSimpleDialog } from './ConfirmSimpleDialog';

export function RemoveDuplicatesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueName: string;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <ConfirmSimpleDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      onConfirm={props.onConfirm}
      title={`Remove duplicates from "${props.queueName}"?`}
      description="Compares posts by normalized text (whitespace collapsed, lowercased). Spinnable templates compare as raw text. The earliest copy is kept; later duplicates are deleted."
      confirmLabel="Remove Duplicates"
      dismissLabel="Don't Remove"
      isPending={props.isPending}
    />
  );
}
