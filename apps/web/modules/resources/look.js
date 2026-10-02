import { itemsToBlocks, planOutput, resolveStyle } from "../template-studio/output/outputDocument";

/** The typed blocks a saved resource is made of, or null when it has no component layout. */
export function resourceBlocks(resource) {
  const data = resource?.data || {};
  if (data.isBlockOutput && Array.isArray(data.blocks)) return data.blocks;
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return null;
  try {
    const blocks = itemsToBlocks(items);
    return Array.isArray(blocks) && blocks.length ? blocks : null;
  } catch {
    return null;
  }
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
