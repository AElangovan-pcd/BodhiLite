import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (className merger)', () => {
  it('joins classes', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });
});
