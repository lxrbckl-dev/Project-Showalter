/**
 * /admin/wiki — renders `docs/wiki.md` as HTML with a sticky TOC sidebar.
 *
 * Server component. Reads the markdown file off the filesystem on each
 * request, parses it with `marked` (GFM enabled for tables) plus the
 * `marked-gfm-heading-id` extension which auto-assigns slug IDs to every
 * heading. Extracts the post-parse heading list (h1/h2/h3 only) and passes
 * it to a small client component that powers the sticky left-rail TOC with
 * scroll-spy active-link highlighting.
 *
 * Scoped styling under `.wiki-content` lives in `globals.css`.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';
import {
  gfmHeadingId,
  getHeadingList,
  resetHeadings,
} from 'marked-gfm-heading-id';
import { WikiToc, type WikiHeading } from './_components/WikiToc';

// Register the heading-id extension once at module load. `getHeadingList()`
// only reads from the global `marked` instance, so we must call `marked.use`
// (not subclass `Marked`). `resetHeadings()` clears the slug registry before
// each parse so duplicate headings don't accumulate `-1` / `-2` suffixes
// across reloads.
marked.use(gfmHeadingId());
marked.setOptions({ gfm: true, breaks: false });

export const dynamic = 'force-dynamic';

export default async function WikiPage() {
  const filePath = join(process.cwd(), 'docs', 'wiki.md');

  let html: string;
  let headings: WikiHeading[];
  try {
    const source = await fs.readFile(filePath, 'utf8');
    resetHeadings();
    html = marked.parse(source) as string;

    headings = getHeadingList()
      .filter((h) => h.level <= 3)
      .map((h) => ({ level: h.level, text: h.text, id: h.id }));
  } catch {
    return (
      <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-6 text-sm text-[hsl(var(--muted-foreground))]">
        <p>
          <code>docs/wiki.md</code> not found. The wiki is rendered from that
          file at the project root — check it into git to make it appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <aside
        className="hidden lg:block"
        style={{ position: 'sticky', top: '5rem', alignSelf: 'start', maxHeight: 'calc(100vh - 6rem)', overflowY: 'auto' }}
      >
        <WikiToc headings={headings} />
      </aside>

      <article
        className="wiki-content mx-auto w-full max-w-3xl"
        // Source is repo-controlled markdown (not user input), so the rendered
        // HTML cannot be tampered with from outside the codebase.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
