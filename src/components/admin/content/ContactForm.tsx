'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateContact, type ActionResult } from '@/features/site-config/actions';
import type { SiteConfigRow } from '@/db/schema/site-config';

interface ContactFormProps {
  config: SiteConfigRow;
}

const initialState: ActionResult = { ok: true };

export function ContactForm({ config }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(updateContact, initialState);

  const fieldError = (key: keyof Extract<ActionResult, { ok: false }>['errors']): string[] | undefined =>
    state.ok === false ? state.errors[key] : undefined;

  // Dirty-state tracking — `onChange` on the form bubbles from every field,
  // including selects and file inputs (React normalizes these). We flip
  // `isDirty` on the first edit and clear it whenever a save succeeds.
  // Discard restores all `defaultValue`s via the native form.reset().
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
    // pb-20 reserves room at the bottom of the form so the very last field
    // doesn't end up hidden behind the fixed save bar.
    <form
      ref={formRef}
      action={formAction}
      onChange={() => setIsDirty(true)}
      className="space-y-8 pb-20"
      data-testid="contact-form"
    >
      {state.ok === false && state.errors._root && (
        <p className="rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {state.errors._root.join(', ')}
        </p>
      )}

      {/* ── Personal info ─────────────────────────────────────────────── */}
      <section className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold">Personal info</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Drives the public Contact section and the &ldquo;About {'{name}'}&rdquo; heading.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="ownerFirstName" className="block text-sm font-medium">
              Your first name
            </label>
            <Input
              id="ownerFirstName"
              name="ownerFirstName"
              type="text"
              defaultValue={config.ownerFirstName ?? ''}
              placeholder="Sawyer"
              data-testid="contact-owner-first-name"
            />
            {fieldError('ownerFirstName') && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {fieldError('ownerFirstName')!.join(', ')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-sm font-medium">
              Phone
            </label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={config.phone ?? ''}
              placeholder="+19133097340"
              data-testid="contact-phone"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">E.164 format, e.g. +19133097340</p>
            {fieldError('phone') && (
              <p className="text-xs text-[hsl(var(--destructive))]">{fieldError('phone')!.join(', ')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={config.email ?? ''}
              placeholder="you@example.com"
              data-testid="contact-email"
            />
            {fieldError('email') && (
              <p className="text-xs text-[hsl(var(--destructive))]">{fieldError('email')!.join(', ')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tiktokUrl" className="block text-sm font-medium">
              TikTok URL
            </label>
            <Input
              id="tiktokUrl"
              name="tiktokUrl"
              type="url"
              defaultValue={config.tiktokUrl ?? ''}
              placeholder="https://www.tiktok.com/@showalterservices"
              data-testid="contact-tiktok-url"
            />
            {fieldError('tiktokUrl') && (
              <p className="text-xs text-[hsl(var(--destructive))]">{fieldError('tiktokUrl')!.join(', ')}</p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-1">
            <label htmlFor="dateOfBirth" className="block text-sm font-medium">
              Date of birth
            </label>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={config.dateOfBirth ?? ''}
              data-testid="contact-date-of-birth"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Optional — drives the <code>[age]</code> placeholder in the bio.
            </p>
            {fieldError('dateOfBirth') && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {fieldError('dateOfBirth')!.join(', ')}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Bio ─────────────────────────────────────────────────────── */}
      <section className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold">Bio</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Shown in the About section on the landing page. Up to 2,000 characters.
          </p>
        </header>

        <div className="space-y-1.5">
          <label htmlFor="bio" className="sr-only">
            Bio
          </label>
          <Textarea
            id="bio"
            name="bio"
            defaultValue={config.bio ?? ''}
            rows={6}
            placeholder="Tell visitors about yourself... Use [age] to auto-fill Sawyer's current age."
            data-testid="contact-bio"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Tip: insert <code>[age]</code> anywhere in the bio and it will be replaced with
            Sawyer&rsquo;s current age (from the DOB above) on every page render.
          </p>
          {fieldError('bio') && (
            <p className="text-xs text-[hsl(var(--destructive))]">{fieldError('bio')!.join(', ')}</p>
          )}
        </div>
      </section>

      {/* ── Email pre-fills ─────────────────────────────────────────── */}
      <section className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold">Email pre-fills</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Pre-populates the subject and body when a visitor taps the Email icon on your Contact section. Both optional.
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
            placeholder="Service inquiry — Sawyer Showalter Services"
            data-testid="contact-email-template-subject"
          />
          {fieldError('emailTemplateSubject') && (
            <p className="text-xs text-[hsl(var(--destructive))]">
              {fieldError('emailTemplateSubject')!.join(', ')}
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
            placeholder={"Hi Sawyer,\n\nI'd like to inquire about a service for my home.\n\nDetails:\n\n\nThanks!"}
            data-testid="contact-email-template-body"
          />
          {fieldError('emailTemplateBody') && (
            <p className="text-xs text-[hsl(var(--destructive))]">
              {fieldError('emailTemplateBody')!.join(', ')}
            </p>
          )}
        </div>
      </section>

      {/* ── Save bar ──────────────────────────────────────────────────────
        Pinned to the bottom of the viewport. Inner wrapper mirrors the
        admin shell's `mx-auto max-w-6xl px-6` so the controls line up with
        the form fields above. `justify-between` puts the "Saved" indicator
        on the left and the action buttons on the right.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <span
            className="text-sm text-[hsl(var(--muted-foreground))]"
            data-testid="contact-saved-indicator"
          >
            {state.ok === true && !isPending && !isDirty ? 'Saved' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={discard}
              disabled={!isDirty || isPending}
              data-testid="contact-discard"
            >
              Discard
            </Button>
            <Button
              type="submit"
              disabled={!isDirty || isPending}
              data-testid="contact-save"
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
