/**
 * Reading an agent's compiled prompt as people would: a one-line summary, and the rest laid out
 * as the sections it is made of (what it does, style, rules, what it returns, the blocks it may
 * write) instead of one wall of text.
 */

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const sentenceCase = (value) => { const text = clean(value).replace(/^[-•\s]+/, ""); return text ? text.charAt(0).toUpperCase() + text.slice(1) : ""; };
const endWithStop = (value) => { const text = sentenceCase(value); return text && !/[.!?:)]$/.test(text) ? `${text}.` : text; };

/** First sentence, capped, for the one-line description. */
export function firstSentence(text, max = 170) {
  const flat = clean(text);
  const match = flat.match(/^(.+?[.!?])(\s|$)/);
  const sentence = (match ? match[1] : flat);
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

const MARKERS = [
  ["instructions", /(?<!OUTPUT\s)\bINSTRUCTIONS\b/],
  ["style", /\bStyle:/],
  ["rules", /\bRules:/],
  ["structure", /\bOUTPUT STRUCTURE\b/],
  ["output", /\bOUTPUT INSTRUCTIONS\b/],
  ["blocks", /\bALLOWED BLOCK TYPES\b/]
];

export function parseAgentPrompt(prompt) {
  const text = String(prompt || "");
  const found = MARKERS.map(([key, pattern]) => ({ key, match: pattern.exec(text) })).filter((entry) => entry.match).sort((a, b) => a.match.index - b.match.index);
  if (!found.length) return { plain: true, paragraphs: text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/).map(clean).filter(Boolean) };
  const sections = {};
  found.forEach((entry, index) => {
    const start = entry.match.index + entry.match[0].length;
    const end = index + 1 < found.length ? found[index + 1].match.index : text.length;
    sections[entry.key] = text.slice(start, end);
  });
  const intro = text.slice(0, found[0].match.index);
  const rules = (sections.rules || "").split(/(?:^|\s)-\s+/).map(endWithStop).filter(Boolean);
  // The block list: `- type="heading" (Heading): text: string — The heading text; level: number — …`
  const rawBlocks = (sections.blocks || "").split(/-\s+type="/).slice(1);
  const blocks = rawBlocks.map((chunk) => {
    const match = chunk.match(/^([a-z_]+)"\s*(?:\(([^)]*)\))?\s*:?\s*([\s\S]*)$/);
    if (!match) return null;
    const tail = match[3].replace(/\s*Output only valid JSON[\s\S]*$/, "");
    const fields = tail.split(/;\s*/).map((part) => {
      const field = part.match(/^\s*([a-zA-Z_]+)(\?)?:\s*([^—]*?)(?:\s+—\s+([\s\S]*))?$/);
      return field ? { name: field[1], optional: Boolean(field[2]), type: clean(field[3]), note: endWithStop(field[4] || "") } : null;
    }).filter(Boolean);
    return { id: match[1], label: clean(match[2]) || match[1], fields };
  }).filter(Boolean);
  const closing = clean((sections.blocks || "").match(/Output only valid JSON[\s\S]*$/)?.[0] || "");
  return {
    plain: false,
    name: (intro.match(/"([^"]+)"/) || [])[1] || "",
    does: clean(sections.instructions),
    style: clean(sections.style),
    rules,
    structure: clean(sections.structure),
    output: clean(sections.output),
    blocks,
    closing
  };
}

/** What the agent does, in one line: its own tagline, else the first sentence of its instructions. */
export function oneLiner(config = {}) {
  const own = clean(config.tagline) || clean(config.description);
  if (own) return firstSentence(own);
  const parsed = parseAgentPrompt(config.instructions);
  return firstSentence(parsed.plain ? parsed.paragraphs?.[0] || "" : parsed.does || parsed.output || "");
}
