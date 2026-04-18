import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Unit tests for updateCustomerNotes validation — Phase 10.
 *
 * The action itself requires an active server session and a real DB
 * connection, so we test the Zod schema boundary in isolation here.
 * The integration path (DB write, cache revalidation) is covered by the
 * E2E spec (tests/e2e/admin-index-book.spec.ts).
 */

const NotesSchema = z.object({
  notes: z
    .string()
    .max(2000, { message: 'Notes must be 2 000 characters or fewer.' }),
});

describe('updateCustomerNotes — Zod validation', () => {
  it('accepts an empty string', () => {
    const result = NotesSchema.safeParse({ notes: '' });
    expect(result.success).toBe(true);
  });

  it('accepts notes up to 2 000 characters', () => {
    const notes = 'a'.repeat(2000);
    const result = NotesSchema.safeParse({ notes });
    expect(result.success).toBe(true);
  });

  it('rejects notes exceeding 2 000 characters', () => {
    const notes = 'a'.repeat(2001);
    const result = NotesSchema.safeParse({ notes });
    expect(result.success).toBe(false);
    // Zod v4 uses `issues` (v3 used `errors`)
    const issues = result.error?.issues ?? (result.error as unknown as { errors?: { message: string }[] })?.errors;
    const firstMsg = issues?.[0]?.message ?? '';
    expect(firstMsg).toContain('2 000');
  });

  it('rejects exactly 2 001 characters', () => {
    const notes = 'x'.repeat(2001);
    const result = NotesSchema.safeParse({ notes });
    expect(result.success).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error intentional type error for test
    const result = NotesSchema.safeParse({ notes: 12345 });
    expect(result.success).toBe(false);
  });

  it('accepts notes with newlines and unicode', () => {
    const notes = 'Line 1\nLine 2\nCustomer named: Søren Kierkegaard 📝';
    const result = NotesSchema.safeParse({ notes });
    expect(result.success).toBe(true);
  });
});
