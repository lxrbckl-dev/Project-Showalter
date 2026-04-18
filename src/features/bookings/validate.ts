import { z } from 'zod';
import { normalizeUSPhone } from '@/lib/formatters/phone';

/**
 * Booking-form Zod validation — Phase 5.
 *
 * All limits come from STACK.md § "Conventions and defaults":
 *   - name       ≤ 100 chars
 *   - phone      US format, normalized to E.164
 *   - email      RFC 5321-ish (Zod's default email() is sufficient for MVP)
 *   - address    ≤ 500 chars
 *   - notes      ≤ 2000 chars
 *
 * Runs on both the client (optimistic UX) and the server (source of truth).
 * Returning a parsed/refined shape keeps the caller type-safe against typos.
 */

export const bookingSubmitSchema = z.object({
  /** Service ID (must be active — verified separately against the DB). */
  serviceId: z.coerce.number().int().positive(),

  /** ISO 8601 UTC timestamp of the chosen slot (exact match against availability). */
  startAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
      message: 'Invalid start time.',
    }),

  name: z
    .string()
    .trim()
    .min(1, { message: 'Please enter your name.' })
    .max(100, { message: 'Name must be 100 characters or fewer.' }),

  /** Free-form phone input from the browser; normalized in .transform(). */
  phone: z
    .string()
    .trim()
    .min(1, { message: 'Please enter your phone number.' })
    .transform((raw, ctx) => {
      const normalized = normalizeUSPhone(raw);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please enter a valid US phone number.',
        });
        return z.NEVER;
      }
      return normalized;
    }),

  email: z
    .string()
    .trim()
    .max(254, { message: 'Email is too long.' })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: 'Please enter a valid email address.' },
    ),

  address: z
    .string()
    .trim()
    .min(1, { message: 'Please enter the service address.' })
    .max(500, { message: 'Address must be 500 characters or fewer.' }),

  notes: z
    .string()
    .max(2000, { message: 'Notes must be 2000 characters or fewer.' })
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),

  /**
   * Hidden honeypot field — see STACK.md § Rate limiting and anti-spam.
   * Real users never fill this; bots typically fill every input they see.
   * A non-empty value triggers a silent-success response in the server
   * action (no DB write, no notification).
   */
  honeypot: z.string().optional().default(''),
});

export type BookingSubmitInput = z.input<typeof bookingSubmitSchema>;
export type BookingSubmitData = z.output<typeof bookingSubmitSchema>;
