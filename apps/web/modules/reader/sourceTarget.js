/**
 * Which passage of a document a source link opens.
 *
 * `/source?d=<document>` accepts the place in three forms, strongest first: `p=<page>` (the passage
 * that holds that page), `s=<section>` (the passage under that heading) and `c=<n>` (the n-th passage,
 * what older links carry). Whatever is not found falls through to the next, and the first passage
 * opens when nothing matches.
 */

const norm = (value) => String(value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const headingOf = (chunk) => (Array.isArray(chunk.headingPath) && chunk.headingPath.length ? chunk.headingPath.join(" ") : String(chunk.section || ""));

/** Index (0-based) of the passage to open. `chunks` are the document's passages, in order. */
export function pickPassage(chunks = [], { chunk = 0, page = 0, section = "" } = {}) {
  if (!chunks.length) return -1;
  const pageNumber = Number(page) || 0;
  if (pageNumber > 0) {
    const exact = chunks.findIndex((candidate) => Number(candidate.page) > 0 && Number(candidate.page) <= pageNumber && pageNumber <= (Number(candidate.pageEnd) || Number(candidate.page)));
    if (exact >= 0) return exact;
    // The nearest passage that starts at or before the page.
    let before = -1;
    chunks.forEach((candidate, index) => { if (Number(candidate.page) > 0 && Number(candidate.page) <= pageNumber) before = index; });
    if (before >= 0) return before;
  }
  const wanted = norm(section);
  if (wanted) {
    const found = chunks.findIndex((candidate) => {
      const heading = norm(headingOf(candidate));
      return heading && (heading.includes(wanted) || wanted.includes(heading));
    });
    if (found >= 0) return found;
  }
  const number = Math.max(1, Math.round(Number(chunk)) || 1);
  return Math.min(number, chunks.length) - 1;
}
