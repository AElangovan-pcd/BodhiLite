import { describe, it, expect } from 'vitest';
import { ResponseSchema, isResponseEmpty } from './response';

describe('ResponseSchema', () => {
  it('accepts a valid mc response', () => {
    const r = ResponseSchema.parse({ type: 'mc', choice_id: 'a' });
    expect(r.type).toBe('mc');
  });

  it('accepts null choice_id (unanswered mc)', () => {
    expect(() => ResponseSchema.parse({ type: 'mc', choice_id: null })).not.toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => ResponseSchema.parse({ type: 'bogus' })).toThrow();
  });

  it('accepts ma with array', () => {
    const r = ResponseSchema.parse({ type: 'ma', choice_ids: ['a', 'b'] });
    expect(r).toEqual({ type: 'ma', choice_ids: ['a', 'b'] });
  });

  it('accepts numeric raw value as string', () => {
    const r = ResponseSchema.parse({ type: 'numeric', value: '4.5' });
    expect(r.type).toBe('numeric');
  });

  it('accepts fill_in blanks as record', () => {
    const r = ResponseSchema.parse({ type: 'fill_in', blanks: { b1: 'x', b2: '' } });
    expect(r).toEqual({ type: 'fill_in', blanks: { b1: 'x', b2: '' } });
  });
});

describe('isResponseEmpty', () => {
  it('treats null mc choice as empty', () => {
    expect(isResponseEmpty({ type: 'mc', choice_id: null })).toBe(true);
  });
  it('treats non-null mc choice as non-empty', () => {
    expect(isResponseEmpty({ type: 'mc', choice_id: 'a' })).toBe(false);
  });
  it('treats empty ma set as empty', () => {
    expect(isResponseEmpty({ type: 'ma', choice_ids: [] })).toBe(true);
  });
  it('treats whitespace-only short_answer as empty', () => {
    expect(isResponseEmpty({ type: 'short_answer', value: '   ' })).toBe(true);
  });
  it('treats null tf as empty', () => {
    expect(isResponseEmpty({ type: 'tf', value: null })).toBe(true);
  });
  it('treats fill_in with all-empty blanks as empty', () => {
    expect(isResponseEmpty({ type: 'fill_in', blanks: { b1: '', b2: '   ' } })).toBe(true);
  });
  it('treats fill_in with one non-empty blank as non-empty', () => {
    expect(isResponseEmpty({ type: 'fill_in', blanks: { b1: '', b2: 'x' } })).toBe(false);
  });
});
