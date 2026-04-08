import { useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { securityQuestionsSchema, SECURITY_QUESTIONS, type SecurityQuestionsInput } from '@sms/shared';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSecurityQuestionsStatus, useUpdateSecurityQuestions } from '../../../hooks/use-settings';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../../../components/ui/form';

interface SecurityQuestionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SecurityQuestionsModal({ open, onOpenChange }: SecurityQuestionsModalProps) {
  const { data: status } = useSecurityQuestionsStatus();
  const updateQuestions = useUpdateSecurityQuestions();

  const form = useForm<SecurityQuestionsInput>({
    resolver: zodResolver(securityQuestionsSchema),
    defaultValues: {
      questions: [
        { questionIndex: 0, answer: '' },
        { questionIndex: 1, answer: '' },
        { questionIndex: 2, answer: '' },
      ],
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: 'questions',
  });

  useEffect(() => {
    if (!open || !status) return;
    if (status.configured && status.questionIndices.length === 3) {
      form.reset({
        questions: status.questionIndices.map((idx) => ({
          questionIndex: idx,
          answer: '',
        })),
      });
    } else {
      form.reset({
        questions: [
          { questionIndex: 0, answer: '' },
          { questionIndex: 1, answer: '' },
          { questionIndex: 2, answer: '' },
        ],
      });
    }
  }, [open, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const watchedQuestions = form.watch('questions');
  const selectedIndices = useMemo(
    () => watchedQuestions.map(q => q.questionIndex),
    [watchedQuestions],
  );

  function getAvailableQuestions(currentIndex: number): Array<{ index: number; text: string }> {
    return SECURITY_QUESTIONS.map((text, idx) => ({ index: idx, text }))
      .filter(q => !selectedIndices.includes(q.index) || q.index === selectedIndices[currentIndex]);
  }

  async function onSubmit(data: SecurityQuestionsInput) {
    try {
      await updateQuestions.mutateAsync(data);
      form.reset();
      onOpenChange(false);
      toast.success('Security questions saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast.error(message);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) form.reset();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Security Questions</DialogTitle>
          <DialogDescription>
            Configure 3 security questions for account recovery.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {fields.map((field, index) => {
              const available = getAvailableQuestions(index);
              return (
                <div key={field.id} className="space-y-3">
                  <FormField
                    control={form.control}
                    name={`questions.${index}.questionIndex`}
                    render={({ field: selectField }) => (
                      <FormItem>
                        <FormLabel>Question {index + 1}</FormLabel>
                        <Select
                          onValueChange={(val) => selectField.onChange(Number(val))}
                          value={String(selectField.value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a question" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {available.map(q => (
                              <SelectItem key={q.index} value={String(q.index)}>
                                {q.text}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`questions.${index}.answer`}
                    render={({ field: answerField }) => (
                      <FormItem>
                        <FormLabel>Answer {index + 1}</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your answer" {...answerField} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              );
            })}

            <p className="text-sm text-muted-foreground">
              Answers are case-insensitive. You will need all 3 correct answers to recover your account.
            </p>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateQuestions.isPending}>
                {updateQuestions.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Security Questions
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
