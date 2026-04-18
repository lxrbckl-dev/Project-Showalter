import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

/**
 * /admin/schedule E2E — authenticate, navigate to the schedule editor,
 * add a Saturday window, add a closed override for a specific Saturday,
 * then clear it.
 *
 * Auth: instead of driving the full WebAuthn enrollment ceremony (which
 * is virtual-authenticator-scoped and collides with admin-auth.spec.ts'
 * fresh-enrollment flow on the shared dev.db), we invoke a tsx helper
 * that injects a valid session row directly and returns the session
 * token. We plant that token as the `swt-session` cookie — the app sees
 * it as a normal authenticated request. No production auth surface is
 * modified; the helper is a pure test-only DB insert.
 */

const BASE_URL = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5827}`;

function mintAdminSession(): { token: string } {
  const out = execSync('pnpm exec tsx tests/e2e/schedule-session.ts', {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
    },
  }).toString('utf-8');
  // The tsx loader prefixes logs; last line is our JSON.
  const lines = out.trim().split('\n');
  const parsed = JSON.parse(lines[lines.length - 1]) as {
    token: string;
    expires: string;
  };
  return { token: parsed.token };
}

test('admin can edit weekly template and add a closed override', async ({
  context,
  page,
}) => {
  const { token } = mintAdminSession();
  const url = new URL(BASE_URL);
  await context.addCookies([
    {
      name: 'swt-session',
      value: token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);

  // Navigate to /admin/schedule — should be authenticated.
  await page.goto('/admin/schedule');
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();

  // 1. All 7 day rows render.
  for (let dow = 0; dow < 7; dow++) {
    await expect(page.getByTestId(`template-day-${dow}`)).toBeVisible();
  }

  // 2. Add a Saturday (dow=6) window: 10:00–14:00, save.
  await page.getByTestId('template-day-6-add').click();
  const satRow = page.getByTestId('template-day-6');
  const satWindow = satRow.getByTestId('template-day-6-window-0');
  await satWindow.getByLabel('start time').fill('10:00');
  await satWindow.getByLabel('end time').fill('14:00');
  await page.getByTestId('template-day-6-save').click();
  await expect(page.getByTestId('template-day-6-save')).toBeHidden({
    timeout: 10_000,
  });

  // 3. Add a closed override on 2026-04-18 (a Saturday).
  await page.getByTestId('override-date-input').fill('2026-04-18');
  await page.getByTestId('override-note-input').fill('family trip');
  await page.getByTestId('override-close-button').click();

  // 4. Override surfaces in the list.
  const overrideItem = page.getByTestId('override-item-2026-04-18');
  await expect(overrideItem).toBeVisible({ timeout: 10_000 });
  await expect(overrideItem.getByText('closed')).toBeVisible();
  await expect(overrideItem.getByText('family trip')).toBeVisible();

  // 5. Clear the override — exercises the destructive-but-permitted
  //    clearOverride action + revalidate round-trip.
  await page.getByTestId('override-item-2026-04-18-clear').click();
  await expect(page.getByTestId('override-item-2026-04-18')).toBeHidden({
    timeout: 10_000,
  });
});
