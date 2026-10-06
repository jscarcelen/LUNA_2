/**
 * Source tags that open the original document.
 *
 * The Summary Notes Consolidator ends every statement with a tag — "[D1 p.3 · D2 §Osmosis]" — and
 * a key at the top maps D1 → document. The blocks carry the same places as data (`_refs`: document id,
 * page, heading, passage). This turns each part of a tag into a link to `/source?d=<document>&p=<page>`
 * (or `&s=<section>`), a page that opens the document at that place; in the app the same link opens
 * the in-app reader instead of a new tab.
 *
 * Links are written as Markdown `[label](url)`, which the layout engine, the reader and the exporters
 * all understand, so nothing else has to know about tags.
 *
 * Pure: no I/O.
 */

/** `/source?d=…&p=…&s=…&c=…&q=…` — only what is known. `base` is the origin for absolute links. */
export function sourceHref({ documentId, page, section, chunk, quote } = {}, base = "") {
  const id = String(documentId || "").trim();
  if (!id) return "";
  const parts = [`d=${encodeURIComponent(id)}`];
  const pageNumber = Number(page);
  if (Number.isFinite(pageNumber) && pageNumber > 0) parts.push(`p=${Math.round(pageNumber)}`);
  if (section) parts.push(`s=${encodeURIComponent(String(section).slice(0, 120))}`);
  const chunkNumber = Number(chunk);
  if (Number.isFinite(chunkNumber) && chunkNumber > 0) parts.push(`c=${Math.round(chunkNumber)}`);
  if (quote) parts.push(`q=${encodeURIComponent(String(quote).slice(0, 200))}`);
  // Parentheses are legal in a URL but end a Markdown link, so they are encoded.
  return `${base}/source?${parts.join("&")}`.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** What a source link points at, read back from its URL: `{ documentId, page, section, chunk, quote }`. */
export function parseSourceHref(href) {
  try {
    const url = new URL(String(href || ""), "http://luna.local");
    if (!/\/source$/.test(url.pathname)) return null;
    const get = (key) => url.searchParams.get(key) || "";
    return { documentId: get("d"), page: Number(get("p")) || 0, section: get("s"), chunk: Number(get("c")) || 0, quote: get("q") };
  } catch {
    return null;
  }
}

/**
 * "[D1 p.3, p.5 · D2 §Osmosis]" → [{ tag: "D1", places: [{ page: 3, text: "p.3" }, { page: 5, text: "p.5" }] }, { tag: "D2", places: [{ section: "Osmosis", text: "§Osmosis" }] }].
 * A part with no place ("D3") has an empty `places`.
 */
export function parseSourceTag(tag) {
  const inner = String(tag || "").trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  const out = [];
  for (const part of inner.split(/\s+·\s+/)) {
    const match = /^(D\d+)\s*(.*)$/.exec(part.trim());
    if (!match) continue;
    const places = match[2]
      ? match[2].split(/,\s+(?=p\.\d|§)/).map((raw) => {
          const text = raw.trim();
          const page = /^p\.(\d+)$/.exec(text);
          if (page) return { page: Number(page[1]), text };
          const section = /^§(.+)$/.exec(text);
          return section ? { section: section[1].trim(), text } : null;
        }).filter(Boolean)
      : [];
    out.push({ tag: match[1], places });
  }
  return out;
}

/** The place in `refs` that a tag part names: document, page, full heading and passage number. */
function resolvePlace(refs, tag, place) {
  const own = refs.filter((ref) => ref?.tag === tag && ref.documentId);
  if (!own.length) return null;
  let ref = null;
  if (place?.page) ref = own.find((candidate) => Number(candidate.page) === place.page);
  else if (place?.section) ref = own.find((candidate) => String(candidate.heading || "").slice(0, 40) === place.section) || own.find((candidate) => String(candidate.heading || "").startsWith(place.section));
  ref = ref || own[0];
  return { documentId: ref.documentId, page: place?.page || 0, section: place?.section ? String(ref.heading || place.section) : "", chunk: ref.chunkIndex || 0 };
}

const labelSafe = (text) => String(text).replace(/[[\]]/g, "");

/**
 * The visible tag of one unit with every part linked: " [D1 p.3, p.5 · D2 §Osmosis]" →
 * " [[D1 p.3](url), [p.5](url) · [D2 §Osmosis](url)]". Text that is not a tag, or a part whose
 * document is unknown, is left as it was.
 */
export function linkSourceTag(tag, refs = [], base = "") {
  const value = String(tag || "");
  const parts = parseSourceTag(value);
  if (!parts.length) return value;
  const known = Array.isArray(refs) ? refs : [];
  const rendered = parts.map((part) => {
    if (!part.places.length) {
      const target = resolvePlace(known, part.tag, null);
      return target ? `[${part.tag}](${sourceHref(target, base)})` : part.tag;
    }
    return part.places.map((place, index) => {
      const label = labelSafe(index === 0 ? `${part.tag} ${place.text}` : place.text);
      const target = resolvePlace(known, part.tag, place);
      return target ? `[${label}](${sourceHref(target, base)})` : label;
    }).join(", ");
  });
  return `${/^\s/.test(value) ? " " : ""}[${rendered.join(" · ")}]`;
}

const endsWithTag = (text, tag) => Boolean(tag) && String(text ?? "").endsWith(tag);

/** One unit of text with its tag replaced by the linked tag. */
function linkUnit(text, tag, refs, base) {
  if (!endsWithTag(text, tag)) return text;
  return `${String(text).slice(0, -tag.length)}${linkSourceTag(tag, refs, base)}`;
}

/**
 * A notes block (as the consolidator writes it: `_tags` and `_refs`, one entry per unit of text) with
 * the source tags turned into links. A block without that data comes back unchanged. The source key
 * at the top (`_docs`) links each original document's name.
 */
export function linkSourceBlock(block, base = "") {
  if (!block || typeof block !== "object") return block;
  const tags = Array.isArray(block._tags) ? block._tags : [];
  const refs = Array.isArray(block._refs) ? block._refs : [];
  const docs = Array.isArray(block._docs) ? block._docs : [];
  if (block.type === "bullet_list" && docs.length && Array.isArray(block.items)) {
    return {
      ...block,
      items: block.items.map((item, index) => {
        const doc = docs[index];
        if (!doc?.id || !doc.name || !String(item).includes(doc.name)) return item;
        return String(item).replace(doc.name, () => `[${labelSafe(doc.name)}](${sourceHref({ documentId: doc.id }, base)})`);
      })
    };
  }
  if (!tags.length) return block;
  switch (block.type) {
    case "paragraph":
    case "callout":
      return { ...block, text: linkUnit(block.text, tags[0], refs[0], base) };
    case "bullet_list":
      return { ...block, items: (block.items || []).map((item, index) => linkUnit(item, tags[index], refs[index], base)) };
    case "vocabulary":
      return { ...block, translation: linkUnit(block.translation, tags[0], refs[0], base) };
    default:
      return block;
  }
}

/** Every block of a document with its tags linked. */
export const linkSourceBlocks = (blocks = [], base = "") => (Array.isArray(blocks) ? blocks : []).map((block) => linkSourceBlock(block, base));

/**
 * Quizzes and summaries made from a master document cite the master; the passage they quote says
 * where each statement came from: "…(Source: Biology notes.docx, p. 3; Lab manual › Osmosis)". This
 * finds that note right after `extract` in `content` and links each named original (`originals`:
 * [{ id, name }]) — Markdown links, comma separated; "" when there is nothing to link.
 */
export function originalLinks(content, extract, originals = [], base = "") {
  const text = String(content || "");
  if (!originals.length || !text) return "";
  const probe = String(extract || "").trim().slice(0, 40);
  const at = probe ? text.indexOf(probe) : -1;
  const start = at >= 0 ? at : 0;
  const window = text.slice(start, start + Math.max(400, String(extract || "").length + 300));
  const note = /\(Source:\s*([^)]*)\)/.exec(window);
  if (!note) return "";
  const links = [];
  for (const entry of note[1].split(/;\s*/)) {
    const place = /^(.*?)(?:,\s*p\.\s*(\d+))?$/.exec(entry.trim());
    const wanted = (place?.[1] || "").trim();
    const original = originals.find((candidate) => candidate?.name && (wanted === candidate.name || wanted.startsWith(`${candidate.name} ›`)));
    if (!original?.id) continue;
    const page = place?.[2] ? Number(place[2]) : 0;
    links.push(`[${labelSafe(original.name)}${page ? `, p. ${page}` : ""}](${sourceHref({ documentId: original.id, page }, base)})`);
  }
  return [...new Set(links)].join(", ");
}
