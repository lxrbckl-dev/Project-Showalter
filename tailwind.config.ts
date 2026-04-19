import type { Config } from 'tailwindcss';

/**
 * Theme tokens for Tailwind v4.
 *
 * The actual CSS variables live in `src/app/globals.css` under the shadcn-style
 * `:root` / `.dark` blocks. This config file exists to keep design-token intent
 * in one typed place and to satisfy tooling that expects `tailwind.config.ts`.
 *
 * Brand palette sampled from public/logo_primary.png + public/logo_secondary.png
 * (2026-04-18). Logo dominant greens: #78A03C (primary), #78B428 (secondary).
 * Brand green #6C9630 selected by Alex: same olive-lime hue family, darkened for WCAG AA
 * contrast on white-text buttons. Hover: #567826.
 */
const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6C9630',
          50: '#EDF3E3',
          500: '#6C9630',
          hover: '#567826',
          900: '#2D4710',
        },
      },
    },
  },
  plugins: [],
};

export default config;
