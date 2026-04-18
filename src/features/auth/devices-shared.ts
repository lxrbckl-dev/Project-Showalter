/**
 * Shared non-action exports for the devices feature.
 *
 * Files with `'use server'` (like `devices.ts`) may only export async
 * functions — Next.js rejects non-function exports at compile time. Anything
 * that needs to be imported by BOTH server components AND client components
 * (constants, DTO types, Zod schemas) lives here instead.
 */

import { z } from 'zod';

export const LABEL_MAX_LEN = 50;

/**
 * Zod validator for a device label. Trimmed, 1-50 chars, non-empty. Used by
 * the rename action (required label) and re-used by the add-device flow via
 * the optional variant below.
 */
export const labelSchema = z
  .string()
  .trim()
  .min(1, 'Label is required')
  .max(LABEL_MAX_LEN, `Label must be ${LABEL_MAX_LEN} characters or fewer`);

/** Optional variant of `labelSchema` for add-device (label is optional). */
export const optionalLabelSchema = z
  .string()
  .trim()
  .max(LABEL_MAX_LEN, `Label must be ${LABEL_MAX_LEN} characters or fewer`)
  .optional();

/**
 * DTO returned by `listMyDevices()` and consumed by UI components. Matches
 * the shape laid out in issue #77 (`id`, `label`, `device_type`, `created_at`,
 * `is_this_device`). `credentialId` is included so the UI can thread it
 * through rename/remove calls.
 */
export type DeviceView = {
  id: number;
  credentialId: string;
  label: string | null;
  deviceType: string | null;
  createdAt: string;
  isThisDevice: boolean;
};
