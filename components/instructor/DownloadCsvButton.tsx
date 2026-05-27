'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Props = {
  assessmentId: string;
  assessmentTitle: string;
};

function extractFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

export function DownloadCsvButton({ assessmentId, assessmentTitle }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/gradebook/${assessmentId}/csv`);
      if (!res.ok) {
        toast.error(`Download failed: ${res.status} ${res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = extractFilename(res.headers.get('Content-Disposition'), 'gradebook.csv');
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Download failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={`Download gradebook CSV for ${assessmentTitle}`}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          <span aria-live="polite">Preparing download…</span>
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download CSV
        </>
      )}
    </Button>
  );
}
