import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Keep native / server-only DB packages out of Next's client/edge bundles.
  // `better-sqlite3` is a native Node addon; `drizzle-orm` transitively pulls
  // it in. Both must be loaded via the Node module resolver at runtime, not
  // webpack-bundled — especially important for the instrumentation hook,
  // which is compiled for both Node and Edge runtimes.
  serverExternalPackages: ['better-sqlite3', 'drizzle-orm'],
  // instrumentation.ts is loaded automatically in Next.js 15 — no flag needed.
  // Location: `src/instrumentation.ts` (required when using the `src/` layout;
  // the repo-root location is silently skipped in standalone output).
  // Disable the floating dev-tools indicator in the bottom-left corner.
  devIndicators: false,
};

export default nextConfig;
