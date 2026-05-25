export type SeedInput = {
  student_id: string;
  assessment_id: string;
  attempt_no: number;
};

export async function stableSeed(input: SeedInput): Promise<number> {
  const key = `${input.student_id}|${input.assessment_id}|${input.attempt_no}`;
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);

  // Take first 7 bytes (56 bits) and mask to 53 bits to stay within
  // Number.MAX_SAFE_INTEGER without losing precision.
  let seed = 0;
  for (let i = 0; i < 7; i++) {
    seed = seed * 256 + bytes[i]!;
  }
  return seed % Number.MAX_SAFE_INTEGER;
}
