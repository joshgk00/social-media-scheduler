import { ConfirmDestructiveDialog } from './ConfirmDestructiveDialog';

export function PurgeQueueDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueName: string;
  postCount: number;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <ConfirmDestructiveDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      onConfirm={props.onConfirm}
      title={`Purge "${props.queueName}"?`}
      description={`This deletes the ${props.postCount} queued and draft posts in this queue and removes their pending jobs. Already-published posts on Twitter, LinkedIn, and Facebook are NOT removed and continue to follow their auto-destruct schedules.`}
      confirmLabel="Purge Queue"
      dismissLabel="Keep Queue"
      confirmationPhrase={props.queueName}
      phraseKind="queue-name"
      isPending={props.isPending}
    />
  );
}
