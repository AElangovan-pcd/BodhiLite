import { z } from 'zod';

export const ResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mc'), choice_id: z.string().nullable() }),
  z.object({ type: z.literal('ma'), choice_ids: z.array(z.string()) }),
  z.object({ type: z.literal('tf'), value: z.boolean().nullable() }),
  z.object({ type: z.literal('numeric'), value: z.string() }),
  z.object({ type: z.literal('short_answer'), value: z.string() }),
  z.object({ type: z.literal('fill_in'), blanks: z.record(z.string(), z.string()) }),
]);

export type Response = z.infer<typeof ResponseSchema>;

export function isResponseEmpty(r: Response | null): boolean {
  if (r == null) return true;
  switch (r.type) {
    case 'mc':
      return r.choice_id == null;
    case 'ma':
      return r.choice_ids.length === 0;
    case 'tf':
      return r.value == null;
    case 'numeric':
      return r.value.trim() === '';
    case 'short_answer':
      return r.value.trim() === '';
    case 'fill_in':
      return Object.values(r.blanks).every((v) => (v ?? '').trim() === '');
  }
}
