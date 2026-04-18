import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Path alias mirrors the `@/*` → `./src/*` mapping in tsconfig.json.
 * Kept resolved here rather than via `vite-tsconfig-paths` so the config file
 * stays plain-CJS-loadable (Vitest's config loader trips on ESM-only plugins).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    globals: false,
    reporters: 'default',
  },
});
