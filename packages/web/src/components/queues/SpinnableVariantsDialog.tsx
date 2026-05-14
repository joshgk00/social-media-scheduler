import { useState, useCallback } from 'react';
import { resolveSpinnableText, countTotalVariants } from '@sms/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

interface SpinnableVariantsDialogProps {
  postText: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generateVariants(text: string, count: number): string[] {
  return Array.from({ length: count }, () => resolveSpinnableText(text));
}

export function SpinnableVariantsDialog({
  postText,
  open,
  onOpenChange,
}: SpinnableVariantsDialogProps) {
  const totalVariants = countTotalVariants(postText);
  const hasSpinSyntax = totalVariants > 1;

  const [variants, setVariants] = useState<string[]>(() =>
    hasSpinSyntax ? generateVariants(postText, 5) : [],
  );

  const handleRegenerate = useCallback(() => {
    setVariants(generateVariants(postText, 5));
  }, [postText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Spinnable Text Variants</DialogTitle>
          <DialogDescription>
            {hasSpinSyntax
              ? `${totalVariants} possible combinations from spin syntax.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {hasSpinSyntax ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Sample variants</h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {variants.map((variant, index) => (
                <Card key={index} className="p-4">
                  <p className="text-sm whitespace-pre-wrap">{variant}</p>
                </Card>
              ))}
            </div>
            <Button variant="outline" onClick={handleRegenerate}>
              Regenerate
            </Button>
          </div>
        ) : (
          <div className="py-8 text-center">
            <h3 className="text-sm font-semibold mb-1">No spinnable text</h3>
            <p className="text-sm text-muted-foreground">
              This post doesn&apos;t contain {'{'} curly brace {'}'} spin
              syntax.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
