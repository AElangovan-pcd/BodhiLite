'use client';

import { Button } from '@/components/ui/button';

export function ActionBar({
  saving,
  dirty,
  onSave,
  onSaveAndNext,
  onDiscard,
  nextDisabled,
}: {
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  onSaveAndNext: () => void;
  onDiscard: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-2 flex items-center gap-2 border-t bg-background/95 px-2 py-2 backdrop-blur">
      <Button onClick={onSave} disabled={saving || !dirty}>Save</Button>
      <Button onClick={onSaveAndNext} disabled={saving || !dirty || nextDisabled} variant="outline">
        Save &amp; Next
      </Button>
      <Button onClick={onDiscard} disabled={saving || !dirty} variant="ghost">
        Discard changes
      </Button>
      {dirty && <span className="text-muted-foreground text-xs">Unsaved changes</span>}
    </div>
  );
}
