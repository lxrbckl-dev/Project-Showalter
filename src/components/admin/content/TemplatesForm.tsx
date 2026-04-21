'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  const prefillSubjectErrors =
    state.ok === false ? (state.errors.emailTemplateSubject ?? []) : [];
  const prefillBodyErrors =
    state.ok === false ? (state.errors.emailTemplateBody ?? []) : [];

  // Same dirty-state + sticky-save-bar pattern as ContactForm so all four
  // Content tabs feel identical.
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
    <form
      ref={formRef}
      action={formAction}
      onChange={() => setIsDirty(true)}
      className="space-y-8 pb-20"
      data-testid="templates-form"
    >
      {state.ok === false && state.errors._root && (
        <p className="text-sm text-[hsl(var(--destructive))]">{state.errors._root.join(', ')}</p>
      )}

      {/* ── Email pre-fills ─────────────────────────────────────────────
        Visitor-facing mailto pre-population when someone taps the Email
        icon on the public Contact section. Plain text (no template
        variables) — admin maintains it free-form. Both fields optional.
      */}
      <section className="space-y-4 rounded-lg border border-[hsl(var(--border))] p-4">
        <header>
          <h3 className="text-sm font-semibold">Email pre-fills</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Pre-populates the subject and body when a visitor taps the Email
            icon on your Contact section. Both optional.
          </p>
        </header>

        <div className="space-y-1.5">
          <label htmlFor="emailTemplateSubject" className="block text-sm font-medium">
            Subject line
          </label>
          <Input
            id="emailTemplateSubject"
            name="emailTemplateSubject"
            type="text"
            defaultValue={config.emailTemplateSubject ?? ''}
            placeholder="Service inquiry"
            data-testid="contact-email-template-subject"
          />
          {prefillSubjectErrors.length > 0 && (
            <p className="text-xs text-[hsl(var(--destructive))]">
              {prefillSubjectErrors.join(', ')}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="emailTemplateBody" className="block text-sm font-medium">
            Body
          </label>
          <Textarea
            id="emailTemplateBody"
            name="emailTemplateBody"
            defaultValue={config.emailTemplateBody ?? ''}
            rows={6}
            placeholder={"Hi,\n\nI'd like to inquire about a service for my home.\n\nDetails:\n\n\nThanks!"}
            data-testid="contact-email-template-body"
          />
          {prefillBodyErrors.length > 0 && (
            <p className="text-xs text-[hsl(var(--destructive))]">
              {prefillBodyErrors.join(', ')}
            </p>
          )}
        </div>
      </section>

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

      {/* ── Save bar ────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur md:left-72">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <span
            className="text-sm text-[hsl(var(--muted-foreground))]"
            data-testid="templates-saved-indicator"
          >
            {state.ok === true && !isPending && !isDirty ? 'Saved' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={discard}
              disabled={!isDirty || isPending}
              data-testid="templates-discard"
            >
              Discard
            </Button>
            <Button
              type="submit"
              disabled={!isDirty || isPending}
              data-testid="templates-save"
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
