'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { updateSmsTemplate, type ActionResult } from '@/features/site-config/actions';
import type { SiteConfigRow } from '@/db/schema/site-config';

interface SmsFormProps {
  config: SiteConfigRow;
}

const initialState: ActionResult = { ok: true };

export function SmsForm({ config }: SmsFormProps) {
  const [state, formAction, isPending] = useActionState(updateSmsTemplate, initialState);

  // Dirty-state tracking — mirrors the ContactForm pattern so all four
  // Content tabs use the same Save / Discard sticky footer.
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (state.ok === true && !isPending) {
      setIsDirty(false);
    }
  }, [state, isPending]);

  function discard(): void {
    formRef.current?.reset();
    setIsDirty(false);
  }

  return (
    // pb-20 reserves room beneath the last field so it isn't hidden behind
    // the fixed save bar.
    <form
      ref={formRef}
      action={formAction}
      onChange={() => setIsDirty(true)}
      className="space-y-6 pb-20"
      data-testid="sms-form"
    >
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        The &ldquo;Text directly&rdquo; fallback body shown in the landing page footer.
        Customers who tap the link will have this pre-filled in their Messages app.
      </p>

      <div className="space-y-2">
        <label htmlFor="smsTemplate" className="block text-sm font-medium">
          SMS fallback template
        </label>
        <Textarea
          id="smsTemplate"
          name="smsTemplate"
          defaultValue={config.smsTemplate ?? ''}
          rows={8}
          placeholder="Hi, this is [name here]. I'm interested in your services..."
          data-testid="sms-template-textarea"
        />
        {state.ok === false && state.errors.smsTemplate && (
          <p className="text-xs text-[hsl(var(--destructive))]">
            {state.errors.smsTemplate.join(', ')}
          </p>
        )}
      </div>

      {/* ── Save bar ────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur md:left-72">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <span
            className="text-sm text-[hsl(var(--muted-foreground))]"
            data-testid="sms-saved-indicator"
          >
            {state.ok === true && !isPending && !isDirty ? 'Saved' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={discard}
              disabled={!isDirty || isPending}
              data-testid="sms-discard"
            >
              Discard
            </Button>
            <Button
              type="submit"
              disabled={!isDirty || isPending}
              data-testid="sms-save"
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
