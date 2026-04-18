import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
  // instrumentation.ts is loaded automatically in Next.js 15 — no flag needed.
};

export default nextConfig;
