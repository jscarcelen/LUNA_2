/**
 * Pure helpers for "Send practice to…" (Home) and "Send 10 questions to {name}" (a student's weak topic).
 * The sending itself is the existing assign flow (ShareDialog, mode "assign"); this only finds what can be sent and
 * builds the request that makes a short question set for one topic.
 */
import { classifyDeliverable } from "./shared.js";

const text = (value) => String(value || "").trim();

/** The teacher's own activities and study plans that can be assigned, newest-looking first (activities, then plans). */
export function assignableDocuments(workspaces = []) {
  const out = [];
  for (const workspace of workspaces) {
    for (const subject of workspace.subjects || []) {
      for (const document of subject.documents || []) {
        if (document.shared) continue;
        const verdict = classifyDeliverable(document, "assign");
        if (!verdict.ok) continue;
        out.push({ id: document.id, name: document.name.replace(/\.(resource|plan)\.json$/i, ""), kind: verdict.itemType, subject: subject.name, document });
      }
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "activity" ? -1 : 1));
}

/** Up to `limit` of the teacher's uploaded documents to ground the questions on: the ones that mention the topic first. */
export function groundingDocumentIds(workspaces = [], topic = "", limit = 3) {
  const needle = text(topic).toLowerCase();
  const uploaded = workspaces.flatMap((workspace) => (workspace.subjects || []).flatMap((subject) => subject.documents || [])).filter((document) => document.sourceType !== "generated" && !document.shared);
  const matches = needle ? uploaded.filter((document) => `${document.name} ${(document.tags || []).join(" ")}`.toLowerCase().includes(needle)) : [];
  return [...matches, ...uploaded.filter((document) => !matches.includes(document))].slice(0, limit).map((document) => document.id);
}

/** The agent-builder config for `count` multiple-choice questions on one topic. */
export function questionSetConfig({ topic = "", why = "", count = 10, workspaceId = "", subjectId = "", documentIds = [] } = {}) {
  const focus = text(topic) || "the student's weak areas";
  return {
    name: "Targeted practice",
    instructions: `Generate ${count} practice questions focusing on: ${focus}. Error context: ${text(why)}. Make questions clear and specific. Always provide the correct answer and a brief explanation.`,
    knowledgeText: text(topic) ? `Focus topic: ${text(topic)}` : "",
    questionAnswers: [
      { question: "How many questions?", answer: String(count) },
      { question: "Difficulty", answer: "Mixed" },
      { question: "Question types", answer: "Multiple choice" }
    ],
    outputExample: "",
    model: "gpt-4o",
    creativity: "low",
    template: {
      fields: [
        { name: "question", label: "Question", type: "string", repeatScope: "per-output" },
        { name: "options", label: "Options", type: "array", repeatScope: "per-output" },
        { name: "answer", label: "Answer", type: "string", repeatScope: "per-output" },
        { name: "explanation", label: "Explanation", type: "string", repeatScope: "per-output" }
      ]
    },
    scope: { workspaceId, subjectId, documentIds, styleDocumentIds: [] }
  };
}

/** The label of the weak-topic button, by who is looking. */
export function practiseButtonLabel(viewer, action = {}, studentName = "") {
  if (viewer === "teacher") return `Send ${action.questions || 10} questions to ${text(studentName) || "the student"}`;
  if (viewer === "parent") return "How to help";
  return `Practise ${action.questions} questions`;
}
