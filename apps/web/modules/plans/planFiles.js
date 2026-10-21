/**
 * The files a study plan uses: the material it was made from (`materialIds`, and the documents its "read" steps point at)
 * and what Luna made for its steps (`resourceId`). Pure, shared by the plan page, the phone's Study tab and the read-only
 * plans a parent or teacher sees; tested in tests/plans/plan-files.test.js.
 */

import { tEn } from "../../lib/i18n/index.js";
import { displayName, resourceTypeId } from "../mobile/model.js";

const parse = (document) => {
  try { return JSON.parse(String(document?.content || "{}")); } catch { return null; }
};

/**
 * @param plan a parsed plan (plan.js `parsePlan`)
 * @param documents every document the plan's ids can point at (the whole workspace: material can sit in another topic)
 * @returns {{ id, document, name, kind: "material"|"made", typeId, type, steps: number }[]} material first, then what
 *   Luna made, each once, in the order the plan uses them. Ids whose document is gone are left out.
 */
export function planFiles(plan, documents = [], t = tEn) {
  if (!plan) return [];
  const byId = new Map((documents || []).map((document) => [document.id, document]));
  const steps = new Map();
  const order = [];
  const use = (id, countStep) => {
    if (!id || !byId.has(id)) return;
    if (!steps.has(id)) { steps.set(id, 0); order.push(id); }
    if (countStep) steps.set(id, steps.get(id) + 1);
  };
  for (const id of plan.materialIds || []) use(id, false);
  for (const item of plan.items || []) {
    use(item.sourceDocumentId, true);
    if (item.resourceId !== item.sourceDocumentId) use(item.resourceId, true);
  }
  const files = order.map((id) => {
    const document = byId.get(id);
    const made = document.sourceType === "generated";
    const parsed = made ? parse(document) : null;
    const typeId = resourceTypeId(document);
    return {
      id,
      document,
      name: displayName(parsed?.name || parsed?.activity?.title || document.name),
      kind: made ? "made" : "material",
      typeId,
      type: t(`mobile.type.${typeId}`),
      steps: steps.get(id)
    };
  });
  return [...files.filter((file) => file.kind === "material"), ...files.filter((file) => file.kind === "made")];
}
