import { buildOutputDocument, planOutput } from "../template-studio/output/outputDocument";
import { resolveOutputLanguage } from "../template-studio/output/labels";
import { resourceBlocks } from "./look";

const textOf = (blocks = []) => blocks.map((block) => Object.values(block || {}).filter((value) => typeof value === "string").join(" ")).join("\n").slice(0, 4000);

/**
 * The laid-out document of a resource (every page size × view), the same one Format & colour and the
 * Export step build, so a PDF downloaded from the reader is the PDF of the template. Null when the
 * resource has no component layout.
 */
export function outputDocumentFor(resource, styles = null) {
  const blocks = resourceBlocks(resource);
  if (!blocks) return null;
  try {
    const language = resolveOutputLanguage([], {}, textOf(blocks));
    const plan = planOutput({
      blocks,
      title: String(resource.data?.title || "").trim() || resource.name || "",
      subtitle: String(resource.data?.subtitle || ""),
      framed: !resource.data?.isBlockOutput,
      subject: resource.meta?.subjectName || "",
      agentName: resource.meta?.agentName || "",
      passages: Array.isArray(resource.data?.sources) ? resource.data.sources : [],
      linkBase: typeof window !== "undefined" ? window.location.origin : "",
      language
    });
    return plan ? buildOutputDocument(plan, styles || resource.request?.outputStyles || {}, { language }) : null;
  } catch (error) {
    console.error("[outputDocumentFor]", error);
    return null;
  }
}
