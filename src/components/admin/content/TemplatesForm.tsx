'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { updateTemplates, type ActionResult } from '@/features/site-config/actions';
import {
  TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  getVariablesForTemplate,
  type TemplateKey,
} from '@/features/templates/variables';
import type { SiteConfigRow } from '@/db/schema/site-config';

interface TemplatesFormProps {
  config: SiteConfigRow;
}

const initialState: ActionResult = { ok: true };

/** Maps TemplateKey to the SiteConfigRow field name */
const FIELD_MAP: Record<TemplateKey, keyof SiteConfigRow> = {
  confirmation_email: 'templateConfirmationEmail',
  confirmation_sms: 'templateConfirmationSms',
  decline_email: 'templateDeclineEmail',
  decline_sms: 'templateDeclineSms',
  review_request_email: 'templateReviewRequestEmail',
  review_request_sms: 'templateReviewRequestSms',
  reschedule_email: 'templateRescheduleEmail',
  reschedule_sms: 'templateRescheduleSms',
};

/** Maps TemplateKey to the form field name (camelCase, matching actions.ts) */
const FORM_FIELD_MAP: Record<TemplateKey, string> = {
  confirmation_email: 'templateConfirmationEmail',
  confirmation_sms: 'templateConfirmationSms',
  decline_email: 'templateDeclineEmail',
  decline_sms: 'templateDeclineSms',
  review_request_email: 'templateReviewRequestEmail',
  review_request_sms: 'templateReviewRequestSms',
  reschedule_email: 'templateRescheduleEmail',
  reschedule_sms: 'templateRescheduleSms',
};

export function TemplatesForm({ config }: TemplatesFormProps) {
  const [state, formAction, isPending] = useActionState(updateTemplates, initialState);

  return (
    <form action={formAction} className="space-y-8">
      {state.ok === false && state.errors._root && (
        <p className="text-sm text-[hsl(var(--destructive))]">{state.errors._root.join(', ')}</p>
      )}

      {TEMPLATE_KEYS.map((key) => {
        const fieldKey = FIELD_MAP[key];
        const formFieldName = FORM_FIELD_MAP[key];
        const defaultValue = (config[fieldKey] as string | null) ?? '';
        const variables = getVariablesForTemplate(key);
        const errors =
          state.ok === false ? (state.errors[formFieldName] ?? []) : [];

        return (
          <div key={key} className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-4">
            <div className="flex items-start justify-between gap-4">
              <label
                htmlFor={formFieldName}
                className="block text-sm font-semibold"
              >
                {TEMPLATE_LABELS[key]}
              </label>

              {/* Variable reference badge list */}
              {variables.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {variables.map((v) => (
                    <span
                      key={v.placeholder}
                      title={v.description}
                      className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs font-mono text-[hsl(var(--muted-foreground))] cursor-help"
                    >
                      {v.placeholder}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Textarea
              id={formFieldName}
              name={formFieldName}
              defaultValue={defaultValue}
              rows={6}
              className="font-mono text-xs"
            />

            {errors.length > 0 && (
              <p className="text-xs text-[hsl(var(--destructive))]">{errors.join(', ')}</p>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save all templates'}
        </Button>
        {state.ok === true && !isPending && (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Saved</span>
        )}
      </div>
    </form>
  );
}
