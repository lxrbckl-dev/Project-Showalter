'use client';

import { useActionState } from 'react';
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

  return (
    <form action={formAction} className="space-y-6 max-w-xl" data-testid="contact-form">
      {state.ok === false && state.errors._root && (
        <p className="text-sm text-[hsl(var(--destructive))]">{state.errors._root.join(', ')}</p>
      )}

      <div className="space-y-2">
        <label htmlFor="ownerFirstName" className="block text-sm font-medium">
          Your first name{' '}
          <span className="text-[hsl(var(--muted-foreground))]">
            (drives the &ldquo;About {'{name}'}&rdquo; heading on the public page)
          </span>
        </label>
        <Input
          id="ownerFirstName"
          name="ownerFirstName"
          type="text"
          defaultValue={config.ownerFirstName ?? ''}
          placeholder="Sawyer"
          data-testid="contact-owner-first-name"
        />
        {state.ok === false && state.errors.ownerFirstName && (
          <p className="text-xs text-[hsl(var(--destructive))]">
            {state.errors.ownerFirstName.join(', ')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="phone" className="block text-sm font-medium">
          Phone (E.164, e.g. +19133097340)
        </label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={config.phone ?? ''}
          placeholder="+19133097340"
          data-testid="contact-phone"
        />
        {state.ok === false && state.errors.phone && (
          <p className="text-xs text-[hsl(var(--destructive))]">{state.errors.phone.join(', ')}</p>
        )}
      </div>

      <div className="space-y-2">
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
        {state.ok === false && state.errors.email && (
          <p className="text-xs text-[hsl(var(--destructive))]">{state.errors.email.join(', ')}</p>
        )}
      </div>

      <div className="space-y-2">
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
        {state.ok === false && state.errors.tiktokUrl && (
          <p className="text-xs text-[hsl(var(--destructive))]">{state.errors.tiktokUrl.join(', ')}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="emailTemplateSubject" className="block text-sm font-medium">
          Email template subject
        </label>
        <Input
          id="emailTemplateSubject"
          name="emailTemplateSubject"
          type="text"
          defaultValue={config.emailTemplateSubject ?? ''}
          placeholder="Service inquiry — Sawyer Showalter Services"
          data-testid="contact-email-template-subject"
        />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Pre-fills the subject when a visitor clicks Email on your Contact section.
        </p>
        {state.ok === false && state.errors.emailTemplateSubject && (
          <p className="text-xs text-[hsl(var(--destructive))]">
            {state.errors.emailTemplateSubject.join(', ')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="emailTemplateBody" className="block text-sm font-medium">
          Email template body
        </label>
        <Textarea
          id="emailTemplateBody"
          name="emailTemplateBody"
          defaultValue={config.emailTemplateBody ?? ''}
          rows={6}
          placeholder={"Hi Sawyer,\n\nI'd like to inquire about a service for my home.\n\nDetails:\n\n\nThanks!"}
          data-testid="contact-email-template-body"
        />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Pre-fills the message body when a visitor clicks Email on your Contact section.
        </p>
        {state.ok === false && state.errors.emailTemplateBody && (
          <p className="text-xs text-[hsl(var(--destructive))]">
            {state.errors.emailTemplateBody.join(', ')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="dateOfBirth" className="block text-sm font-medium">
          Date of birth{' '}
          <span className="text-[hsl(var(--muted-foreground))]">
            (optional — drives the <code>[age]</code> placeholder in the bio)
          </span>
        </label>
        <Input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          defaultValue={config.dateOfBirth ?? ''}
          data-testid="contact-date-of-birth"
        />
        {state.ok === false && state.errors.dateOfBirth && (
          <p className="text-xs text-[hsl(var(--destructive))]">
            {state.errors.dateOfBirth.join(', ')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="bio" className="block text-sm font-medium">
          Bio <span className="text-[hsl(var(--muted-foreground))]">(max 2000 chars)</span>
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
          Sawyer&rsquo;s current age (derived from his DOB above) whenever the page is rendered.
        </p>
        {state.ok === false && state.errors.bio && (
          <p className="text-xs text-[hsl(var(--destructive))]">{state.errors.bio.join(', ')}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} data-testid="contact-save">
          {isPending ? 'Saving…' : 'Save'}
        </Button>
        {state.ok === true && !isPending && (
          <span className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="contact-saved-indicator">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
