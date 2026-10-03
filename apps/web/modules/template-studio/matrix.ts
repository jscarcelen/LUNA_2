import { BLOCK_CATEGORY_LABELS, blockFamilies, builtInBlocks, type BlockDef } from "./engine/blocks";
import { migrateToV3, normalizeTemplate } from "./engine/migrate";
import { styleFromTemplate } from "./output/outputDocument";

export type TemplateKind = "document" | "quiz" | "game";

export const KIND_LABEL: Record<TemplateKind, { icon: string; label: string; plural: string }> = {
  document: { icon: "📄", label: "Document", plural: "Documents" },
  quiz: { icon: "📝", label: "Quiz / Exam", plural: "Quizzes" },
  game: { icon: "🃏", label: "Game / Flashcards", plural: "Games & flashcards" }
};

const QUESTION_BLOCKS = new Set(["block-exam-question", "block-open-question", "block-true-false", "block-fill-blanks", "block-match-pairs", "block-math-practice"]);
const GAME_BLOCKS = new Set(["block-flashcard-single"]);

export interface MatrixComponent { familyKey: string; family: string; group: string; blockId: string; accentId: string }
export interface MatrixFamily { key: string; family: string; group: string; groupLabel: string }

/** The components of the library, one row each (a family = one component with several formats), in library order. */
export function matrixFamilies(): MatrixFamily[] {
  return blockFamilies(builtInBlocks()).map(({ family, variants }) => {
    const first: BlockDef = variants[0];
    const group = first.category === "questions" ? "Interactive — questions" : first.category === "cards" ? "Games & cards" : first.category === "structure" ? "Document structure" : BLOCK_CATEGORY_LABELS[first.category] || "Other";
    return { key: first.id, family, group, groupLabel: group };
  });
}

/** Which format and colour a saved template gives each component it contains. */
export function templateComponents(row: unknown): Record<string, { blockId: string; accentId: string }> {
  try {
    const template = normalizeTemplate(migrateToV3(row as never));
    const keys = matrixFamilies().map((entry) => entry.key);
    const styles = styleFromTemplate(template, keys);
    const out: Record<string, { blockId: string; accentId: string }> = {};
    for (const [key, style] of Object.entries(styles)) if (style.blockId) out[key] = { blockId: style.blockId, accentId: style.accentId || "blue" };
    return out;
  } catch {
    return {};
  }
}

/** Documents, quizzes or games: decided by what the template contains. */
export function templateKind(components: Record<string, unknown>): TemplateKind {
  const keys = Object.keys(components);
  if (keys.some((key) => GAME_BLOCKS.has(key))) return "game";
  if (keys.some((key) => QUESTION_BLOCKS.has(key) || key === "block-header-exam")) return "quiz";
  return "document";
}
