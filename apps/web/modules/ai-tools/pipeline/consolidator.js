import { chunkDocuments, DEFAULT_CHUNK_WORDS, DEFAULT_OVERLAP_WORDS } from "./chunking.js";
import { conformBlocks } from "../blocks/blockRegistry.js";
import { formatSourceTag } from "./masterDocument.js";
import { codeSpanInvalid, invalidFormulas, isValidTex, repairMathText, replaceFormula } from "../../template-studio/engine/math/repair";

/**
 * Summary Notes Consolidator — the pipeline behind the agent that merges several documents into ONE
 * exhaustive, de-duplicated set of notes that says where every statement came from.
 *
 * Why not one model call: a single call can read ~48k characters (the normal retrieval budget) and
 * write ~6k tokens, so it would silently drop most of a long input — and "consolidated" means NOTHING
 * may be dropped. So the work is split in four passes, each of which fits the model, and every pass
 * keeps the passage ids (S1, S2…) so provenance survives to the end:
 *
 *   1. MAP        every passage of every document is read (no ranking, no truncation), packed into
 *                 groups of ~12k characters and rewritten, group by group, as topic-titled notes.
 *                 A group the model cannot finish is split in halves; a passage the model skipped is
 *                 asked for again; a passage that still fails is carried over verbatim (local parser).
 *   2. ORGANISE   one small call sees only the TOPIC TITLES of all drafts and decides the outline of
 *                 the final document by subject matter (not by source document), assigning every
 *                 draft topic to exactly one section. Topics the model forgets are appended.
 *   3. MERGE      per outline section, the drafts assigned to it (from any number of documents) are
 *                 merged into one section: overlaps written once, differences kept, sources united.
 *                 Sections too big for one call are merged in batches; a failed merge falls back to
 *                 the drafts with exact duplicates removed.
 *   4. CHECK      deterministic: every LaTeX formula found in the sources must appear in the result;
 *                 missing ones are appended to a closing section. Passage coverage is reported.
 *
 * The model is called through `deps.callModel` so the orchestration is testable without a network.
 */

export const MAP_GROUP_CHARS = 12000;
export const MERGE_BATCH_CHARS = 28000;
export const MAP_MAX_TOKENS = 12000;
export const MERGE_MAX_TOKENS = 14000;
export const ORGANISE_MAX_TOKENS = 4000;
export const CONCURRENCY = 6;
/**
 * The whole run must finish inside one serverless invocation (the stream route allows 300 s). The
 * model passes get this long; past 60 % of it the remaining passages are carried over by the local
 * parser instead of the model, past 90 % the remaining sections are only de-duplicated — slower or
 * larger inputs lose polish, never information.
 */
export const TIME_BUDGET_MS = 270000;
/** A skipped passage shorter than this (page numbers, a lone heading) is not worth a second request. */
const MIN_WORDS_TO_RECOVER = 40;

/* ------------------------------------------------------------------ options */

/** Language and focus from the runner's answers. */
export function consolidationOptions(config = {}) {
  const answers = Array.isArray(config.questionAnswers) ? config.questionAnswers : [];
  const find = (re) => String(answers.find((entry) => re.test(String(entry?.question || "")))?.answer ?? "").trim();
  const language = find(/language/i);
  return { language: !language || /same as|document/i.test(language) ? "" : language, focus: find(/focus|emphasis/i) };
}

const languageRule = (language) => (language
  ? `Write ALL of the notes in ${language} (translate from the documents where they use another language). Keep formulas, symbols, proper names and quoted terms as they are.`
  : "Write the notes in the language of the documents (if they use several, the one most of them use). Keep formulas, symbols and proper names as they are.");

/* ------------------------------------------------------------------ sources */

/**
 * Chunks every document and gives each passage an id (S1…) and its document a tag (D1…). All passages
 * are kept: nothing is ranked or cut here.
 */
export function prepareSources(documents = [], chunking = { chunkWords: DEFAULT_CHUNK_WORDS, overlapWords: DEFAULT_OVERLAP_WORDS }) {
  const docs = [];
  const chunks = [];
  for (const document of documents) {
    const own = chunkDocuments([document], chunking);
    if (!own.length) continue;
    const tag = `D${docs.length + 1}`;
    docs.push({ tag, id: document.id || "", name: document.name || "Untitled document", chunkCount: own.length });
    for (const chunk of own) {
      chunks.push({
        ...chunk,
        sid: `S${chunks.length + 1}`,
        tag,
        heading: Array.isArray(chunk.headingPath) && chunk.headingPath.length ? chunk.headingPath.join(" › ") : String(chunk.section || "")
      });
    }
  }
  return { docs, chunks };
}

/** Consecutive passages packed into groups of at most `maxChars`; a new document starts a new group once the current one is mostly full. */
export function groupChunks(chunks = [], maxChars = MAP_GROUP_CHARS) {
  const groups = [];
  let current = [];
  let size = 0;
  for (const chunk of chunks) {
    const length = String(chunk.content || "").length;
    const boundary = current.length && current[current.length - 1].tag !== chunk.tag && size >= maxChars * 0.6;
    if (current.length && (size + length > maxChars || boundary)) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(chunk);
    size += length;
  }
  if (current.length) groups.push(current);
  return groups;
}

const refOf = (chunk) => ({ sid: chunk.sid, tag: chunk.tag, documentId: chunk.documentId || "", documentName: chunk.documentName || "", heading: chunk.heading || "", page: chunk.page ?? null, chunkIndex: (chunk.chunkIndex || 0) + 1 });

const passageForModel = (chunk) => ({
  sourceId: chunk.sid,
  document: chunk.documentName,
  location: [chunk.heading, chunk.page ? `page ${chunk.page}` : ""].filter(Boolean).join(" · "),
  content: String(chunk.content || "")
});

/* ------------------------------------------------------------------ notes blocks (internal draft format) */

const NOTE_TYPES = ["heading", "paragraph", "bullet_list", "callout", "table_row"];
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const sourcesSchema = { type: "array", items: { type: "string" }, description: "sourceIds of the passages this was written from (only ids present in the input)." };

const NOTE_BLOCK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: NOTE_TYPES },
    text: nullable({ type: "string" }),
    level: nullable({ type: "number" }),
    callout_type: nullable({ type: "string" }),
    bullets: nullable({ type: "array", items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, sources: sourcesSchema }, required: ["text", "sources"] } }),
    term: nullable({ type: "string" }),
    meaning: nullable({ type: "string" }),
    detail: nullable({ type: "string" }),
    sources: sourcesSchema
  },
  required: ["type", "text", "level", "callout_type", "bullets", "term", "meaning", "detail", "sources"]
};

const TOPICS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topics: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, blocks: { type: "array", items: NOTE_BLOCK_SCHEMA } }, required: ["title", "blocks"] }
    }
  },
  required: ["topics"]
};

const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "A specific title for the whole consolidated document, written for its subject." },
    sections: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, topicIds: { type: "array", items: { type: "string" } } }, required: ["title", "topicIds"] }
    }
  },
  required: ["title", "sections"]
};

const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value).toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");
const CALLOUT_KINDS = ["info", "tip", "warning", "note"];

/**
 * One block the model wrote, held to the draft format: only known sources, the fields its type needs,
 * and a source for every unit (a unit without one inherits `fallback`). Returns null for an empty block.
 */
export function cleanNoteBlock(raw, allowed, fallback = []) {
  if (!raw || typeof raw !== "object" || !NOTE_TYPES.includes(raw.type)) return null;
  const known = (list) => [...new Set((Array.isArray(list) ? list : []).map(clean).filter((id) => allowed.has(id)))];
  const own = known(raw.sources);
  const sources = own.length ? own : fallback;
  const type = raw.type;
  if (type === "heading") {
    const text = clean(raw.text);
    return text ? { type, text, level: Math.min(4, Math.max(2, Math.round(Number(raw.level)) || 2)), sources: [] } : null;
  }
  if (type === "paragraph") {
    const text = clean(raw.text);
    return text ? { type, text, sources } : null;
  }
  if (type === "callout") {
    const text = clean(raw.text);
    const kind = clean(raw.callout_type).toLowerCase();
    return text ? { type, text, callout_type: CALLOUT_KINDS.includes(kind) ? kind : "note", sources } : null;
  }
  if (type === "table_row") {
    const term = clean(raw.term);
    const meaning = clean(raw.meaning);
    return term && (meaning || clean(raw.detail)) ? { type, term, meaning: meaning || "—", detail: clean(raw.detail), sources } : null;
  }
  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : []).map((bullet) => {
    const text = clean(bullet?.text);
    const mine = known(bullet?.sources);
    return text ? { text, sources: mine.length ? mine : sources } : null;
  }).filter(Boolean);
  return bullets.length ? { type: "bullet_list", text: clean(raw.text), bullets, sources } : null;
}

/** The model's `{ topics }` as clean topics. A block without sources takes the last cited block's, else `fallback`. */
export function parseTopics(parsed, allowed, fallback = []) {
  const topics = [];
  for (const topic of Array.isArray(parsed?.topics) ? parsed.topics : []) {
    const blocks = [];
    let previous = fallback;
    for (const raw of Array.isArray(topic?.blocks) ? topic.blocks : []) {
      const block = cleanNoteBlock(raw, allowed, previous);
      if (!block) continue;
      if (block.sources?.length) previous = block.sources;
      blocks.push(block);
    }
    if (blocks.length) topics.push({ title: clean(topic?.title) || "Notes", blocks });
  }
  return topics;
}

/** Sources cited anywhere in a list of notes blocks. */
export function citedSources(blocks = []) {
  const cited = new Set();
  for (const block of blocks) {
    for (const id of block.sources || []) cited.add(id);
    for (const bullet of block.bullets || []) for (const id of bullet.sources || []) cited.add(id);
  }
  return cited;
}

const keyOf = (block) => `${block.type}|${norm(block.text)}|${norm(block.term)}|${norm(block.meaning)}|${(block.bullets || []).map((bullet) => norm(bullet.text)).join("¦")}`;

/**
 * Exact-duplicate removal (case/space/punctuation-insensitive): the copy is dropped and its sources
 * are added to the survivor, and a bullet that already appeared in the topic is dropped the same way.
 * The deterministic safety net behind the model's own merging.
 */
export function dedupeNotes(blocks = []) {
  const seen = new Map();
  const bulletSeen = new Map();
  const out = [];
  for (const block of blocks) {
    if (block.type === "heading") { out.push(block); continue; }
    if (block.type === "bullet_list") {
      const fresh = [];
      for (const bullet of block.bullets) {
        const key = norm(bullet.text);
        const earlier = bulletSeen.get(key);
        if (earlier) earlier.sources = [...new Set([...earlier.sources, ...bullet.sources])];
        else { const copy = { ...bullet, sources: [...bullet.sources] }; bulletSeen.set(key, copy); fresh.push(copy); }
      }
      if (fresh.length) out.push({ ...block, bullets: fresh, sources: [...new Set(fresh.flatMap((bullet) => bullet.sources))] });
      continue;
    }
    const key = keyOf(block);
    const earlier = seen.get(key);
    if (earlier) { earlier.sources = [...new Set([...earlier.sources, ...block.sources])]; continue; }
    const copy = { ...block, sources: [...block.sources] };
    seen.set(key, copy);
    out.push(copy);
  }
  return out;
}

/** Plain text of a notes block, for size and comparison. */
export const noteText = (block) => [block.text, block.term, block.meaning, block.detail, ...(block.bullets || []).map((bullet) => bullet.text)].filter(Boolean).join(" ");

/** Compact JSON of drafts for the merge prompt (null fields left out). */
function compactBlock(block) {
  const out = { type: block.type };
  for (const key of ["text", "level", "callout_type", "term", "meaning", "detail"]) if (block[key] !== undefined && block[key] !== null && block[key] !== "") out[key] = block[key];
  if (block.bullets?.length) out.bullets = block.bullets;
  if (block.type !== "bullet_list" && block.sources?.length) out.sources = block.sources;
  return out;
}
const draftSize = (topic) => JSON.stringify(topic.blocks.map(compactBlock)).length;

/* ------------------------------------------------------------------ local (no model) parsing — also the safety net */

/** Markdown of one passage → notes blocks, nothing dropped. Used when no model is available or a passage keeps failing. */
export function markdownToNotes(markdown, sid) {
  const blocks = [];
  const sources = [sid];
  let paragraph = [];
  let bullets = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" "), sources });
    if (bullets.length) blocks.push({ type: "bullet_list", text: "", bullets: bullets.map((text) => ({ text, sources })), sources });
    paragraph = [];
    bullets = [];
  };
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || /^<!--.*-->$/.test(line)) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); blocks.push({ type: "heading", text: heading[2].replace(/[*_`]/g, "").trim(), level: Math.min(4, Math.max(2, heading[1].length)), sources: [] }); continue; }
    const figure = /^!\[([^\]]*)\]\([^)]*\)\s*$/.exec(line);
    if (figure) { flush(); blocks.push({ type: "callout", text: `Figure: ${figure[1] || "image"}`, callout_type: "note", sources }); continue; }
    if (/^\|.*\|$/.test(line)) {
      if (/^[|\s:-]+$/.test(line)) continue;
      flush();
      const cells = line.replace(/^\||\|$/g, "").split("|").map((cellText) => cellText.trim());
      blocks.push({ type: "table_row", term: cells[0] || "—", meaning: cells[1] || "—", detail: cells.slice(2).filter(Boolean).join("; "), sources });
      continue;
    }
    const bullet = /^([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) { if (paragraph.length) flush(); bullets.push(bullet[2]); continue; }
    if (bullets.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Deterministic consolidation of passages: topics follow the headings, equal headings from different documents join, exact duplicates collapse. */
export function localTopics(chunks = []) {
  const byTitle = new Map();
  for (const chunk of chunks) {
    const blocks = markdownToNotes(chunk.content, chunk.sid);
    let title = (chunk.headingPath && chunk.headingPath[0]) || chunk.section || chunk.documentName || "Notes";
    for (const block of blocks) {
      if (block.type === "heading" && block.level === 2 && !block.sources.length) { title = block.text; continue; }
      const key = norm(title);
      if (!byTitle.has(key)) byTitle.set(key, { title, blocks: [] });
      byTitle.get(key).blocks.push(block);
    }
  }
  return [...byTitle.values()].map((topic) => ({ ...topic, blocks: dedupeNotes(topic.blocks) })).filter((topic) => topic.blocks.length);
}

/* ------------------------------------------------------------------ notes → registry blocks */

const STRINGS = {
  en: { intro: (n) => `Consolidated from ${n} document${n === 1 ? "" : "s"} into one set of notes organised by topic. Information that appears in several documents is written once. Every statement ends with a tag showing where it comes from in the original documents.`, key: "Source key", passages: (n) => `${n} passage${n === 1 ? "" : "s"}`, extra: "Additional formulas from the documents", extraIntro: "Formulas found in the documents that are not written out above." },
  es: { intro: (n) => `Consolidado a partir de ${n} documento${n === 1 ? "" : "s"} en un único conjunto de apuntes organizado por temas. La información repetida en varios documentos aparece una sola vez. Cada afirmación termina con una etiqueta que indica de dónde procede en los documentos originales.`, key: "Clave de fuentes", passages: (n) => `${n} fragmento${n === 1 ? "" : "s"}`, extra: "Fórmulas adicionales de los documentos", extraIntro: "Fórmulas de los documentos que no aparecen escritas más arriba." },
  fr: { intro: (n) => `Consolidé à partir de ${n} document${n === 1 ? "" : "s"} en un seul ensemble de notes organisé par thème. Les informations présentes dans plusieurs documents ne sont écrites qu'une fois. Chaque affirmation se termine par une étiquette indiquant son origine dans les documents d'origine.`, key: "Clé des sources", passages: (n) => `${n} passage${n === 1 ? "" : "s"}`, extra: "Formules supplémentaires des documents", extraIntro: "Formules des documents qui ne figurent pas plus haut." },
  de: { intro: (n) => `Aus ${n} Dokument${n === 1 ? "" : "en"} zu einem einzigen, nach Themen geordneten Skript zusammengeführt. Informationen, die in mehreren Dokumenten vorkommen, stehen nur einmal da. Jede Aussage endet mit einem Kürzel, das zeigt, woher sie in den Originaldokumenten stammt.`, key: "Quellenschlüssel", passages: (n) => `${n} Abschnitt${n === 1 ? "" : "e"}`, extra: "Weitere Formeln aus den Dokumenten", extraIntro: "Formeln aus den Dokumenten, die oben nicht ausgeschrieben sind." },
  it: { intro: (n) => `Consolidato da ${n} document${n === 1 ? "o" : "i"} in un unico insieme di appunti organizzato per argomento. Le informazioni presenti in più documenti compaiono una sola volta. Ogni affermazione termina con un'etichetta che indica da dove proviene nei documenti originali.`, key: "Legenda delle fonti", passages: (n) => `${n} brano${n === 1 ? "" : "i"}`, extra: "Formule aggiuntive dai documenti", extraIntro: "Formule dei documenti non riportate sopra." },
  pt: { intro: (n) => `Consolidado a partir de ${n} documento${n === 1 ? "" : "s"} num único conjunto de apontamentos organizado por tema. A informação repetida em vários documentos aparece uma só vez. Cada afirmação termina com uma etiqueta que indica a sua origem nos documentos originais.`, key: "Chave das fontes", passages: (n) => `${n} trecho${n === 1 ? "" : "s"}`, extra: "Fórmulas adicionais dos documentos", extraIntro: "Fórmulas dos documentos que não aparecem escritas acima." },
  ca: { intro: (n) => `Consolidat a partir de ${n} document${n === 1 ? "" : "s"} en un únic conjunt d'apunts organitzat per temes. La informació repetida en diversos documents apareix una sola vegada. Cada afirmació acaba amb una etiqueta que indica d'on prové als documents originals.`, key: "Clau de fonts", passages: (n) => `${n} fragment${n === 1 ? "" : "s"}`, extra: "Fórmules addicionals dels documents", extraIntro: "Fórmules dels documents que no apareixen escrites més amunt." }
};
const LANGUAGE_CODES = { english: "en", spanish: "es", español: "es", french: "fr", français: "fr", german: "de", deutsch: "de", italian: "it", italiano: "it", portuguese: "pt", português: "pt", catalan: "ca", català: "ca" };
export const stringsFor = (language) => STRINGS[LANGUAGE_CODES[String(language || "").trim().toLowerCase()] || "en"];

/**
 * Notes blocks → the registry's typed blocks (`conformBlocks` keeps only what each type defines).
 * Each unit of text ends with a visible tag naming its sources — "[D1 p.3 · D2 §Osmosis]" — and the
 * block also carries them as data: `_tags` (the exact suffixes, one per unit) and `_refs` (one list of
 * places per unit). `byId` resolves a passage id to its place.
 */
export function notesToBlocks(notes = [], byId) {
  const out = [];
  const trace = (sources) => {
    const refs = [...new Set(sources || [])].map((id) => byId.get(id)).filter(Boolean).map(refOf);
    const label = formatSourceTag(refs);
    return { refs, tag: label ? ` [${label}]` : "" };
  };
  for (const note of notes) {
    if (note.type === "heading") { out.push({ type: "heading", text: note.text, level: note.level }); continue; }
    if (note.type === "paragraph" || note.type === "callout") {
      const { refs, tag } = trace(note.sources);
      const block = { type: note.type, text: `${note.text}${tag}`, _tags: [tag], _refs: [refs] };
      if (note.type === "callout") block.callout_type = note.callout_type;
      out.push(block);
    } else if (note.type === "bullet_list") {
      const traces = note.bullets.map((bullet) => trace(bullet.sources));
      out.push({ type: "bullet_list", title: note.text || null, items: note.bullets.map((bullet, index) => `${bullet.text}${traces[index].tag}`), _tags: traces.map((entry) => entry.tag), _refs: traces.map((entry) => entry.refs) });
    } else if (note.type === "table_row") {
      const { refs, tag } = trace(note.sources);
      out.push({ type: "vocabulary", word: note.term, translation: `${note.meaning}${tag}`, example: note.detail || null, _tags: [tag], _refs: [refs] });
    }
  }
  return conformBlocks(out);
}

/* ------------------------------------------------------------------ formulas */

/** LaTeX formulas written in a text (`$$…$$` and `$…$` that contain maths symbols; prices like "$5 and $10" are not formulas). */
export function extractFormulas(text) {
  const source = String(text || "");
  const found = [];
  for (const match of source.matchAll(/\$\$([\s\S]+?)\$\$/g)) found.push(match[1].trim());
  const rest = source.replace(/\$\$[\s\S]+?\$\$/g, " ");
  for (const match of rest.matchAll(/\$(?!\s)([^$\n]*?[^\s$])\$(?!\d)/g)) {
    const formula = match[1].trim();
    if (/[\\^_={}]/.test(formula)) found.push(formula);
  }
  return found.filter(Boolean);
}
const formulaKey = (formula) => String(formula).replace(/\\left|\\right|\\,|\\;|\\!|\\ /g, "").replace(/\s+/g, "");

/** Formulas of the sources (with the passage each came from) that the final text does not contain. */
export function missingFormulas(chunks = [], blocks = []) {
  const haystack = formulaKey(blocks.map((block) => [block.text, block.title, block.word, block.translation, block.example, ...(block.items || [])].filter(Boolean).join(" ")).join(" "));
  const seen = new Set();
  const missing = [];
  for (const chunk of chunks) {
    for (const formula of extractFormulas(chunk.content)) {
      const key = formulaKey(formula);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!haystack.includes(key)) missing.push({ formula, sid: chunk.sid });
    }
  }
  return missing;
}

/* ------------------------------------------------------------------ valid maths in the notes */

const MATH_FIELDS = ["text", "term", "meaning", "detail"];
const MATH_FIX_MAX_TOKENS = 3000;
const MATH_FIX_BATCH = 40;

const FIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { fixes: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, latex: { type: "string" } }, required: ["id", "latex"] } } },
  required: ["fixes"]
};

const FIX_SYSTEM_PROMPT = `You repair LaTeX formulas so that they compile in KaTeX. You receive a list of formulas that failed, each with an id. For every one return the corrected formula: the same mathematical meaning, written as standard LaTeX WITHOUT dollar signs or any other delimiter, and no explanation. If the item is plain text or Unicode maths, rewrite it as LaTeX (S²ₓ → S_x^2, √ → \\sqrt{}, x̄ → \\bar{x}, ∑ᵢ₌₁ⁿ → \\sum_{i=1}^{n}, (a)/(b) → \\frac{a}{b}). Use only standard commands (\\frac, \\sqrt, \\sum, \\int, \\bar, \\hat, \\alpha, \\leq, \\pm, \\cdot, \\text{...}, \\begin{pmatrix}...). Return JSON: { "fixes": [ { "id": "...", "latex": "..." } ] }. Output only JSON.`;

/** Every string of a note block that can hold maths, as [read, write] pairs. */
function mathSlots(block) {
  const slots = [];
  for (const key of MATH_FIELDS) if (typeof block[key] === "string" && block[key]) slots.push([() => block[key], (value) => { block[key] = value; }]);
  for (const bullet of block.bullets || []) if (bullet?.text) slots.push([() => bullet.text, (value) => { bullet.text = value; }]);
  return slots;
}

/**
 * Makes every formula in the notes valid LaTeX that KaTeX renders: canonical delimiters, flattened
 * Unicode maths rebuilt, doubled backslashes and Unicode inside the dollars fixed, stray dollars
 * escaped (`repairMathText`). Formulas the local fixes cannot save are sent, in ONE small batched
 * request, to the model (when `ask` is given); whatever still fails is shown as a code span rather
 * than as broken markup. Returns new blocks (the input is not changed) and what was done.
 */
export async function repairNotesMath(blocks = [], { ask = null } = {}) {
  const copy = blocks.map((block) => ({ ...block, bullets: block.bullets ? block.bullets.map((bullet) => ({ ...bullet })) : block.bullets }));
  const stats = { repaired: 0, invalid: 0, modelFixed: 0, codeSpans: 0, modelCalls: 0 };
  const slots = copy.flatMap(mathSlots);
  const pending = [];
  for (const [read, write] of slots) {
    const before = read();
    if (!/[$\\\u0080-￿]|\)\s*\/\s*\(/.test(before)) continue;
    const fixed = repairMathText(before);
    if (fixed.changed) { write(fixed.text); stats.repaired += 1; }
    for (const formula of fixed.invalid) pending.push({ formula, write, read });
  }
  stats.invalid = pending.length;
  if (pending.length && ask) {
    const unique = [...new Set(pending.map((entry) => entry.formula.tex))].slice(0, MATH_FIX_BATCH * 3);
    for (let from = 0; from < unique.length; from += MATH_FIX_BATCH) {
      const batch = unique.slice(from, from + MATH_FIX_BATCH);
      try {
        stats.modelCalls += 1;
        const result = await ask({ system: FIX_SYSTEM_PROMPT, user: JSON.stringify({ formulas: batch.map((latex, index) => ({ id: `F${from + index + 1}`, latex })) }), schema: FIX_SCHEMA, schemaName: "formula_fixes", maxTokens: MATH_FIX_MAX_TOKENS });
        for (const fix of Array.isArray(result?.parsed?.fixes) ? result.parsed.fixes : []) {
          const index = Number(String(fix?.id || "").replace(/^F/, "")) - 1;
          const original = unique[index];
          const latex = String(fix?.latex || "").replace(/^\$+|\$+$/g, "").trim();
          if (!original || !latex || !isValidTex(latex)) continue;
          for (const entry of pending) {
            if (entry.formula.tex !== original) continue;
            entry.write(replaceFormula(entry.read(), original, latex));
          }
          stats.modelFixed += 1;
        }
      } catch {
        // The model is only a second chance: a failed request leaves the code-span fallback to do its job.
      }
    }
  }
  for (const [read, write] of slots) {
    const value = read();
    if (!invalidFormulas(value).length) continue;
    write(codeSpanInvalid(value));
    stats.codeSpans += 1;
  }
  return { blocks: copy, stats };
}

/* ------------------------------------------------------------------ prompts */

const NOTE_FORMAT = `Block types for "blocks":
- heading: a sub-heading inside the topic (text, level 2-4).
- paragraph: running text (text).
- bullet_list: a list (optional text = list title; bullets = [{text, sources}] — cite EACH bullet).
- callout: a highlighted note (text; callout_type: info | tip | warning | note). Use it for definitions worth remembering, warnings, exam tips, figure descriptions and for disagreements between documents.
- table_row: ONE row of a table (term = row label / first column, meaning = second column, detail = third column). Consecutive rows form the table.
Set every field a type does not use to null.`;

const COMPLETENESS_RULES = `1. COMPLETENESS: keep every distinct fact, definition, rule, theorem, step, worked example, date, name, number, formula, table row and figure description. Condense the wording, never the information. Do not summarise detail away and do not add anything that is not in the material.
2. FORMULAS: write EVERY mathematical expression as valid LaTeX — inline between single dollar signs, or display between double dollar signs for important or long formulas (definitions, results, anything with a fraction, sum, integral, root or matrix). This holds even when the material gives the maths as plain text, Unicode or a flattened line from a PDF: reconstruct it as LaTeX. For example "S²ₓ" becomes $S_x^2$; "(1)/(n-1) ∑ᵢ₌₁ⁿ(xᵢ − x̄)²" becomes $\\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2$; √ becomes \\sqrt{...}; x̄ becomes \\bar{x}; ± becomes \\pm; ≤ becomes \\leq; Greek letters become \\alpha, \\sigma, \\mu...; sub- and superscripts become _{...} and ^{...}. Never mix plain-text maths with LaTeX in one expression, never put a sentence inside the dollars (use \\text{...} only for a short label), and never describe a formula in words instead. Keep each formula complete, in ONE block and ONE piece (never split a formula across bullets or blocks), and keep the meaning of its variables next to it. A currency amount is written "5 USD" or \\$5, never with a bare dollar sign.
3. TABLES: keep every row and every column. Tables of up to three columns become table_row blocks (introduce the table in a paragraph that names its columns); a wider table becomes a bullet_list with one bullet per row, each bullet naming the value of every column ("Row label — Column 2: x; Column 3: y").
4. FIGURES: a line like ![description](…) is a figure, chart, graph, diagram or scheme. Never drop it: write what it shows (type, axes, series, key values, labels, the point it makes) and its caption in a callout of type note that starts with "Figure:". Never print file paths or URLs.
5. SOURCES: every block (every bullet in a list) lists in "sources" the sourceIds of ALL the passages it was written from — at least one, only ids present in the input. When overlapping information from several passages is merged into one statement, list all of them.`;

function mapSystemPrompt(options) {
  return `You are building an exhaustive, consolidated set of study notes from reference material. You receive PASSAGES (each with a sourceId such as S12) taken from one or more original documents. Rewrite them as clean, structured notes grouped by topic.

NON-NEGOTIABLE RULES
${COMPLETENESS_RULES}
6. BY TOPIC, NOT BY DOCUMENT: group related material under topics (a title and its blocks) following the subject matter, not the order of the passages or the document they come from.
7. NO DUPLICATES: if the same information appears more than once (the passages overlap at their edges, or two documents say the same thing), write it ONCE in its clearest form and cite every passage it came from. If two passages give complementary detail about the same point, join them into one statement that contains both. Never write the same sentence twice.
8. ${languageRule(options.language)}
${options.focus ? `9. FOCUS: the reader cares most about "${options.focus}". Put the topics about it first and give them the most depth — but everything else is still included.` : "9. Order topics from the foundations to the most advanced."}

${NOTE_FORMAT}

Return JSON: { "topics": [ { "title": "...", "blocks": [ ... ] } ] }. Use few, meaningful topics (a topic can hold many blocks). Output only JSON.`;
}

function organiseSystemPrompt(options) {
  return `You are designing the outline of ONE consolidated study document. You receive DRAFT TOPICS (id, title, which documents they come from, how big they are) written from several documents. Group them into the sections of the final document.

RULES
1. Organise by subject matter, NOT by source document: draft topics that cover the same concept or closely related concepts (even when they come from different documents or have different titles) go into the same section.
2. Order the sections the way a student should learn them: foundations first, then the more advanced topics, applications and worked examples last.
3. EVERY draft topic id must appear in exactly one section. Never invent ids, never leave one out.
4. Section titles are specific and short. Also write a specific title for the whole document.
5. ${languageRule(options.language)}
${options.focus ? `6. The reader cares most about "${options.focus}": sections about it come first.` : ""}
Return JSON: { "title": "...", "sections": [ { "title": "...", "topicIds": ["T1","T4"] } ] }. Output only JSON.`;
}

function mergeSystemPrompt(options) {
  return `You are merging DRAFT SECTIONS of study notes into ONE section of a consolidated document. The drafts were written from different documents or different parts of them and overlap: they cover the same subject. Each block carries "sources" (passage ids such as S12) saying where it comes from.

NON-NEGOTIABLE RULES
${COMPLETENESS_RULES}
6. MERGE, DO NOT STACK: write one integrated section with a logical order (definition → explanation → formulas → examples → exceptions). Information that is repeated across drafts appears ONCE, in its clearest and most complete form; details that only one draft has are kept and placed where they belong. Do not output the drafts one after the other.
7. WHEN DOCUMENTS DISAGREE (different values, definitions or conventions) keep both versions and add a callout of type warning that states the difference and which sources say what.
8. The sources of a merged block are the UNION of the sources of everything merged into it.
9. ${languageRule(options.language)}
${options.focus ? `10. The reader cares most about "${options.focus}": give it the most depth.` : ""}
10. Use heading blocks (level 2-4) for sub-structure inside the section; the section's own title is added separately, so do not repeat it as a heading.

${NOTE_FORMAT}

Return JSON: { "topics": [ { "title": "<the section title>", "blocks": [ ... ] } ] } — normally exactly one topic. Output only JSON.`;
}

/* ------------------------------------------------------------------ orchestration */

/** Runs `tasks` (functions) with at most `limit` in flight; results keep their order. */
export async function runPool(tasks, limit = CONCURRENCY) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const addUsage = (total, usage) => {
  if (!usage) return;
  total.prompt_tokens += Number(usage.prompt_tokens) || 0;
  total.completion_tokens += Number(usage.completion_tokens) || 0;
  total.total_tokens += Number(usage.total_tokens) || (Number(usage.prompt_tokens) || 0) + (Number(usage.completion_tokens) || 0);
};

/**
 * Consolidates `documents` ({ id, name, content }) into one block document.
 * deps: { callModel({ system, user, schema, schemaName, maxTokens }) → { parsed, usage, finishReason } | null (no model),
 *         emit(event), model }
 * Returns { blocks, title, usage, model, originals, coverage, stats }.
 */
export async function runConsolidation({ documents = [], options = {}, deps = {} }) {
  const emit = deps.emit || (() => {});
  const callModel = deps.callModel || null;
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const stats = { calls: 0, mapGroups: 0, splits: 0, recoveredPassages: 0, carriedOverPassages: 0, sections: 0, mergeCalls: 0, mergeFallbacks: 0, timeBudgetHit: false, usedModel: Boolean(callModel) };
  const startedAt = Date.now();
  const budget = Number(deps.budgetMs) > 0 ? Number(deps.budgetMs) : TIME_BUDGET_MS;
  const pastFraction = (fraction) => Date.now() - startedAt > budget * fraction;

  const { docs, chunks } = prepareSources(documents);
  if (!chunks.length) throw new Error("The selected documents have no readable text to consolidate.");
  const byId = new Map(chunks.map((chunk) => [chunk.sid, chunk]));
  const allIds = new Set(byId.keys());
  emit({ step: "chunk", status: "end", chunkCount: chunks.length });

  async function ask(request) {
    stats.calls += 1;
    const result = await callModel(request);
    addUsage(usage, result?.usage);
    return result;
  }

  let draftTopics;
  if (!callModel) {
    // No model: the passages are parsed and merged by heading — still de-duplicated, still traced.
    draftTopics = localTopics(chunks);
    emit({ step: "generate", status: "progress", phase: "map", done: 1, total: 1, label: "Reading the documents (no model available)" });
  } else {
    /* ---- 1 · MAP */
    const groups = groupChunks(chunks);
    stats.mapGroups = groups.length;
    let mapped = 0;
    emit({ step: "generate", status: "progress", phase: "map", done: 0, total: groups.length, label: `Reading ${docs.length} document${docs.length === 1 ? "" : "s"} in ${groups.length} part${groups.length === 1 ? "" : "s"}` });

    async function mapGroup(group, { gap = false } = {}) {
      const ids = new Set(group.map((chunk) => chunk.sid));
      let topics = null;
      if (pastFraction(0.6)) {
        // Out of time for the model: keep the passages as they are (parsed, de-duplicated) rather than drop them.
        stats.timeBudgetHit = true;
        stats.carriedOverPassages += group.length;
        return localTopics(group);
      }
      try {
        const result = await ask({ system: mapSystemPrompt(options), user: JSON.stringify({ task: gap ? "Write notes for these passages, which an earlier pass left out. Leave nothing out." : "Write the consolidated notes for these passages.", passages: group.map(passageForModel) }), schema: TOPICS_SCHEMA, schemaName: "consolidation_notes", maxTokens: MAP_MAX_TOKENS });
        topics = parseTopics(result?.parsed, ids, [group[0].sid]);
        if (!topics.length) throw new Error("empty");
      } catch {
        topics = null;
      }
      if (!topics) {
        if (group.length > 1) {
          // Too much for one answer (or unreadable): halve it and try again.
          stats.splits += 1;
          const middle = Math.ceil(group.length / 2);
          const halves = await Promise.all([mapGroup(group.slice(0, middle), { gap }), mapGroup(group.slice(middle), { gap })]);
          return halves.flat();
        }
        stats.carriedOverPassages += 1;
        return localTopics(group);
      }
      if (!gap) {
        const cited = citedSources(topics.flatMap((topic) => topic.blocks));
        const skipped = group.filter((chunk) => !cited.has(chunk.sid) && String(chunk.content).split(/\s+/).filter(Boolean).length >= MIN_WORDS_TO_RECOVER);
        if (skipped.length) {
          const recovered = await mapGroup(skipped, { gap: true });
          const recoveredCited = citedSources(recovered.flatMap((topic) => topic.blocks));
          stats.recoveredPassages += skipped.filter((chunk) => recoveredCited.has(chunk.sid)).length;
          topics = [...topics, ...recovered];
          // Still not written up after a second ask: carry the passage over as it is.
          const stillSkipped = skipped.filter((chunk) => !recoveredCited.has(chunk.sid));
          if (stillSkipped.length) {
            stats.carriedOverPassages += stillSkipped.length;
            topics = [...topics, ...localTopics(stillSkipped)];
          }
        }
      }
      return topics;
    }

    const mappedGroups = await runPool(groups.map((group) => async () => {
      const topics = await mapGroup(group);
      mapped += 1;
      emit({ step: "generate", status: "progress", phase: "map", done: mapped, total: groups.length, label: `Read part ${mapped} of ${groups.length}` });
      return topics;
    }));
    draftTopics = mappedGroups.flat();
  }
  draftTopics = draftTopics.map((topic, index) => ({ ...topic, id: `T${index + 1}`, chars: draftSize(topic), docs: [...new Set(citedIdsOf(topic).map((id) => byId.get(id)?.tag).filter(Boolean))] }));

  /* ---- 2 · ORGANISE */
  let outline;
  let title = "";
  if (callModel && draftTopics.length > 1) {
    emit({ step: "generate", status: "progress", phase: "organise", done: 0, total: 1, label: "Organising the notes by topic" });
    try {
      const result = await ask({ system: organiseSystemPrompt(options), user: JSON.stringify({ documents: docs.map((doc) => ({ tag: doc.tag, name: doc.name })), draftTopics: draftTopics.map((topic) => ({ id: topic.id, title: topic.title, from: topic.docs, size: topic.chars, firstLine: noteText(topic.blocks.find((block) => block.type !== "heading") || topic.blocks[0]).slice(0, 140) })) }), schema: OUTLINE_SCHEMA, schemaName: "consolidation_outline", maxTokens: ORGANISE_MAX_TOKENS });
      outline = parseOutline(result?.parsed, draftTopics);
      title = clean(result?.parsed?.title);
    } catch {
      outline = null;
    }
  }
  // Without a usable outline each draft topic is a section of its own, joined by equal titles.
  if (!outline) outline = outlineByTitle(draftTopics);
  stats.sections = outline.length;

  /* ---- 3 · MERGE */
  let merged = 0;
  emit({ step: "generate", status: "progress", phase: "merge", done: 0, total: outline.length, label: `Merging ${outline.length} section${outline.length === 1 ? "" : "s"}` });
  const sections = await runPool(outline.map((entry) => async () => {
    const topics = entry.topicIds.map((id) => draftTopics.find((topic) => topic.id === id)).filter(Boolean);
    const blocks = await mergeEntry(topics, entry.title);
    merged += 1;
    emit({ step: "generate", status: "progress", phase: "merge", done: merged, total: outline.length, label: `Merged ${entry.title}` });
    return { title: entry.title, blocks };
  }));

  async function mergeEntry(topics, sectionTitle, round = 0) {
    const everything = topics.flatMap((topic) => topic.blocks);
    // One draft from one place is already de-duplicated; without a model, or out of time, so is the rest.
    if (topics.length === 1 || !callModel) return dedupeNotes(everything);
    if (pastFraction(0.9)) { stats.timeBudgetHit = true; stats.mergeFallbacks += 1; return dedupeNotes(everything); }
    // Batches that fit one call.
    const batches = [];
    let current = [];
    let size = 0;
    for (const topic of topics) {
      if (current.length && size + topic.chars > MERGE_BATCH_CHARS) { batches.push(current); current = []; size = 0; }
      current.push(topic);
      size += topic.chars;
    }
    if (current.length) batches.push(current);
    if (batches.length === 1) return mergeBatch(batches[0], sectionTitle);
    const partials = await Promise.all(batches.map((batch) => mergeBatch(batch, sectionTitle)));
    // A section too big for one call is merged in batches, and the batches' results are merged again
    // (while that keeps shrinking them) so overlaps between batches are removed too.
    const before = topics.reduce((sum, topic) => sum + topic.chars, 0);
    const pseudo = partials.map((blocks, index) => ({ id: `${sectionTitle}#${round}.${index}`, title: sectionTitle, blocks, chars: draftSize({ blocks }), docs: [...new Set(blocks.flatMap((block) => citedIdsOf({ blocks: [block] })).map((id) => byId.get(id)?.tag).filter(Boolean))] }));
    const after = pseudo.reduce((sum, topic) => sum + topic.chars, 0);
    if (round < 2 && after < before * 0.95) return mergeEntry(pseudo, sectionTitle, round + 1);
    return dedupeNotes(partials.flat());
  }

  async function mergeBatch(batch, sectionTitle) {
    const draftBlocks = batch.flatMap((topic) => topic.blocks);
    if (batch.length === 1) return dedupeNotes(draftBlocks);
    stats.mergeCalls += 1;
    try {
      const ids = new Set(draftBlocks.flatMap((block) => [...(block.sources || []), ...(block.bullets || []).flatMap((bullet) => bullet.sources)]));
      const result = await ask({ system: mergeSystemPrompt(options), user: JSON.stringify({ task: "Merge these drafts into one section.", sectionTitle, drafts: batch.map((topic) => ({ title: topic.title, from: topic.docs, blocks: topic.blocks.map(compactBlock) })) }), schema: TOPICS_SCHEMA, schemaName: "consolidation_section", maxTokens: MERGE_MAX_TOKENS });
      const topics = parseTopics(result?.parsed, ids, [...ids].slice(0, 1));
      const blocks = topics.flatMap((topic) => topic.blocks);
      // A merge that lost most of the text is a bad merge: keep the drafts instead.
      const before = draftBlocks.reduce((sum, block) => sum + noteText(block).length, 0);
      const after = blocks.reduce((sum, block) => sum + noteText(block).length, 0);
      if (!blocks.length || after < before * 0.35) throw new Error("merge lost content");
      return dedupeNotes(blocks);
    } catch {
      stats.mergeFallbacks += 1;
      return dedupeNotes(draftBlocks);
    }
  }

  /* ---- 4 · ASSEMBLE + CHECK */
  emit({ step: "generate", status: "progress", phase: "check", done: 0, total: 1, label: "Checking that nothing is missing" });
  const text = stringsFor(options.language);
  const documentTitle = title || (docs.length === 1 ? docs[0].name.replace(/\.[^.]+$/, "") : docs.slice(0, 3).map((doc) => doc.name.replace(/\.[^.]+$/, "")).join(" · "));
  // Every formula must be LaTeX that renders: repaired locally, then (one batched request) by the model, else shown as code.
  const flat = sections.flatMap((section) => section.blocks);
  const repaired = await repairNotesMath(flat, { ask: callModel ? ask : null });
  stats.mathRepair = repaired.stats;
  {
    let at = 0;
    for (const section of sections) { section.blocks = repaired.blocks.slice(at, at + section.blocks.length); at += section.blocks.length; }
  }
  const body = [];
  for (const section of sections) {
    if (!section.blocks.length) continue;
    body.push({ type: "section_header", title: section.title, intro: null }, ...notesToBlocks(section.blocks, byId));
  }
  let finalBlocks = body;
  const absent = missingFormulas(chunks, finalBlocks);
  if (absent.length) {
    const extra = (await repairNotesMath(absent.slice(0, 80).map(({ formula, sid }) => ({ type: "paragraph", text: `$$${formula}$$`, sources: [sid] })))).blocks;
    finalBlocks = [...body, { type: "section_header", title: text.extra, intro: text.extraIntro }, ...notesToBlocks(extra, byId)];
  }
  const cited = citedSources(sections.flatMap((section) => section.blocks));
  const header = [
    { type: "document_header", title: documentTitle },
    { type: "callout", text: text.intro(docs.length), callout_type: "info" },
    // `_docs` lets the output turn each document's name in the key into a link that opens the original.
    { type: "bullet_list", title: text.key, items: docs.map((doc) => `${doc.tag} — ${doc.name} (${text.passages(doc.chunkCount)})`), _docs: docs.map((doc) => ({ tag: doc.tag, id: doc.id, name: doc.name })) }
  ];
  const blocks = conformBlocks([...header, ...finalBlocks]);
  const coverage = { passages: chunks.length, passagesCited: [...allIds].filter((id) => cited.has(id)).length, formulasMissingAfterMerge: absent.length, formulasAppended: Math.min(absent.length, 80) };
  emit({ step: "generate", status: "progress", phase: "check", done: 1, total: 1, label: "Checked" });

  return {
    blocks,
    title: documentTitle,
    usage,
    originals: docs.map((doc) => ({ tag: doc.tag, id: doc.id, name: doc.name, passages: doc.chunkCount })),
    coverage,
    stats
  };
}

function citedIdsOf(topic) {
  return [...citedSources(topic.blocks)];
}

/** The model's outline held to the drafts: unknown ids dropped, repeated ids kept once, forgotten topics appended. */
export function parseOutline(parsed, draftTopics) {
  const known = new Set(draftTopics.map((topic) => topic.id));
  const used = new Set();
  const outline = [];
  for (const section of Array.isArray(parsed?.sections) ? parsed.sections : []) {
    const topicIds = (Array.isArray(section?.topicIds) ? section.topicIds : []).map(clean).filter((id) => known.has(id) && !used.has(id));
    topicIds.forEach((id) => used.add(id));
    if (topicIds.length) outline.push({ title: clean(section.title) || draftTopics.find((topic) => topic.id === topicIds[0])?.title || "Notes", topicIds });
  }
  const forgotten = draftTopics.filter((topic) => !used.has(topic.id));
  if (!outline.length) return null;
  for (const topic of forgotten) outline.push({ title: topic.title, topicIds: [topic.id] });
  return outline;
}

/** Fallback outline: draft topics with the same title (any document) share a section. */
export function outlineByTitle(draftTopics) {
  const byTitle = new Map();
  for (const topic of draftTopics) {
    const key = norm(topic.title);
    if (!byTitle.has(key)) byTitle.set(key, { title: topic.title, topicIds: [] });
    byTitle.get(key).topicIds.push(topic.id);
  }
  return [...byTitle.values()];
}

/** Rough size of a run before it happens, in tokens, from the characters of the material. */
export function estimateConsolidationTokens(chunks = [], groupCount = 0) {
  const chars = chunks.reduce((sum, chunk) => sum + String(chunk.content || "").length, 0);
  const material = Math.ceil(chars / 4);
  const groups = groupCount || Math.max(1, Math.ceil(chars / MAP_GROUP_CHARS));
  // map: material in, notes out (~85 % of it as JSON) · merge: the notes in, the merged sections out · outline: titles only.
  const notes = Math.ceil(material * 0.85);
  const inputTokens = material + groups * 950 + notes + groups * 150 + 700;
  const outputTokens = notes + Math.ceil(notes * 0.8) + 400;
  return { inputTokens, outputTokens };
}
