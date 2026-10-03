import { newItem, parsePlan } from "../plans/plan";
import { parseNode, subjectNode } from "../workspace/ui/folderModel";

/** A node of the workspace tree (subject or folder) → where a document is saved. */
export function filingTargetFor(node, fallbackSubjectId = "") {
  const target = parseNode(node || subjectNode(fallbackSubjectId));
  return { subjectId: target.subjectId || fallbackSubjectId, folderIds: target.folderId ? [target.folderId] : [] };
}

/** Study plans anywhere in a workspace, ready to be offered in a "add it to a plan" list. */
export function planChoicesOf(workspace) {
  return (workspace?.subjects || []).flatMap((subject) => (subject.documents || []).map((document) => ({ document, plan: parsePlan(document), subjectId: subject.id })).filter((row) => row.plan).map((row) => ({ id: row.document.id, name: row.plan.name, subjectId: row.subjectId, document: row.document, plan: row.plan })));
}

/**
 * Saves a resource the way the "Save resource…" dialog asks: filed in the chosen node of the
 * workspace, optionally as an activity (with a due date) and/or as a step in a study plan.
 */
export async function saveResourceFlow({ resource, form, fallbackSubjectId, planChoices = [], onSaveGeneratedQuizDocument, onUpdateGeneratedDocument }) {
  const name = form.name || resource.name;
  const payload = { ...resource, name, activity: resource.activity ? { ...resource.activity, title: name } : null };
  const isActivity = Boolean(payload.activity?.questions?.length && form.addActivity);
  const tags = ["resource", ...(isActivity ? ["activity"] : []), ...(isActivity && form.dueDate ? [`due:${form.dueDate}`] : []), ...(form.favourite ? ["favourite"] : []), ...(form.difficulty ? [`difficulty:${form.difficulty}`] : []), ...(form.tags || [])];
  const where = filingTargetFor(form.folderId, fallbackSubjectId);
  const content = JSON.stringify(payload, null, 2);
  const saved = await onSaveGeneratedQuizDocument({ folderIds: where.folderIds, tags, file: { name: `${name}.resource.json`, content, preview: `${payload.meta?.questionCount || 0} questions`, sizeBytes: content.length } }, where.subjectId);
  let addedTo = "";
  const chosen = form.planId ? planChoices.find((choice) => choice.id === form.planId) : null;
  if (chosen && saved?.id && typeof onUpdateGeneratedDocument === "function") {
    const step = { ...newItem({ resourceId: saved.id, title: name, kind: payload.activity?.questions?.length ? "activity" : "read", dueDate: form.dueDate || "", minutes: 30 }), note: "Added from a generated result." };
    const next = { ...chosen.plan, items: [...(chosen.plan.items || []), step], updatedAt: new Date().toISOString() };
    const planContent = JSON.stringify(next, null, 2);
    await onUpdateGeneratedDocument(chosen.document.id, { file: { name: chosen.document.name, content: planContent, preview: chosen.document.preview, sizeBytes: planContent.length } }, chosen.subjectId);
    addedTo = chosen.name;
  }
  return { saved, name, isActivity, addedTo, subjectId: where.subjectId };
}
