import type { Config } from 'drizzle-kit';

/**
 * DATABASE_URL uses a `file:` prefix (e.g. `file:/data/sqlite.db`).
 * drizzle-kit wants the raw filesystem path, so strip the prefix here.
 */
function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
  return raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
}

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolveDbPath(),
  },
  verbose: true,
  strict: true,
} satisfies Config;
