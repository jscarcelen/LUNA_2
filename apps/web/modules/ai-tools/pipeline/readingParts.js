/**
 * Reading Splitter — cuts whole documents into short reading parts, deterministically.
 *
 * Why not one model call: the model used to receive only the best-ranked passages that fit the material
 * budget (≈ 48k characters) and could write only ≈ 6k tokens, so a long document came back as two or
 * three parts, some with only a heading, and the rest of the material was silently missing. Copying text
 * is not a job for a model anyway. Here the CODE decides the parts from the document's own structure
 * (its headings and blocks, in order) and copies every passage word for word; the model only writes the
 * light parts around each one (a title, one line on why to read it, two or three "Check yourself"
 * questions and a difficulty), in small batches.
 *
 * Guarantees (tested in tests/ai-tools/reading-parts.test.ts):
 *  - every heading and every passage of every document is in exactly one part, in the original order;
 *  - no part is empty: a heading with no text of its own travels with the text that follows it;
 *  - a part is never cut inside a code or formula block, a table or a list.
 *
 * Pure functions, no I/O. The model is reached through `deps.callModel` (the same contract as the
 * Summary Notes Consolidator) so the orchestration is testable without a network.
 */

import { conformBlocks } from "../blocks/blockRegistry.js";
import { stripLeakedStyleTextPrefix } from "./chunking.js";

export const WORDS_PER_MINUTE = 200;
export const DEFAULT_MINUTES = 25;
/** Parts sent to the model in one request for their titles and questions. */
export const LIGHT_BATCH_PARTS = 6;
export const LIGHT_MAX_TOKENS = 3000;
export const LIGHT_CONCURRENCY = 4;
/** How much of each part the model sees: the opening and the end are enough to title it and ask about it. */
const LIGHT_HEAD_CHARS = 1800;
const LIGHT_TAIL_CHARS = 500;

/* ------------------------------------------------------------------ options */

/** Language, how to split, minutes per part and focus, from the runner's answers (and a plan step's topics). */
export function splitOptions(config = {}) {
  const answers = Array.isArray(config.questionAnswers) ? config.questionAnswers : [];
  const find = (re) => {
    const value = answers.find((entry) => re.test(String(entry?.question || "")))?.answer;
    return Array.isArray(value) ? value.join(", ") : String(value ?? "").trim();
  };
  const language = find(/language/i);
  const by = find(/split by|split/i).toLowerCase();
  const minutes = Number(find(/minutes/i));
  const focusText = find(/focus/i);
  const planFocus = Array.isArray(config.readingFocus) ? config.readingFocus.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
  return {
    language: !language || /same as|document/i.test(language) ? "" : language,
    splitBy: /time/.test(by) ? "time" : /diffic/.test(by) ? "difficulty" : "topic",
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(90, Math.max(5, minutes)) : DEFAULT_MINUTES,
    focus: [...new Set([...(focusText ? [focusText] : []), ...planFocus])]
  };
}

/* ------------------------------------------------------------------ structure */

const isFence = (line) => /^\s*```/.test(line);
const isMathFence = (line) => /^\s*\$\$\s*$/.test(line);
const headingOf = (line) => /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
const pageOf = (line) => /^\s*<!--\s*page\s+(\d+)\s*-->\s*$/i.exec(line);

/** Words a passage takes to read: formulas, code and table rows count extra because they are read slowly. */
export function readingWords(text) {
  const source = String(text || "");
  const words = source.split(/\s+/).filter(Boolean).length;
  const displayMath = (source.match(/\$\$/g) || []).length / 2;
  const tableRows = source.split("\n").filter((line) => /^\s*\|.*\|\s*$/.test(line)).length;
  return Math.round(words + displayMath * 40 + tableRows * 6);
}

/**
 * A document's Markdown → its sections in order: { heading, level, path, body, pageFrom, pageTo }.
 * Text before the first heading is a section with no heading (level 0). Headings inside code or formula
 * fences are text, not headings. Page markers are location data, kept as page numbers, not as text.
 */
export function documentSections(markdown) {
  const lines = stripLeakedStyleTextPrefix(String(markdown || "")).replace(/\r/g, "").split("\n");
  const sections = [];
  const path = [];
  let page = null;
  let current = { heading: "", level: 0, path: [], lines: [], pageFrom: null, pageTo: null };
  let fence = "";
  const close = () => {
    const body = current.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (current.heading || body) sections.push({ heading: current.heading, level: current.level, path: current.path, body, pageFrom: current.pageFrom, pageTo: current.pageTo ?? current.pageFrom });
  };
  for (const line of lines) {
    if (fence) {
      current.lines.push(line);
      if ((fence === "code" && isFence(line)) || (fence === "math" && isMathFence(line))) fence = "";
      continue;
    }
    if (isFence(line) || isMathFence(line)) {
      fence = isFence(line) ? "code" : "math";
      current.lines.push(line);
      continue;
    }
    const marker = pageOf(line);
    if (marker) {
      page = Number(marker[1]);
      if (current.pageFrom === null) current.pageFrom = page;
      current.pageTo = page;
      continue;
    }
    const heading = headingOf(line);
    if (heading) {
      close();
      const level = heading[1].length;
      const text = heading[2].trim();
      path[level - 1] = text;
      path.splice(level);
      current = { heading: text, level, path: path.filter(Boolean), lines: [], pageFrom: page, pageTo: page };
      continue;
    }
    if (line.trim() && current.pageFrom === null && page !== null) current.pageFrom = page;
    current.lines.push(line);
  }
  close();
  return sections;
}

/**
 * A section body → its units, split at blank lines but never inside a fence, a table or a list, so a cut
 * between units never breaks a formula, a derivation in a code block, a table or a list.
 */
export function bodyUnits(body) {
  const lines = String(body || "").split("\n");
  const units = [];
  let buffer = [];
  let fence = "";
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) units.push(text);
    buffer = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      buffer.push(line);
      if ((fence === "code" && isFence(line)) || (fence === "math" && isMathFence(line))) fence = "";
      continue;
    }
    if (isFence(line) || isMathFence(line)) { fence = isFence(line) ? "code" : "math"; buffer.push(line); continue; }
    if (!line.trim()) {
      // A blank line between two rows of a table or two items of a list does not end it.
      const previous = buffer[buffer.length - 1] || "";
      const next = lines.slice(index + 1).find((entry) => entry.trim()) || "";
      const sameTable = /^\s*\|/.test(previous) && /^\s*\|/.test(next);
      const sameList = isListLine(previous) && isListLine(next);
      if (sameTable || sameList) continue;
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return units;
}

const isListLine = (line) => /^\s*(?:[-*+•]|\d+[.)])\s+/.test(String(line || ""));

/**
 * Sections → segments no longer than `maxWords`: a section too long for one part is cut between its
 * units; the pieces after the first keep the heading, marked `continued`.
 */
export function segmentsOf(sections, maxWords) {
  const out = [];
  for (const section of sections) {
    const words = readingWords(section.body);
    if (!section.body || words <= maxWords) { out.push({ ...section, words, continued: false }); continue; }
    let piece = [];
    let pieceWords = 0;
    let first = true;
    const push = () => {
      if (!piece.length) return;
      const body = piece.join("\n\n");
      out.push({ ...section, body, words: readingWords(body), continued: !first });
      first = false;
      piece = [];
      pieceWords = 0;
    };
    for (const unit of bodyUnits(section.body)) {
      const size = readingWords(unit);
      if (piece.length && pieceWords + size > maxWords) push();
      piece.push(unit);
      pieceWords += size;
    }
    push();
  }
  return out;
}

const partWords = (segments) => segments.reduce((sum, segment) => sum + segment.words, 0);
const hasText = (segments) => segments.some((segment) => segment.body);

/**
 * Groups one document's segments into parts.
 *  - topic / difficulty: a new part starts at every top-level heading; a topic longer than twice the
 *    target is cut at its sub-sections; very short topics join the next one.
 *  - time: parts of about the target length, cut only between sections (or between units of a long one).
 * A part always holds text: headings with no text of their own move on to the part that has their text.
 */
export function groupSegments(segments, { targetWords, splitBy = "topic" }) {
  const target = Math.max(80, Number(targetWords) || DEFAULT_MINUTES * WORDS_PER_MINUTE);
  const levels = segments.filter((segment) => segment.level > 0).map((segment) => segment.level);
  const top = levels.length ? Math.min(...levels) : 1;
  let groups = [];
  let current = [];
  const cut = () => { if (current.length) groups.push(current); current = []; };

  for (const segment of segments) {
    const words = partWords(current);
    if (splitBy === "time") {
      if (current.length && hasText(current) && words + segment.words > target * 1.15 && words >= target * 0.5) cut();
    } else {
      const startsTopic = segment.level === top && !segment.continued;
      const tooLong = hasText(current) && words + segment.words > target * 2;
      if (current.length && hasText(current) && (startsTopic || tooLong)) cut();
    }
    current.push(segment);
  }
  cut();

  // Short topics join the next (the last joins the previous), so no part is a few lines long.
  if (splitBy !== "time" && groups.length > 1) {
    const merged = [];
    for (const group of groups) {
      const last = merged[merged.length - 1];
      if (last && partWords(last) < target * 0.35 && partWords(last) + partWords(group) <= target * 2) last.push(...group);
      else merged.push([...group]);
    }
    const tail = merged[merged.length - 1];
    if (merged.length > 1 && partWords(tail) < target * 0.35 && partWords(merged[merged.length - 2]) + partWords(tail) <= target * 2) merged[merged.length - 2].push(...merged.pop());
    groups = merged;
  }

  // A group made only of headings (no text) gives them to the next group, or to the previous one at the end.
  const out = [];
  let carry = [];
  for (const group of groups) {
    const withCarry = [...carry, ...group];
    if (hasText(withCarry)) { out.push(withCarry); carry = []; } else carry = withCarry;
  }
  if (carry.length) {
    if (out.length) out[out.length - 1].push(...carry);
    else out.push(carry.map((segment) => ({ ...segment, body: segment.heading, words: readingWords(segment.heading) })));
  }
  return out;
}

const minutesFor = (words) => Math.max(1, Math.round(words / WORDS_PER_MINUTE));

/** The default title of a part: its first heading of the highest level, or the document name. */
function defaultTitle(segments, documentName, index) {
  const headed = segments.filter((segment) => segment.heading);
  if (!headed.length) return `${documentName} (${index})`;
  const top = Math.min(...headed.map((segment) => segment.level));
  const first = headed.find((segment) => segment.level === top);
  return first.continued ? `${first.heading} (cont.)` : first.heading;
}

/**
 * Picks the sections that deal with a focus (a topic, or a plan step's concepts): a section whose heading
 * path or text names a focus phrase, or most of its words. Returns null when nothing matches, so the
 * caller can say so rather than invent a part.
 */
export function focusSections(sections, focus = []) {
  const norm = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const phrases = focus.map(norm).map((phrase) => phrase.trim()).filter(Boolean);
  if (!phrases.length) return sections;
  const scored = sections.map((section) => {
    const head = norm(section.path.join(" ") || section.heading);
    const body = norm(section.body);
    let score = 0;
    for (const phrase of phrases) {
      if (head.includes(phrase)) score += 3;
      else if (body.includes(phrase)) score += 1;
      else {
        const words = phrase.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
        if (words.length && words.filter((word) => head.includes(word)).length / words.length >= 0.6) score += 1;
      }
    }
    return score;
  });
  const best = Math.max(0, ...scored);
  if (!best) return null;
  return sections.filter((section, index) => scored[index] > 0 && scored[index] >= Math.min(best, 3) * 0.5);
}

/**
 * Documents ({ id, name, content }) → reading parts, in order, every passage copied exactly.
 * Each part: { index, documentId, documentName, title, segments, words, minutes, pageFrom, pageTo }.
 * With a focus only the sections about it are split (`focusMissed` lists documents with nothing on it).
 */
export function buildReadingParts(documents = [], { minutes = DEFAULT_MINUTES, splitBy = "topic", focus = [] } = {}) {
  const targetWords = Math.max(1, Number(minutes) || DEFAULT_MINUTES) * WORDS_PER_MINUTE;
  const parts = [];
  const focusMissed = [];
  for (const document of documents) {
    const all = documentSections(document?.content);
    if (!all.length) continue;
    const chosen = focus.length ? focusSections(all, focus) : all;
    if (!chosen) { focusMissed.push(document.name || "document"); continue; }
    const groups = groupSegments(segmentsOf(chosen, targetWords * (splitBy === "time" ? 1.15 : 2)), { targetWords, splitBy });
    for (const segments of groups) {
      const words = partWords(segments);
      const pages = segments.flatMap((segment) => [segment.pageFrom, segment.pageTo]).filter((page) => Number.isFinite(page));
      parts.push({
        index: parts.length + 1,
        documentId: document.id || "",
        documentName: document.name || "Document",
        title: defaultTitle(segments, document.name || "Document", parts.length + 1),
        segments,
        words,
        minutes: minutesFor(words),
        pageFrom: pages.length ? Math.min(...pages) : null,
        pageTo: pages.length ? Math.max(...pages) : null
      });
    }
  }
  return { parts, focusMissed };
}

/* ------------------------------------------------------------------ coverage */

const textTokens = (text) => String(text || "").replace(/<!--[\s\S]*?-->/g, " ").split(/\s+/).filter(Boolean);

/**
 * What the parts cover of the documents: every heading and every word, in order. `complete` is true when
 * nothing was dropped (with a focus, only the chosen sections are expected).
 */
export function readingCoverage(documents = [], parts = []) {
  const expectedHeadings = [];
  const expectedWords = [];
  for (const document of documents) {
    for (const section of documentSections(document?.content)) {
      if (section.heading) expectedHeadings.push(section.heading);
      expectedWords.push(...textTokens(section.heading), ...textTokens(section.body));
    }
  }
  const gotHeadings = new Set();
  const gotWords = [];
  for (const part of parts) {
    for (const segment of part.segments) {
      if (segment.heading && !segment.continued) { gotHeadings.add(segment.heading); gotWords.push(...textTokens(segment.heading)); }
      if (segment.body !== segment.heading) gotWords.push(...textTokens(segment.body));
    }
  }
  const emptyParts = parts.filter((part) => !part.segments.some((segment) => String(segment.body || "").trim())).length;
  return {
    parts: parts.length,
    headings: expectedHeadings.length,
    headingsCovered: expectedHeadings.filter((heading) => gotHeadings.has(heading)).length,
    words: expectedWords.length,
    wordsCovered: Math.min(expectedWords.length, gotWords.length),
    inOrder: gotWords.join(" ") === expectedWords.join(" "),
    emptyParts,
    complete: emptyParts === 0 && gotWords.join(" ") === expectedWords.join(" ")
  };
}

/* ------------------------------------------------------------------ blocks */

const STRINGS = {
  en: { part: "Part", min: (n) => `about ${n} min`, pages: (a, b) => (a === b ? `page ${a}` : `pages ${a}–${b}`), why: "Why read this", check: "Check yourself", title: (name, n) => `${name}: ${n} reading part${n === 1 ? "" : "s"}`, many: (n) => `Your documents in ${n} reading part${n === 1 ? "" : "s"}`, nothing: (focus) => `The material has nothing on “${focus}”.`, figure: "Figure", difficulty: { foundation: "foundations", core: "core ideas", advanced: "advanced" } },
  es: { part: "Parte", min: (n) => `unos ${n} min`, pages: (a, b) => (a === b ? `página ${a}` : `páginas ${a}–${b}`), why: "Por qué leerla", check: "Comprueba lo que sabes", title: (name, n) => `${name}: ${n} parte${n === 1 ? "" : "s"} de lectura`, many: (n) => `Tus documentos en ${n} parte${n === 1 ? "" : "s"} de lectura`, nothing: (focus) => `El material no trata «${focus}».`, figure: "Figura", difficulty: { foundation: "fundamentos", core: "ideas clave", advanced: "avanzado" } }
};
const LANGUAGE_CODES = { english: "en", spanish: "es", español: "es", castellano: "es" };
export const splitStringsFor = (language) => STRINGS[LANGUAGE_CODES[String(language || "").trim().toLowerCase()] || "en"];

/**
 * A passage → blocks, its words unchanged: paragraphs, lists (one bullet per item), tables (one bullet
 * per row, cells joined with " · "), formula and code blocks as paragraphs, pictures as a note.
 */
export function passageBlocks(body, strings = STRINGS.en) {
  const blocks = [];
  for (const unit of bodyUnits(body)) {
    const lines = unit.split("\n");
    const figure = /^!\[([^\]]*)\]\([^)]*\)\s*$/.exec(unit.trim());
    if (figure) { blocks.push({ type: "callout", text: `${strings.figure}: ${figure[1] || "image"}`, callout_type: "note" }); continue; }
    if (lines.every((line) => /^\s*\|.*\|\s*$/.test(line))) {
      const rows = lines.filter((line) => !/^[\s|:-]+$/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).filter(Boolean).join(" · ")).filter(Boolean);
      if (rows.length) blocks.push({ type: "bullet_list", title: null, items: rows });
      continue;
    }
    if (lines.every((line) => isListLine(line) || /^\s{2,}\S/.test(line))) {
      const items = [];
      for (const line of lines) {
        if (isListLine(line)) items.push(line.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "").trim());
        else if (items.length) items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`;
      }
      if (items.length) blocks.push({ type: "bullet_list", title: null, items });
      continue;
    }
    const fenced = isFence(lines[0]) || isMathFence(lines[0]);
    blocks.push({ type: "paragraph", text: fenced ? unit.trim() : lines.map((line) => line.trim()).join(" ") });
  }
  return blocks;
}

/**
 * Parts → the registry's blocks: a header for the whole set, then for each part its section header
 * ("Part N: title", reading time, document and pages), "Why read this", the passages copied exactly
 * (sub-headings as headings) and "Check yourself". `light` (by part index) holds what the model wrote.
 */
export function partsToBlocks(parts = [], { light = new Map(), strings = STRINGS.en, title = "" } = {}) {
  const documents = [...new Set(parts.map((part) => part.documentName))];
  const out = [{ type: "document_header", title: title || (documents.length === 1 ? strings.title(documents[0], parts.length) : strings.many(parts.length)) }];
  for (const [position, part] of parts.entries()) {
    const extra = light.get(part.index) || {};
    const where = [strings.min(part.minutes), documents.length > 1 ? part.documentName : "", part.pageFrom ? strings.pages(part.pageFrom, part.pageTo || part.pageFrom) : "", extra.difficulty ? strings.difficulty[extra.difficulty] || "" : ""].filter(Boolean).join(" · ");
    out.push({ type: "section_header", title: `${strings.part} ${position + 1}: ${extra.title || part.title}`, intro: where });
    if (extra.why) out.push({ type: "callout", text: `${strings.why}: ${extra.why}`, callout_type: "info" });
    const top = Math.min(...part.segments.filter((segment) => segment.level > 0).map((segment) => segment.level), 6);
    for (const segment of part.segments) {
      if (segment.heading && !segment.continued) out.push({ type: "heading", text: segment.heading, level: Math.min(4, Math.max(2, segment.level - top + 2)) });
      if (segment.body && segment.body !== segment.heading) out.push(...passageBlocks(segment.body, strings));
    }
    if (Array.isArray(extra.questions) && extra.questions.length) out.push({ type: "bullet_list", title: strings.check, items: extra.questions.slice(0, 3) });
  }
  return conformBlocks(out);
}

/* ------------------------------------------------------------------ the light pass (model) */

export const LIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          title: { type: "string" },
          why: { type: "string" },
          difficulty: { type: "string", enum: ["foundation", "core", "advanced"] },
          questions: { type: "array", items: { type: "string" } }
        },
        required: ["index", "title", "why", "difficulty", "questions"]
      }
    }
  },
  required: ["parts"]
};

export function lightSystemPrompt(options = {}) {
  return `You write the short notes around reading parts of a learner's study material. The code has already cut the material into parts and copies each part's text exactly; you never rewrite that text. The user message holds the parts inside <parts> (for each: its index, the document, its headings and the opening and end of its text), then the task.

<task>
For EACH part, write:
1. title: a specific title of at most eight words naming what the part covers, because the learner picks what to read by it. Prefer the material's own heading words.
2. why: one sentence saying what the learner will understand after reading it, because a reason to read makes the reading active.
3. difficulty: "foundation" (definitions and basics the rest builds on), "core" (the main ideas) or "advanced" (hard derivations, special cases, extensions), judged from the text, because the learner may read foundations first.
4. questions: two or three short questions that this part's own text answers, because answering them checks the reading. Ask about ideas in the text shown, never about something outside it.
</task>

<rules>
1. Use only the text shown, because the learner is examined on this material and the questions must be answerable from the part.
2. Write the title, why and questions in ${options.language || "the language of the material"}; keep formulas (LaTeX), symbols and proper names as they are.
3. Return one entry per part, with the same index, because the code matches your notes to the parts by index.
</rules>

<output_format>
JSON matching the schema: { "parts": [{ "index", "title", "why", "difficulty", "questions" }] }.
</output_format>

Before answering, check that every part has an entry with its own index, that each title is specific to that part, and that every question is answered by that part's text.`;
}

const excerpt = (part) => {
  const text = part.segments.map((segment) => [segment.heading, segment.body !== segment.heading ? segment.body : ""].filter(Boolean).join("\n")).join("\n\n");
  return text.length <= LIGHT_HEAD_CHARS + LIGHT_TAIL_CHARS ? text : `${text.slice(0, LIGHT_HEAD_CHARS)}\n[…]\n${text.slice(-LIGHT_TAIL_CHARS)}`;
};

export function lightUserMessage(batch) {
  const data = batch.map((part) => ({ index: part.index, document: part.documentName, headings: [...new Set(part.segments.map((segment) => segment.heading).filter(Boolean))], minutes: part.minutes, text: excerpt(part) }));
  return `<parts>\n${JSON.stringify(data)}\n</parts>\n\nWrite the title, why, difficulty and questions for each of these ${batch.length} part${batch.length === 1 ? "" : "s"} now.`;
}

/** The model's answer → notes by part index; anything missing or malformed is left to the defaults. */
export function parseLight(parsed, batch) {
  const wanted = new Set(batch.map((part) => part.index));
  const out = new Map();
  for (const entry of Array.isArray(parsed?.parts) ? parsed.parts : []) {
    const index = Number(entry?.index);
    if (!wanted.has(index) || out.has(index)) continue;
    const clean = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
    out.set(index, {
      title: clean(entry.title, 90),
      why: clean(entry.why, 300),
      difficulty: ["foundation", "core", "advanced"].includes(entry.difficulty) ? entry.difficulty : "",
      questions: (Array.isArray(entry.questions) ? entry.questions : []).map((question) => clean(question, 240)).filter(Boolean).slice(0, 3)
    });
  }
  return out;
}

async function runPool(tasks, limit) {
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

const DIFFICULTY_ORDER = { foundation: 0, core: 1, advanced: 2 };

/**
 * The whole run: documents → parts (code) → titles and questions (model, in batches, optional) → blocks.
 * deps: { callModel({ system, user, schema, schemaName, maxTokens }) → { parsed, usage } | null, emit(event) }
 * Returns { blocks, title, parts, coverage, usage, stats }.
 */
export async function runReadingSplit({ documents = [], options = {}, deps = {} }) {
  const emit = deps.emit || (() => {});
  const callModel = deps.callModel || null;
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const strings = splitStringsFor(options.language);
  const focus = Array.isArray(options.focus) ? options.focus : [];

  let { parts, focusMissed } = buildReadingParts(documents, { minutes: options.minutes, splitBy: options.splitBy, focus });
  if (!parts.length && focus.length) {
    // Nothing in the material names the focus: say so, plainly, instead of inventing a part.
    return { blocks: conformBlocks([{ type: "document_header", title: focus.join(", ") }, { type: "callout", text: strings.nothing(focus.join(", ")), callout_type: "info" }]), title: focus.join(", "), parts: [], coverage: { parts: 0, complete: true, focusMissed }, usage, stats: { batches: 0, usedModel: false } };
  }
  if (!parts.length) throw new Error("The selected documents have no readable text to split.");
  emit({ step: "chunk", status: "end", chunkCount: parts.length });

  const light = new Map();
  const batches = [];
  for (let start = 0; start < parts.length; start += LIGHT_BATCH_PARTS) batches.push(parts.slice(start, start + LIGHT_BATCH_PARTS));
  if (callModel) {
    let done = 0;
    emit({ step: "generate", status: "progress", phase: "split", done: 0, total: batches.length, label: `Split into ${parts.length} part${parts.length === 1 ? "" : "s"}; writing titles and questions` });
    await runPool(batches.map((batch) => async () => {
      try {
        const result = await callModel({ system: lightSystemPrompt(options), user: lightUserMessage(batch), schema: LIGHT_SCHEMA, schemaName: "reading_parts_notes", maxTokens: LIGHT_MAX_TOKENS });
        if (result?.usage) {
          usage.prompt_tokens += Number(result.usage.prompt_tokens) || 0;
          usage.completion_tokens += Number(result.usage.completion_tokens) || 0;
          usage.total_tokens += Number(result.usage.total_tokens) || 0;
        }
        for (const [index, notes] of parseLight(result?.parsed, batch)) light.set(index, notes);
      } catch {
        // The parts stand without titles from the model: their headings name them.
      }
      done += 1;
      emit({ step: "generate", status: "progress", phase: "split", done, total: batches.length, label: `Wrote the notes for ${Math.min(parts.length, done * LIGHT_BATCH_PARTS)} of ${parts.length} parts` });
    }), LIGHT_CONCURRENCY);
  } else {
    emit({ step: "generate", status: "progress", phase: "split", done: 1, total: 1, label: `Split into ${parts.length} part${parts.length === 1 ? "" : "s"} (no model: titles come from the headings)` });
  }

  // Measured on the material's order, before any reordering by difficulty.
  const coverage = { ...readingCoverage(focus.length ? [] : documents, parts), focusMissed };
  if (focus.length) Object.assign(coverage, { focus, complete: coverage.emptyParts === 0 });

  // "By difficulty": foundations first, then core ideas, then advanced parts; the material's order within each.
  if (options.splitBy === "difficulty" && light.size) {
    parts = parts.map((part, position) => ({ part, position })).sort((a, b) => (DIFFICULTY_ORDER[light.get(a.part.index)?.difficulty] ?? 1) - (DIFFICULTY_ORDER[light.get(b.part.index)?.difficulty] ?? 1) || a.position - b.position).map((entry) => entry.part);
  }

  const blocks = partsToBlocks(parts, { light, strings });
  return { blocks, title: blocks[0]?.title || "", parts: parts.map(({ segments, ...rest }) => ({ ...rest, headings: segments.filter((segment) => segment.heading && !segment.continued).map((segment) => segment.heading) })), coverage, usage, stats: { batches: callModel ? batches.length : 0, usedModel: Boolean(callModel) } };
}

/** Tokens a run will use: the model reads ≈ 2.3k characters per part and writes ≈ 150 tokens per part. */
export function estimateReadingSplitTokens(parts = []) {
  const n = parts.length;
  const batches = Math.ceil(n / LIGHT_BATCH_PARTS);
  return { inputTokens: batches * 450 + n * 650, outputTokens: n * 150 };
}
