/**
 * Template variable catalog — Phase 3A.
 *
 * Lists the supported substitution placeholders per template type.
 * Full interpolation logic (replacing the placeholders at send-time) lives
 * in Phase 7 under src/lib/interpolation/. This module is the static catalog
 * used by the admin Templates tab to show "variables you can use" hints.
 *
 * Source of truth: STACK.md "Supported variables per template" table.
 */

export type TemplateKey =
  | 'confirmation_email'
  | 'confirmation_sms'
  | 'decline_email'
  | 'decline_sms'
  | 'review_request_email'
  | 'review_request_sms';

export interface TemplateVariable {
  /** The placeholder text as it appears in the template, e.g. `[name]` */
  placeholder: string;
  /** Human-readable description of what gets substituted */
  description: string;
}

/**
 * Full list of every placeholder, with descriptions.
 */
export const ALL_VARIABLES: TemplateVariable[] = [
  { placeholder: '[name]', description: "Customer's name" },
  { placeholder: '[service]', description: 'Service name' },
  { placeholder: '[date]', description: 'Appointment date' },
  { placeholder: '[time]', description: 'Appointment time' },
  { placeholder: '[address]', description: 'Service address' },
  { placeholder: '[link]', description: 'Review request link' },
  { placeholder: '[google_link]', description: 'Add to Google Calendar link' },
  { placeholder: '[ics_link]', description: 'Apple/universal .ics calendar link' },
  { placeholder: '[shortlink]', description: 'Short calendar link (for SMS)' },
];

/**
 * Per-template variable support map.
 * `true` = the variable is supported (meaningful) for this template type.
 */
const SUPPORT_MAP: Record<TemplateKey, Set<string>> = {
  confirmation_email: new Set([
    '[name]', '[service]', '[date]', '[time]', '[address]', '[google_link]', '[ics_link]',
  ]),
  confirmation_sms: new Set([
    '[name]', '[service]', '[date]', '[time]', '[shortlink]',
  ]),
  decline_email: new Set([
    '[name]', '[service]', '[date]',
  ]),
  decline_sms: new Set([
    '[name]', '[service]', '[date]',
  ]),
  review_request_email: new Set([
    '[name]', '[service]', '[link]',
  ]),
  review_request_sms: new Set([
    '[name]', '[link]',
  ]),
};

/**
 * Returns the list of supported variables for a given template key,
 * in the canonical display order defined by ALL_VARIABLES.
 */
export function getVariablesForTemplate(key: TemplateKey): TemplateVariable[] {
  const supported = SUPPORT_MAP[key];
  return ALL_VARIABLES.filter((v) => supported.has(v.placeholder));
}

/**
 * Convenience: all template keys in a stable order for rendering.
 */
export const TEMPLATE_KEYS: TemplateKey[] = [
  'confirmation_email',
  'confirmation_sms',
  'decline_email',
  'decline_sms',
  'review_request_email',
  'review_request_sms',
];

/**
 * Human-readable labels for each template key.
 */
export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  confirmation_email: 'Confirmation — Email',
  confirmation_sms: 'Confirmation — SMS',
  decline_email: 'Decline — Email',
  decline_sms: 'Decline — SMS',
  review_request_email: 'Review Request — Email',
  review_request_sms: 'Review Request — SMS',
};
