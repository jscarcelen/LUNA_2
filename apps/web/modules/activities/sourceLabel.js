/**
 * What the answer feedback says about where a question came from (pure, tested in tests/activities/source-label.test.js).
 *
 * - A quote from the notes: show it (the grounding badge says whether it was found word for word).
 * - A maths / quantitative question: it is a problem BUILT on a section of the notes, so there is no sentence to quote:
 *   "Maths problem based on this section of the notes: {section}", with a link to that section when it is known.
 * - Anything else without a quote: the section it came from ("From this section of the notes: {section}"), else the
 *   document. Never "no quote".
 */
import { isQuantitative } from "./quantitative.js";
import { sourceHref } from "../ai-tools/pipeline/sourceLinks.js";

/** Grounding reasons that only say a quote is missing: they are replaced by the section label, never shown. */
const NO_QUOTE_REASON = /no supporting quote|supporting quote was not found|cites no passage/i;

/** The section a question comes from: the heading of its passage, else its locator's first part, else its group or topic. */
export function sectionOf(question = {}) {
  const source = question?.source || {};
  const fromLocator = String(source.locator || "").split(" · ")[0];
  const looksLikePlace = /^(page|passage|página|pasaje)\s+\d+$/i.test(fromLocator.trim());
  return String(source.heading || (!looksLikePlace ? fromLocator : "") || question?.group || question?.topic || "").trim();
}

/**
 * @returns {{ kind: "quote" | "maths" | "section" | "document" | "none", section: string, documentName: string,
 *   extract: string, href: string, reasons: string[], showBadge: boolean }}
 */
export function feedbackSource(question = {}, result = null) {
  const source = question?.source || {};
  const section = sectionOf(question);
  const documentName = String(source.documentName || "").trim();
  const quantitative = typeof result?.quantitative === "boolean" ? result.quantitative : isQuantitative({ prompt: question?.prompt, expected: typeof question?.answer === "string" ? question.answer : "", skill: question?.skill, kind: question?.kind });
  const level = source.grounding?.level || "";
  const reasons = (source.grounding?.reasons || []).filter((reason) => !NO_QUOTE_REASON.test(String(reason)));
  const quote = String(source.extract || "").trim();
  const href = source.documentId ? sourceHref({ documentId: source.documentId, page: source.page || 0, section: section && section === String(source.heading || "").trim() ? section.split(" › ").pop() : "", chunk: source.chunkIndex || 0, quote: !quantitative || level === "verified" ? quote : "" }) : "";
  // A maths problem is built on the notes, not quoted from them: a verified quote may still be shown under the label.
  if (quantitative) return { kind: "maths", section, documentName, extract: level === "verified" ? quote : "", href, reasons, showBadge: false };
  if (quote) return { kind: "quote", section, documentName, extract: quote, href, reasons, showBadge: Boolean(level) };
  if (section) return { kind: "section", section, documentName, extract: "", href, reasons, showBadge: false };
  if (documentName) return { kind: "document", section: "", documentName, extract: "", href, reasons, showBadge: false };
  return { kind: "none", section: "", documentName: "", extract: "", href: "", reasons: [], showBadge: false };
}

/** The sentence for a label (`t` is the i18n function); "" for a quote (the quote is shown instead) or nothing known. */
export function feedbackSourceLabel(info, t) {
  if (!info) return "";
  if (info.kind === "maths") return info.section ? t("practice.src.maths", { section: info.section }) : t("practice.src.mathsNoSection");
  if (info.kind === "section") return t("practice.src.section", { section: info.section });
  if (info.kind === "document") return t("practice.src.document", { name: info.documentName });
  return "";
}
