'use client';

import { useActionState } from 'react';
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

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        The &ldquo;Text Sawyer directly&rdquo; fallback body shown in the landing page footer.
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
        {state.ok === true && !isPending && (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Saved</span>
        )}
      </div>
    </form>
  );
}
