import type { Config } from 'tailwindcss';

/**
 * Theme tokens for Tailwind v4.
 *
 * The actual CSS variables live in `src/app/globals.css` under the shadcn-style
 * `:root` / `.dark` blocks. This config file exists to keep design-token intent
 * in one typed place and to satisfy tooling that expects `tailwind.config.ts`.
 *
 * Placeholder palette: dark-green / black / white. Swapped when Sawyer's logo
 * lands.
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
          DEFAULT: '#0F3D2E',
          50: '#E8F1EC',
          500: '#0F3D2E',
          900: '#072018',
        },
      },
    },
  },
  plugins: [],
};

export default config;
