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
        <label htmlFor="bio" className="block text-sm font-medium">
          Bio <span className="text-[hsl(var(--muted-foreground))]">(max 2000 chars)</span>
        </label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={config.bio ?? ''}
          rows={6}
          placeholder="Tell visitors about yourself..."
          data-testid="contact-bio"
        />
        {state.ok === false && state.errors.bio && (
          <p className="text-xs text-[hsl(var(--destructive))]">{state.errors.bio.join(', ')}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="hero_image_path_ro" className="block text-sm font-medium">
          Hero image path{' '}
          <span className="text-[hsl(var(--muted-foreground))]">(read-only — managed in Phase 3C)</span>
        </label>
        <Input
          id="hero_image_path_ro"
          value={config.heroImagePath ?? ''}
          readOnly
          disabled
          className="opacity-60"
        />
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
