import { ConfirmSimpleDialog } from './ConfirmSimpleDialog';

export function RandomizeQueueDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueName: string;
  postCount: number;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <ConfirmSimpleDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      onConfirm={props.onConfirm}
      title={`Randomize order of "${props.queueName}"?`}
      description={`This shuffles the ${props.postCount} posts in this queue. The cursor follows the next post so you don't lose your place in the rotation.`}
      confirmLabel="Randomize Queue"
      dismissLabel="Don't Randomize"
      isPending={props.isPending}
    />
  );
}
