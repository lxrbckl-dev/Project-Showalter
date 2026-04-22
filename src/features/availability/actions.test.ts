import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import {
  availabilityOverrideWindows,
  availabilityOverrides,
  weeklyTemplateWindows,
} from '@/db/schema/availability';
import { createTestDb } from '@/db/test-helpers';

/**
 * Action-level tests. We stub out `@/db` and `@/features/auth/auth` with
 * lightweight fakes so actions can be exercised against an in-memory
 * SQLite without the singleton DB or a real session cookie.
 *
 * The test focuses on:
 *   - validation (bad times, overlapping windows, bad dates) returns a
 *     structured error rather than throwing
 *   - happy-path mutations land rows in the expected tables
 *   - transactional semantics (clearOverride wipes child rows first)
 */

// Fresh in-memory DB per test, shared with the module under test via mock.
let testHandle: ReturnType<typeof createTestDb>;

vi.mock('@/db', async () => {
  return {
    getDb: () => testHandle.db,
    resolveDatabasePath: () => ':memory:',
    getSqlite: () => testHandle.sqlite,
    schema,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/features/auth/auth', () => ({
  auth: vi.fn(async () => ({
    user: { id: 'u1', name: 'admin' },
    expires: new Date(Date.now() + 86_400_000),
  })),
}));

// Import after mocks are registered.
import {
  clearOverride,
  closeDate,
  openDateWithWindows,
  setTemplateDay,
} from './actions';
import { auth } from '@/features/auth/auth';

describe('availability actions', () => {
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    vi.mocked(auth).mockImplementation(async () => ({
      user: { id: 'u1', name: 'admin' },
      credentialId: null,
      expires: new Date(Date.now() + 86_400_000),
    }));
  });

  describe('setTemplateDay', () => {
    it('rejects invalid day_of_week', async () => {
      const res = await setTemplateDay(7, []);
      expect(res).toEqual({ ok: false, error: expect.stringMatching(/0\.\.6/) });

      const res2 = await setTemplateDay(-1, []);
      expect(res2.ok).toBe(false);
    });

    it('rejects bad time format', async () => {
      const res = await setTemplateDay(6, [{ startTime: '9:00', endTime: '12:00' }]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/HH:MM/);
    });

    it('rejects end <= start', async () => {
      const res = await setTemplateDay(6, [{ startTime: '12:00', endTime: '09:00' }]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/end time/);
    });

    it('rejects overlapping windows', async () => {
      const res = await setTemplateDay(6, [
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '11:00', endTime: '13:00' },
      ]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/overlap/);
    });

    it('replaces all windows for the weekday atomically', async () => {
      // Seed pre-existing windows for Sat + Sun so we can verify only Sat is
      // touched.
      testHandle.db.insert(weeklyTemplateWindows)
        .values({ dayOfWeek: 6, startTime: '08:00', endTime: '09:00' })
        .run();
      testHandle.db.insert(weeklyTemplateWindows)
        .values({ dayOfWeek: 0, startTime: '10:00', endTime: '11:00' })
        .run();

      const res = await setTemplateDay(6, [
        { startTime: '10:00', endTime: '14:00' },
        { startTime: '15:00', endTime: '18:00', note: 'evening' },
      ]);
      expect(res).toEqual({ ok: true });

      const sat = testHandle.db
        .select()
        .from(weeklyTemplateWindows)
        .where(eq(weeklyTemplateWindows.dayOfWeek, 6))
        .all();
      expect(sat).toHaveLength(2);
      expect(sat.map((r) => r.startTime).sort()).toEqual(['10:00', '15:00']);
      expect(sat.find((r) => r.startTime === '15:00')?.note).toBe('evening');

      const sun = testHandle.db
        .select()
        .from(weeklyTemplateWindows)
        .where(eq(weeklyTemplateWindows.dayOfWeek, 0))
        .all();
      // Untouched.
      expect(sun).toHaveLength(1);
      expect(sun[0].startTime).toBe('10:00');
    });

    it('empty array clears the weekday', async () => {
      testHandle.db.insert(weeklyTemplateWindows)
        .values({ dayOfWeek: 6, startTime: '08:00', endTime: '09:00' })
        .run();
      const res = await setTemplateDay(6, []);
      expect(res).toEqual({ ok: true });
      expect(
        testHandle.db
          .select()
          .from(weeklyTemplateWindows)
          .where(eq(weeklyTemplateWindows.dayOfWeek, 6))
          .all(),
      ).toHaveLength(0);
    });

    it('throws when there is no admin session', async () => {
      vi.mocked(auth).mockResolvedValueOnce(null);
      await expect(setTemplateDay(6, [])).rejects.toThrow(/Unauthorized/);
    });
  });

  describe('closeDate', () => {
    it('rejects bad date', async () => {
      const res = await closeDate('not-a-date');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/YYYY-MM-DD/);
    });

    it('upserts a closed override, wiping prior open windows', async () => {
      testHandle.db.insert(availabilityOverrides)
        .values({
          date: '2026-04-18',
          mode: 'open',
          createdAt: '2026-04-17T00:00:00Z',
        })
        .run();
      testHandle.db.insert(availabilityOverrideWindows)
        .values({ date: '2026-04-18', startTime: '10:00', endTime: '14:00' })
        .run();

      const res = await closeDate('2026-04-18', 'out of town');
      expect(res).toEqual({ ok: true });

      const override = testHandle.db
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.date, '2026-04-18'))
        .all();
      expect(override).toHaveLength(1);
      expect(override[0].mode).toBe('closed');
      expect(override[0].note).toBe('out of town');

      const windows = testHandle.db
        .select()
        .from(availabilityOverrideWindows)
        .where(eq(availabilityOverrideWindows.date, '2026-04-18'))
        .all();
      expect(windows).toHaveLength(0);
    });
  });

  describe('openDateWithWindows', () => {
    it('rejects overlapping windows', async () => {
      const res = await openDateWithWindows('2026-04-18', [
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '11:00', endTime: '13:00' },
      ]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/overlap/);
    });

    it('upserts an open override and replaces the window set', async () => {
      const res = await openDateWithWindows(
        '2026-04-18',
        [{ startTime: '08:00', endTime: '12:00' }],
        'extended',
      );
      expect(res).toEqual({ ok: true });

      const res2 = await openDateWithWindows('2026-04-18', [
        { startTime: '13:00', endTime: '17:00' },
      ]);
      expect(res2).toEqual({ ok: true });

      const windows = testHandle.db
        .select()
        .from(availabilityOverrideWindows)
        .where(eq(availabilityOverrideWindows.date, '2026-04-18'))
        .all();
      expect(windows).toHaveLength(1);
      expect(windows[0].startTime).toBe('13:00');

      const override = testHandle.db
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.date, '2026-04-18'))
        .all();
      expect(override[0].mode).toBe('open');
      expect(override[0].note).toBeNull();
    });

    it('allows an open override with no windows', async () => {
      const res = await openDateWithWindows('2026-04-18', []);
      expect(res).toEqual({ ok: true });
      const override = testHandle.db
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.date, '2026-04-18'))
        .all();
      expect(override).toHaveLength(1);
      expect(override[0].mode).toBe('open');
    });
  });

  describe('clearOverride', () => {
    it('rejects bad date', async () => {
      const res = await clearOverride('not-a-date');
      expect(res.ok).toBe(false);
    });

    it('deletes override + child windows in one transaction', async () => {
      testHandle.db.insert(availabilityOverrides)
        .values({
          date: '2026-04-18',
          mode: 'open',
          createdAt: '2026-04-17T00:00:00Z',
        })
        .run();
      testHandle.db.insert(availabilityOverrideWindows)
        .values({ date: '2026-04-18', startTime: '10:00', endTime: '14:00' })
        .run();

      const res = await clearOverride('2026-04-18');
      expect(res).toEqual({ ok: true });

      expect(
        testHandle.db
          .select()
          .from(availabilityOverrides)
          .where(eq(availabilityOverrides.date, '2026-04-18'))
          .all(),
      ).toHaveLength(0);
      expect(
        testHandle.db
          .select()
          .from(availabilityOverrideWindows)
          .where(eq(availabilityOverrideWindows.date, '2026-04-18'))
          .all(),
      ).toHaveLength(0);
    });

    it('is a no-op for a non-existent date', async () => {
      const res = await clearOverride('2026-04-18');
      expect(res).toEqual({ ok: true });
    });
  });
});
