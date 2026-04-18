'use client';

import { useState, useTransition } from 'react';
import { updateCustomerNotes } from '@/features/customers/actions';

/**
 * Inline notes editor for the INDEX book customer detail page — Phase 10.
 *
 * Renders a textarea pre-filled with the current notes value. On submit,
 * calls the `updateCustomerNotes` server action and shows inline
 * success / error feedback.
 */
interface NotesEditorProps {
  customerId: number;
  initialNotes: string | null;
}

const MAX_NOTES = 2000;

export function NotesEditor({ customerId, initialNotes }: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg(null);
    startTransition(async () => {
      const result = await updateCustomerNotes(customerId, notes);
      if (result.ok) {
        setStatus('saved');
        // Reset to idle after 2 seconds
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('error');
        setErrorMsg(result.error);
      }
    });
  }

  const remaining = MAX_NOTES - notes.length;
  const isOverLimit = remaining < 0;

  return (
    <form onSubmit={handleSubmit} data-testid="notes-editor">
      <div className="space-y-2">
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            if (status === 'saved') setStatus('idle');
          }}
          rows={5}
          maxLength={MAX_NOTES}
          placeholder="No admin notes yet…"
          data-testid="notes-textarea"
          className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${isOverLimit ? 'text-red-500' : 'text-[hsl(var(--muted-foreground))]'}`}
            data-testid="notes-char-count"
          >
            {remaining.toLocaleString()} characters remaining
          </span>
          <div className="flex items-center gap-3">
            {status === 'saved' && (
              <span
                className="text-xs text-green-600"
                data-testid="notes-saved-indicator"
              >
                Saved
              </span>
            )}
            {status === 'error' && errorMsg && (
              <span
                className="text-xs text-red-500"
                data-testid="notes-error"
              >
                {errorMsg}
              </span>
            )}
            <button
              type="submit"
              disabled={isPending || isOverLimit}
              data-testid="notes-save-button"
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save notes'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
