'use client';

import type { RenderOutput } from '@/lib/rendering';

export function RevealPanel({ output }: { output: RenderOutput }) {
  return (
    <details className="mt-4 rounded border p-2 text-sm" open>
      <summary className="cursor-pointer font-medium">Reveal</summary>
      <div className="mt-2 grid gap-2">
        <div>
          <div className="text-muted-foreground text-xs">Materialized values</div>
          <pre className="overflow-x-auto text-xs">
            {JSON.stringify(output.materialized_values, null, 2)}
          </pre>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Grading target</div>
          <pre className="overflow-x-auto text-xs">
            {JSON.stringify(output.grading_target, null, 2)}
          </pre>
        </div>
        {output.validation_errors.length > 0 && (
          <div>
            <div className="text-destructive text-xs">Validation errors</div>
            <ul className="text-destructive text-xs">
              {output.validation_errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
