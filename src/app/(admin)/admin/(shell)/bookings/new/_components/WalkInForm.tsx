'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminCreateBooking,
  type AdminCreateResult,
} from '@/features/bookings/admin-create';

/**
 * Walk-in admin booking form — Phase 6.
 *
 * Two modes, toggleable:
 *   - "Pick existing customer" — dropdown + type-to-filter over the recent
 *     customers seeded by the server. Picking one reveals the service /
 *     start / notes fields only. Optional address override when the
 *     customer has multiple addresses on file.
 *   - "+ New customer"          — inline name / phone / email / address
 *                                 fields. Phone validation happens
 *                                 server-side.
 *
 * Soft warnings: when the server returns `kind: 'warnings'`, we render a
 * banner and swap the submit button to "Submit anyway" which re-sends the
 * same payload with `force=true`.
 */

export type CustomerSummary = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  primaryAddress: string | null;
};

export type ServiceSummary = { id: number; name: string };

export function WalkInForm({
  timezone,
  services,
  initialCustomers,
}: {
  timezone: string;
  services: ServiceSummary[];
  initialCustomers: CustomerSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<'existing' | 'new'>(
    initialCustomers.length > 0 ? 'existing' : 'new',
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    initialCustomers[0]?.id ?? null,
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [serviceId, setServiceId] = useState<number>(
    services[0]?.id ?? 0,
  );
  const [startAtLocal, setStartAtLocal] = useState('');
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
    {},
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pendingWarnings, setPendingWarnings] = useState<
    AdminCreateResult & { ok: false; kind: 'warnings' } | null
  >(null);

  function buildFormData(force: boolean): FormData {
    const fd = new FormData();
    fd.set('serviceId', String(serviceId));
    if (startAtLocal) {
      const asDate = new Date(startAtLocal);
      if (!Number.isNaN(asDate.getTime())) {
        fd.set('startAt', asDate.toISOString());
      }
    }
    fd.set('notes', notes);
    fd.set('force', force ? 'true' : 'false');
    if (mode === 'existing' && selectedCustomerId) {
      fd.set('customerId', String(selectedCustomerId));
      if (address) fd.set('address', address);
    } else {
      fd.set('name', name);
      fd.set('phone', phone);
      if (email) fd.set('email', email);
      fd.set('address', address);
    }
    return fd;
  }

  function submit(force: boolean): void {
    setFieldErrors({});
    setMessage(null);
    const fd = buildFormData(force);
    startTransition(async () => {
      const result = await adminCreateBooking(fd);
      if (result.ok) {
        router.push(`/admin/inbox/${result.booking.id}`);
        return;
      }
      if (result.kind === 'validation') {
        setFieldErrors(result.fieldErrors);
        setMessage('Please fix the errors above.');
      } else if (result.kind === 'warnings') {
        setPendingWarnings(result);
        setMessage(
          'Heads up — this booking triggers a soft warning. Submit anyway if intentional.',
        );
      } else if (result.kind === 'slot_taken') {
        setMessage(
          'That exact start time is already booked — pick another.',
        );
      } else if (result.kind === 'service_inactive') {
        setMessage('That service is no longer active.');
      } else if (result.kind === 'customer_not_found') {
        setMessage('The selected customer could not be loaded.');
      } else {
        setMessage('Something went wrong. Please try again.');
      }
    });
  }

  const selectedCustomer = initialCustomers.find(
    (c) => c.id === selectedCustomerId,
  ) ?? null;

  return (
    <form
      data-testid="walkin-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-6"
    >
      <section className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Customer</h2>
          <div className="ml-auto flex gap-2 text-xs">
            <button
              type="button"
              data-testid="mode-existing"
              onClick={() => setMode('existing')}
              className={cx(
                'rounded-md px-2 py-1',
                mode === 'existing'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'border border-[hsl(var(--border))]',
              )}
            >
              Existing
            </button>
            <button
              type="button"
              data-testid="mode-new"
              onClick={() => setMode('new')}
              className={cx(
                'rounded-md px-2 py-1',
                mode === 'new'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'border border-[hsl(var(--border))]',
              )}
            >
              + New
            </button>
          </div>
        </div>

        {mode === 'existing' ? (
          <div className="space-y-3">
            <label className="flex flex-col text-sm">
              Pick a customer
              <select
                value={selectedCustomerId ?? ''}
                onChange={(e) =>
                  setSelectedCustomerId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                data-testid="select-customer"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              >
                {initialCustomers.length === 0 && (
                  <option value="">— no recent customers —</option>
                )}
                {initialCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone}
                  </option>
                ))}
              </select>
            </label>
            {selectedCustomer && (
              <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
                <div>
                  <strong>{selectedCustomer.name}</strong> · {selectedCustomer.phone}
                  {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ''}
                </div>
                {selectedCustomer.primaryAddress && (
                  <div>Last address: {selectedCustomer.primaryAddress}</div>
                )}
              </div>
            )}
            <label className="flex flex-col text-sm">
              Address (override or fresh)
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={
                  selectedCustomer?.primaryAddress ?? 'Service address'
                }
                data-testid="input-address"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.address} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-sm">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-name"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.name} />
            </label>
            <label className="flex flex-col text-sm">
              Phone
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-phone"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.phone} />
            </label>
            <label className="flex flex-col text-sm">
              Email (optional)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.email} />
            </label>
            <label className="flex flex-col text-sm sm:col-span-2">
              Address
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                data-testid="input-address"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.address} />
            </label>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4">
        <h2 className="text-lg font-semibold">Booking</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col text-sm">
            Service
            <select
              value={serviceId}
              onChange={(e) => setServiceId(Number(e.target.value))}
              data-testid="select-service"
              className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <FieldError errors={fieldErrors.serviceId} />
          </label>
          <label className="flex flex-col text-sm">
            Start time (local, {timezone})
            <input
              type="datetime-local"
              value={startAtLocal}
              onChange={(e) => setStartAtLocal(e.target.value)}
              data-testid="input-start-at"
              className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
            />
            <FieldError errors={fieldErrors.startAt} />
          </label>
        </div>
        <label className="flex flex-col text-sm">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            data-testid="input-notes"
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
          />
          <FieldError errors={fieldErrors.notes} />
        </label>
      </section>

      {pendingWarnings && (
        <div
          role="alert"
          data-testid="warnings-banner"
          className="rounded-md border border-yellow-700 bg-yellow-950/30 p-3 text-sm text-yellow-200"
        >
          <div className="mb-2 font-medium">Soft warnings:</div>
          <ul className="list-disc pl-5">
            {pendingWarnings.warnings.map((w, i) => (
              <li key={i}>
                {w.kind === 'too_soon'
                  ? `Start time is inside the ${w.minAdvanceNoticeHours}-hour advance-notice window.`
                  : `Another booking is within ${w.spacingMinutes} minutes of this slot (${w.heldStartAt}).`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <p role="status" data-testid="form-message" className="text-sm">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        {!pendingWarnings ? (
          <button
            type="submit"
            disabled={isPending}
            data-testid="submit-walkin"
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
          >
            {isPending ? 'Creating…' : 'Create booking'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit(true)}
              data-testid="submit-walkin-force"
              className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isPending ? 'Submitting…' : 'Submit anyway'}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setPendingWarnings(null);
                setMessage(null);
              }}
              className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm"
            >
              Edit and retry
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <span className="mt-1 text-xs text-red-400" role="alert">
      {errors.join(' · ')}
    </span>
  );
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
