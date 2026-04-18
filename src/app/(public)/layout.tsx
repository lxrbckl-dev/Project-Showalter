/**
 * Public-surface layout.
 *
 * The root `src/app/layout.tsx` owns the <html> shell, global styles, and
 * fonts. This layout is intentionally minimal — it just wraps public pages
 * in a single pass-through.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
