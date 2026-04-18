/**
 * Next.js calls `register()` once at server init, before HTTP traffic flows.
 * We use it to run DB migrations + admin reconciliation + seed via `boot()`.
 *
 * Location: this file MUST live at `src/instrumentation.ts` (the `src/`
 * directory layout is in use). A previous placement at the repo root was
 * silently skipped by `next start` / the standalone server, so migrations
 * never ran in production.
 *
 * Runtime gating for better-sqlite3:
 *   Next.js compiles `instrumentation.ts` for BOTH the Node and Edge runtimes.
 *   The Node boot path imports better-sqlite3 (native addon) and drizzle-orm
 *   — neither survives Edge compilation because they rely on `fs` / `path`.
 *
 *   We need the Edge bundle to exclude the boot import entirely. The trick:
 *   `process.env.NEXT_RUNTIME` is substituted at compile time per target
 *   (`'nodejs'` on Node, `'edge'` on Edge). Wrapping the dynamic import in a
 *   positive `if (... === 'nodejs')` block lets webpack dead-code-eliminate
 *   the whole block on Edge. (An early-return guard is semantically
 *   equivalent at runtime but doesn't always trigger DCE — keep the positive
 *   block form.)
 *
 *   Companion config: `next.config.ts` sets
 *     serverExternalPackages: ['better-sqlite3', 'drizzle-orm']
 *   so those packages stay as native `require()`s in the Node server bundle
 *   instead of being bundled.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('@/server/boot');
    await boot();
  }
}
