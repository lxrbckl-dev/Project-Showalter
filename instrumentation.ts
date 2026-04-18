/**
 * Next.js calls `register()` once at server init, before HTTP traffic flows.
 * We use it to run DB migrations via `boot()`. A failed migration exits the
 * process — see `src/server/boot.ts`.
 *
 * The Node.js runtime check guards against edge-runtime imports of
 * better-sqlite3 (native module, Node-only).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { boot } = await import('@/server/boot');
  await boot();
}
