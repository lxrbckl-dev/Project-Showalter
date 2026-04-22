/**
 * Vitest global setup — runs before every test file.
 *
 * Sets sensible env var defaults so tests that indirectly call helpers like
 * `getBaseUrl()` don't throw when BASE_URL isn't set in the shell environment.
 * Individual tests can override these before importing the modules under test.
 */
process.env.BASE_URL ??= 'http://localhost:5827';
