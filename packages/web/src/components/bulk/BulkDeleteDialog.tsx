import { ConfirmDestructiveDialog } from './ConfirmDestructiveDialog';

export function BulkDeleteDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionCount: number;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <ConfirmDestructiveDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      onConfirm={props.onConfirm}
      title={`Delete ${props.selectionCount} ${props.selectionCount === 1 ? 'post' : 'posts'}?`}
      description="This permanently deletes the selected scheduled posts and removes their jobs from the queue. Already-published posts on social platforms are NOT affected."
      confirmLabel="Delete Posts"
      dismissLabel="Keep Posts"
      confirmationPhrase={`DELETE ${props.selectionCount} POSTS`}
      isPending={props.isPending}
    />
  );
}
