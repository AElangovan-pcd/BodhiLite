'use client';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export type SubmitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unansweredCount: number;
  unansweredLabels: string[];
  onConfirm: () => void;
  submitting: boolean;
};

export function SubmitDialog({
  open,
  onOpenChange,
  unansweredCount,
  unansweredLabels,
  onConfirm,
  submitting,
}: SubmitDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Submit attempt?</AlertDialogTitle>
        <AlertDialogDescription>
          {unansweredCount === 0
            ? 'This will end your attempt and reveal correct answers. Continue?'
            : `${unansweredCount} question${unansweredCount === 1 ? '' : 's'} unanswered: ${unansweredLabels.join(', ')}. They will be scored as 0. Submit anyway?`}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Submitting…' : unansweredCount === 0 ? 'Submit' : 'Submit anyway'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
