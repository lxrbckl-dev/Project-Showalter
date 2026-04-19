/**
 * HostFactsMarquee — slim, eyebrow-styled scrolling line of short host facts
 * separated by `•` bullets. Order is randomized on each request so repeat
 * visitors see a fresh sequence. Sits where the "Trusted Lawn Care" eyebrow
 * used to live above the About heading and inherits its visual treatment
 * (small, uppercase, tracking-widest, green-800).
 *
 * Source: `site_config.host_facts` (newline-delimited, admin-editable).
 * Renders nothing when the column is null/empty after trim+filter.
 *
 * The items are duplicated in the DOM so the loop is seamless: the track
 * translates by -50% over the animation cycle. The duplicate copy carries
 * `aria-hidden` so screen readers read each fact only once.
 */

interface HostFactsMarqueeProps {
  hostFacts: string | null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function HostFactsMarquee({ hostFacts }: HostFactsMarqueeProps) {
  if (!hostFacts) return null;

  const facts = hostFacts
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (facts.length === 0) return null;

  const ordered = shuffle(facts);

  const renderRow = (key: string, ariaHidden = false) => (
    <div
      key={key}
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-center gap-2 pr-2"
    >
      {ordered.map((fact, i) => (
        <span key={`${key}-${i}`} className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-sm font-semibold uppercase tracking-widest text-green-800">
            {fact}
          </span>
          <span aria-hidden="true" className="text-sm text-green-800">
            •
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div aria-label="About the host" className="overflow-hidden">
      <div className="facts-marquee-track flex">
        {renderRow('a')}
        {renderRow('b', true)}
      </div>
    </div>
  );
}
