import { UmamiScript } from '@/components/public/UmamiScript';

/**
 * Public-surface layout.
 *
 * The root `src/app/layout.tsx` owns the <html> shell, global styles, and
 * fonts. This layout adds the Umami analytics script for public routes only
 * — admin routes are intentionally excluded.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UmamiScript />
      {children}
    </>
  );
}
