import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDestructiveDialog } from '../ConfirmDestructiveDialog';

function renderDialog(onConfirm = vi.fn()) {
  render(
    <ConfirmDestructiveDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
      title="Delete 2 posts?"
      description="This permanently deletes the selected scheduled posts."
      confirmLabel="Delete Posts"
      dismissLabel="Keep Posts"
      confirmationPhrase="DELETE 2 POSTS"
    />,
  );
  return { onConfirm };
}

describe('ConfirmDestructiveDialog', () => {
  it('uses alert dialog semantics for destructive confirmations', () => {
    renderDialog();

    expect(screen.getByRole('alertdialog', { name: 'Delete 2 posts?' })).toBeInTheDocument();
  });

  it('keeps the destructive action disabled until the exact phrase matches', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    const confirmButton = screen.getByRole('button', { name: 'Delete Posts' });
    const phraseInput = screen.getByLabelText('Confirmation phrase');

    expect(confirmButton).toBeDisabled();

    await user.type(phraseInput, 'DELETE 2 POST');

    expect(confirmButton).toBeDisabled();
    expect(phraseInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText("Phrase doesn't match. Check capitalization and the count.")).toBeInTheDocument();

    await user.clear(phraseInput);
    await user.type(phraseInput, 'DELETE 2 POSTS');
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('treats capitalization as significant', async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirmButton = screen.getByRole('button', { name: 'Delete Posts' });

    await user.type(screen.getByLabelText('Confirmation phrase'), 'delete 2 posts');

    expect(confirmButton).toBeDisabled();
  });
});
