/**
 * /admin/schedule — weekly-template + date-override editor.
 *
 * Server component: reads current template + overrides from the DB and
 * hands them to the client-side editor shell. All mutations happen via
 * server actions in `@/features/availability/actions` (see
 * ScheduleEditor.tsx) and a successful mutation triggers
 * `revalidatePath('/admin/schedule')` on the server so this component
 * re-reads fresh data on the next render.
 */

import { listOverrides, listWeeklyTemplate } from '@/features/availability/queries';
import { ScheduleEditor } from './ScheduleEditor';

export const dynamic = 'force-dynamic';

export default async function AdminSchedulePage() {
  const template = listWeeklyTemplate();
  const overrides = listOverrides();

  // Serialize override rows — server actions round-trip strings anyway, and
  // the client component doesn't need live Drizzle types.
  const templateSerializable: Record<
    number,
    Array<{ id: number; startTime: string; endTime: string; note: string | null }>
  > = {};
  for (const [dow, rows] of Object.entries(template)) {
    templateSerializable[Number(dow)] = rows.map((r) => ({
      id: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      note: r.note ?? null,
    }));
  }

  const overridesSerializable = overrides.map((o) => ({
    date: o.date,
    mode: o.mode,
    note: o.note,
    createdAt: o.createdAt,
    windows: o.windows.map((w) => ({
      id: w.id,
      startTime: w.startTime,
      endTime: w.endTime,
    })),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Set the weekly template (recurring availability) and override
          specific dates (vacations, one-off extended hours, etc.).
        </p>
      </header>

      <ScheduleEditor
        template={templateSerializable}
        overrides={overridesSerializable}
      />
    </div>
  );
}
