/**
 * Display-format a status enum value: replace underscores with spaces and
 * uppercase the first letter. Storage values stay lowercase; this only
 * affects what users see in badges, detail rows, and copy.
 *
 *   formatStatus('completed') === 'Completed'
 *   formatStatus('no_show')   === 'No show'
 *   formatStatus('')          === ''
 */
export function formatStatus(status: string): string {
  const spaced = status.replace(/_/g, ' ');
  if (spaced.length === 0) return spaced;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
