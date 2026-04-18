import { describe, expect, it } from 'vitest';
import {
  availableAdminActions,
  canTransition,
  isTerminal,
  TERMINAL_STATUSES,
} from './state';

/**
 * State-machine unit tests — Phase 6.
 *
 * Exhaustive: every (from → to) pair is asserted so a regression that makes
 * a previously-forbidden transition legal (e.g. completed → anything) fails
 * loudly. The table is small enough (7×7 = 49 cells) that enumeration is
 * the clearest form.
 */

const ALL = [
  'pending',
  'accepted',
  'declined',
  'completed',
  'no_show',
  'expired',
  'canceled',
] as const;

describe('canTransition', () => {
  it('pending → accepted/declined/canceled/expired allowed; others forbidden', () => {
    const allowed = new Set(['accepted', 'declined', 'canceled', 'expired']);
    for (const to of ALL) {
      expect(canTransition('pending', to)).toBe(allowed.has(to));
    }
  });

  it('accepted → completed/no_show/canceled allowed; others forbidden', () => {
    const allowed = new Set(['completed', 'no_show', 'canceled']);
    for (const to of ALL) {
      expect(canTransition('accepted', to)).toBe(allowed.has(to));
    }
  });

  for (const terminal of [
    'completed',
    'no_show',
    'declined',
    'expired',
    'canceled',
  ] as const) {
    it(`${terminal} → (nothing) — all transitions forbidden`, () => {
      for (const to of ALL) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    });
  }
});

describe('isTerminal', () => {
  it('flags completed/no_show/declined/expired/canceled', () => {
    for (const s of TERMINAL_STATUSES) expect(isTerminal(s)).toBe(true);
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('accepted')).toBe(false);
  });
});

describe('availableAdminActions', () => {
  it('pending → accept + decline + reschedule', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const future = '2026-05-01T12:00:00.000Z';
    expect(availableAdminActions('pending', future, now)).toEqual([
      'accept',
      'decline',
      'reschedule',
    ]);
  });

  it('accepted + future start → reschedule + cancel', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const future = '2026-05-01T12:00:00.000Z';
    expect(availableAdminActions('accepted', future, now)).toEqual([
      'reschedule',
      'cancel',
    ]);
  });

  it('accepted + past start → mark_completed + mark_no_show', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const past = '2026-04-10T12:00:00.000Z';
    expect(availableAdminActions('accepted', past, now)).toEqual([
      'mark_completed',
      'mark_no_show',
    ]);
  });

  for (const terminal of [
    'completed',
    'no_show',
    'declined',
    'expired',
    'canceled',
  ] as const) {
    it(`${terminal} offers no admin actions`, () => {
      expect(
        availableAdminActions(terminal, '2026-05-01T12:00:00.000Z'),
      ).toEqual([]);
    });
  }
});
