import { itemsToBlocks, planOutput, resolveStyle } from "../template-studio/output/outputDocument";

/** The typed blocks a saved resource is made of, or null when it has no component layout. */
export function resourceBlocks(resource) {
  const data = resource?.data || {};
  if (data.isBlockOutput && Array.isArray(data.blocks)) return data.blocks;
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return null;
  try {
    const blocks = itemsToBlocks(items);
    if (Array.isArray(blocks) && blocks.length) return blocks;
  } catch { /* fall through to the key-point reading below */ }
  return keyPointBlocks(items);
}

/**
 * Written output made of rows that are not questions or cards (the Summary writer's key points: point / detail / topic) read as
 * a document: a heading per topic, the key point in bold, its explanation under it. Null when the rows carry no readable text.
 */
export function keyPointBlocks(items) {
  const rows = (Array.isArray(items) ? items : []).filter((row) => row && typeof row === "object");
  const pick = (row, ...names) => {
    for (const name of names) {
      const key = Object.keys(row).find((candidate) => candidate.toLowerCase().replace(/[^a-z]/g, "") === name);
      if (key !== undefined && row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]).trim();
    }
    return "";
  };
  const blocks = [];
  let topic = "";
  for (const row of rows) {
    const point = pick(row, "point", "keypoint", "message", "text", "summary", "content");
    const detail = pick(row, "detail", "details", "explanation", "example", "note");
    if (!point && !detail) continue;
    const rowTopic = pick(row, "topic", "section", "group");
    if (rowTopic && rowTopic !== topic) { topic = rowTopic; blocks.push({ type: "heading", level: 2, text: rowTopic }); }
    if (point) blocks.push({ type: "paragraph", text: `**${point}**` });
    if (detail) blocks.push({ type: "paragraph", text: detail });
  }
  return blocks.length ? blocks : null;
}

/** The title of an output: what the user wrote in the header's Title box, else the AI's own title, else the name. The PDF and the interactive view share it. */
export function outputTitle(resource) {
  const styles = resource?.request?.outputStyles || {};
  const written = String(styles["block-header-exam"]?.text || styles["block-header-minimal"]?.text || "").trim();
  return written || String(resource?.data?.title || "").trim() || String(resource?.name || "").trim();
}

/**
 * How the interactive version should look so it matches the document: the colour and the format the
 * resource's template gives its questions (Format & colour). Null when the resource carries no
 * template choice, in which case the player keeps Luna's own look.
 */
export function activityLook(resource) {
  const blocks = resourceBlocks(resource);
  if (!blocks) return null;
  try {
    const plan = planOutput({ blocks, title: "", framed: !resource?.data?.isBlockOutput });
    const key = (plan?.components || []).map((component) => component.key).find((name) => /question|flashcard|fill|match|math|game/i.test(name));
    const resolved = key ? resolveStyle(key, resource?.request?.outputStyles || {}) : null;
    if (!resolved) return null;
    const format = String(resolved.block.variant || resolved.block.name || "");
    return {
      accent: { main: resolved.accent.main, tint: resolved.accent.tint },
      format,
      // "Lettered options": multiple choice shows A, B, C, D like the printed exam.
      letters: /letter/i.test(format),
      // "Ruled lines": open answers are written on ruled lines.
      ruled: /ruled/i.test(format)
    };
  } catch {
    return null;
  }
}
