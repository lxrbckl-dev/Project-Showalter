'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/features/push/actions';

/**
 * Admin push-subscribe control — Phase 8A.
 *
 * Rendered inside the admin shell (client component — it needs window
 * APIs: Notification, navigator.serviceWorker, PushManager). The server
 * passes the VAPID public key as a prop so we don't need a
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY env var (Next would inline it, which
 * leaks into public bundles unnecessarily).
 *
 * State machine:
 *
 *   unsupported  — browser has no serviceWorker / Notification / PushManager
 *   loading      — querying permission + existing subscription
 *   blocked      — permission === 'denied' (user must reset in browser settings)
 *   enabled      — we have a subscription AND the DB confirms it
 *   disabled     — no subscription, or subscription not known to the DB
 *   enabling     — in-flight subscribe
 *   disabling    — in-flight unsubscribe
 */

type UiState =
  | { kind: 'unsupported' }
  | { kind: 'loading' }
  | { kind: 'blocked' }
  | { kind: 'disabled' }
  | { kind: 'enabled'; endpoint: string }
  | { kind: 'enabling' }
  | { kind: 'disabling'; endpoint: string }
  | { kind: 'error'; message: string };

export interface PushSubscribeButtonProps {
  /** VAPID public key in base64url. Server-rendered, so never empty in prod. */
  vapidPublicKey: string;
}

function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

function isPushCapable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

export function PushSubscribeButton({
  vapidPublicKey,
}: PushSubscribeButtonProps) {
  const [state, setState] = useState<UiState>({ kind: 'loading' });

  const sync = useCallback(async () => {
    if (!isPushCapable()) {
      setState({ kind: 'unsupported' });
      return;
    }
    if (Notification.permission === 'denied') {
      setState({ kind: 'blocked' });
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) {
        setState({ kind: 'disabled' });
        return;
      }
      const subscribed = await isPushSubscribed(sub.endpoint);
      if (subscribed) {
        setState({ kind: 'enabled', endpoint: sub.endpoint });
      } else {
        // We have a browser-side subscription but the server doesn't know
        // about it — treat as disabled so the admin can re-sync.
        setState({ kind: 'disabled' });
      }
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Push check failed',
      });
    }
  }, []);

  useEffect(() => {
    void sync();
  }, [sync]);

  const onEnable = useCallback(async () => {
    if (!vapidPublicKey) {
      setState({
        kind: 'error',
        message: 'Push is not configured — ask Alex to set VAPID_PUBLIC_KEY.',
      });
      return;
    }
    setState({ kind: 'enabling' });
    try {
      // SW should already be registered by manifest layer; ensure it.
      const existing = await navigator.serviceWorker.getRegistration('/sw.js');
      const registration =
        existing ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') {
          setState({ kind: 'blocked' });
        } else {
          setState({ kind: 'disabled' });
        }
        return;
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
      });

      // PushSubscription.toJSON() returns the shape the server expects.
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Browser returned an incomplete subscription');
      }

      const result = await subscribeToPush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (!result.ok) {
        setState({
          kind: 'error',
          message:
            result.kind === 'validation'
              ? 'The browser subscription was rejected by the server.'
              : 'Sign in as an admin to subscribe.',
        });
        return;
      }
      setState({ kind: 'enabled', endpoint: json.endpoint });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Subscribe failed';
      setState({ kind: 'error', message: msg });
    }
  }, [vapidPublicKey]);

  const onDisable = useCallback(async () => {
    if (state.kind !== 'enabled') return;
    const endpoint = state.endpoint;
    setState({ kind: 'disabling', endpoint });
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          // Non-fatal — the server-side row is what matters for delivery.
        }
      }
      await unsubscribeFromPush(endpoint);
      setState({ kind: 'disabled' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unsubscribe failed';
      setState({ kind: 'error', message: msg });
    }
  }, [state]);

  if (state.kind === 'loading') {
    return (
      <div
        data-testid="push-subscribe-loading"
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]"
      >
        Checking push notifications…
      </div>
    );
  }

  if (state.kind === 'unsupported') {
    return (
      <div
        data-testid="push-subscribe-unsupported"
        className="rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]"
      >
        This browser doesn&apos;t support push notifications.
      </div>
    );
  }

  if (state.kind === 'blocked') {
    return (
      <div
        data-testid="push-subscribe-blocked"
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm"
      >
        <strong className="font-medium">Notifications are blocked.</strong>{' '}
        Enable notifications for this site in your browser settings, then
        reload this page.
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div
        data-testid="push-subscribe-error"
        className="rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--card))] px-4 py-3 text-sm"
      >
        <div className="font-medium">Push setup failed.</div>
        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          {state.message}
        </div>
        <button
          type="button"
          data-testid="push-subscribe-retry"
          onClick={() => void sync()}
          className="mt-2 rounded-md border border-[hsl(var(--border))] px-3 py-1 text-xs"
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.kind === 'enabled') {
    return (
      <div
        data-testid="push-subscribe-enabled"
        className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm"
      >
        <div>
          <div className="font-medium">Push: enabled on this device</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            You&apos;ll get a notification when a new booking lands.
          </div>
        </div>
        <button
          type="button"
          data-testid="push-subscribe-unsubscribe"
          onClick={() => void onDisable()}
          className="rounded-md border border-[hsl(var(--border))] px-3 py-1 text-xs"
        >
          Unsubscribe
        </button>
      </div>
    );
  }

  if (state.kind === 'disabling') {
    return (
      <div
        data-testid="push-subscribe-disabling"
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]"
      >
        Unsubscribing…
      </div>
    );
  }

  if (state.kind === 'enabling') {
    return (
      <div
        data-testid="push-subscribe-enabling"
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]"
      >
        Subscribing…
      </div>
    );
  }

  // disabled
  return (
    <div
      data-testid="push-subscribe-disabled"
      className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm"
    >
      <div>
        <div className="font-medium">Turn on push notifications</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          Get buzzed on this device when a new booking arrives.
        </div>
      </div>
      <button
        type="button"
        data-testid="push-subscribe-subscribe"
        onClick={() => void onEnable()}
        className="rounded-md bg-[hsl(var(--primary))] px-3 py-1 text-xs text-[hsl(var(--primary-foreground))]"
      >
        Enable
      </button>
    </div>
  );
}
