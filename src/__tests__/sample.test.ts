import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn()', () => {
  it('merges simple class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('dedupes conflicting Tailwind utilities (later wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles falsy / conditional inputs cleanly', () => {
    expect(cn('a', false && 'nope', null, undefined, 'b')).toBe('a b');
  });
});
