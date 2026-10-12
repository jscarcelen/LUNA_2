/**
 * Key pictures of the source documents, carried into a consolidated (master) document.
 *
 * Uploaded Word, PowerPoint and PDF files keep their pictures as `<img src="data:…">` in their processed HTML
 * (`sourceRenderHtml`). The consolidator writes notes from text, so pictures are placed here, without the model:
 * the largest few of each document, each under the topic that cites that document most.
 */

export const MIN_FIGURE_BYTES = 6 * 1024;
export const MAX_FIGURES_PER_DOCUMENT = 4;
export const MAX_FIGURES_TOTAL = 12;

const IMG = /<img\b[^>]*>/gi;
const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(2).find(Boolean) || "";

/** Pictures embedded in a document's HTML: [{ src, alt, page, bytes }] in reading order. */
export function documentFigures(document) {
  const html = String(document?.sourceRenderHtml || "");
  if (!html.includes("data:image")) return [];
  const found = [];
  for (const match of html.matchAll(IMG)) {
    const src = attr(match[0], "src");
    if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) continue;
    const bytes = Math.floor(((src.length - src.indexOf(",") - 1) * 3) / 4);
    if (bytes < MIN_FIGURE_BYTES) continue;
    const before = html.slice(0, match.index);
    const page = Number(/data-page="(\d+)"(?![\s\S]*data-page=")/.exec(before)?.[1]) || null;
    found.push({ src, alt: attr(match[0], "alt").trim(), page, bytes, order: found.length });
  }
  return found;
}

/** The largest few of each document (up to a total), back in reading order. */
export function keyFigures(documents = [], { perDocument = MAX_FIGURES_PER_DOCUMENT, total = MAX_FIGURES_TOTAL } = {}) {
  const picked = [];
  documents.forEach((document, index) => {
    const best = documentFigures(document).sort((a, b) => b.bytes - a.bytes).slice(0, perDocument).sort((a, b) => a.order - b.order);
    for (const figure of best) picked.push({ ...figure, doc: index, docId: document.id || "", docName: document.name || "" });
  });
  return picked.sort((a, b) => b.bytes - a.bytes).slice(0, total).sort((a, b) => a.doc - b.doc || a.order - b.order);
}

/**
 * Figure blocks added to sections (`{ title, blocks }` whose notes cite passages through `sources`).
 * `docOf(sid)` gives the index of the document a passage comes from. A section keeps its figures at its end.
 * @returns the sections with `figures` set, and how many pictures were placed
 */
export function placeFigures(sections = [], figures = [], docOf = () => -1) {
  const counts = sections.map(() => new Map());
  sections.forEach((section, at) => {
    for (const block of section.blocks || []) {
      const ids = [...(block.sources || []), ...(block.bullets || []).flatMap((bullet) => bullet.sources || [])];
      for (const sid of ids) { const doc = docOf(sid); if (doc >= 0) counts[at].set(doc, (counts[at].get(doc) || 0) + 1); }
    }
  });
  const used = new Map();
  const out = sections.map((section) => ({ ...section, figures: [] }));
  let placed = 0;
  for (const figure of figures) {
    const ranked = counts.map((map, at) => ({ at, n: map.get(figure.doc) || 0 })).filter((entry) => entry.n > 0).sort((a, b) => b.n - a.n || a.at - b.at);
    if (!ranked.length) continue;
    // Spread a document's pictures over the sections that cite it, most-citing first.
    const turn = used.get(figure.doc) || 0;
    used.set(figure.doc, turn + 1);
    const target = ranked[turn % ranked.length].at;
    const caption = figure.alt && !/^(figure|picture|image)\b/i.test(figure.alt) && !/^(slide|figure on page) \d+/i.test(figure.alt) ? figure.alt : `${figure.docName}${figure.page ? `, p. ${figure.page}` : ""}`.trim();
    out[target].figures.push({ type: "figure", image: figure.src, caption: caption || "Figure", _docId: figure.docId });
    placed += 1;
  }
  return { sections: out, placed };
}
