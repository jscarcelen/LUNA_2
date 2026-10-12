/**
 * "What is where": the topic tree of a document laid out against its pages, so it is easy to find the part of
 * the notes a topic comes from. Pure functions: the component (TopicMap.js) only draws what these return.
 *
 * A concept (see /api/concepts) has a `topic` (the branch of the tree it sits under), a `name` and `source_pages`
 * (the pages it was found on). Topics are the rows; each row knows which pages carry it.
 */

const pageList = (concept) => (Array.isArray(concept?.source_pages) ? concept.source_pages : []).map(Number).filter((page) => Number.isFinite(page) && page > 0);

/** How many pages the document has: the highest page marker in its HTML, else the highest page any concept names. */
export function pageCountOf(html = "", concepts = []) {
  let max = 0;
  for (const match of String(html).matchAll(/data-page="(\d+)"/g)) max = Math.max(max, Number(match[1]));
  for (const concept of concepts) for (const page of pageList(concept)) max = Math.max(max, page);
  return max;
}

/** Groups pages into runs: [3,4,5,9] → "pp. 3–5, 9". */
export function formatPages(pages = []) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (!sorted.length) return "";
  const runs = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const page of sorted.slice(1)) {
    if (page === prev + 1) { prev = page; continue; }
    runs.push([start, prev]);
    start = page;
    prev = page;
  }
  runs.push([start, prev]);
  const text = runs.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(", ");
  return `${sorted.length === 1 ? "p." : "pp."} ${text}`;
}

/**
 * The rows of the map: one per topic, in the order its first page comes in the document (topics with no known page last).
 *   { topic, concepts: [{ id, name, pages }], pages: number[], firstPage: number|null, segments: [{ from, to }] }
 * `segments` are runs of consecutive pages, for drawing the bar.
 */
export function topicRows(concepts = []) {
  const byTopic = new Map();
  for (const concept of concepts) {
    const name = String(concept?.name || "").trim();
    if (!name) continue;
    const topic = String(concept.topic || "").trim() || "Other topics";
    if (!byTopic.has(topic)) byTopic.set(topic, { topic, concepts: [], pages: new Set() });
    const row = byTopic.get(topic);
    const pages = pageList(concept);
    row.concepts.push({ id: concept.id || name, name, pages: [...new Set(pages)].sort((a, b) => a - b) });
    for (const page of pages) row.pages.add(page);
  }
  const rows = [...byTopic.values()].map((row) => {
    const pages = [...row.pages].sort((a, b) => a - b);
    const segments = [];
    for (const page of pages) {
      const last = segments[segments.length - 1];
      if (last && page === last.to + 1) last.to = page;
      else segments.push({ from: page, to: page });
    }
    return { topic: row.topic, concepts: row.concepts, pages, firstPage: pages[0] ?? null, segments };
  });
  return rows.sort((a, b) => (a.firstPage ?? Infinity) - (b.firstPage ?? Infinity) || a.topic.localeCompare(b.topic));
}
