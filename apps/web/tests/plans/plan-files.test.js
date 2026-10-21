import { describe, expect, it } from "vitest";
import { planFiles } from "../../modules/plans/planFiles.js";
import { makeT } from "../../lib/i18n/index.js";

const upload = (id, name) => ({ id, name, sourceType: "upload", tags: [] });
const made = (id, title, extra = {}) => ({
  id,
  name: `${title}.resource.json`,
  sourceType: "generated",
  tags: ["resource"],
  content: JSON.stringify({ kind: "resource", name: title, meta: { agentId: extra.agentId || "document-summarizer" }, ...(extra.activity ? { activity: extra.activity } : {}) })
});

describe("planFiles", () => {
  const documents = [
    upload("u1", "Lecture 1.pdf"),
    upload("u2", "Notes.docx"),
    made("r1", "Lecture summary"),
    made("r2", "Quiz week 1", { agentId: "quiz-generator", activity: { questions: [{ id: "q", kind: "choice", prompt: "?", options: ["a"], answer: "a" }] } })
  ];

  it("lists material first, then what Luna made, each once, with how many steps use it", () => {
    const plan = {
      materialIds: ["u1", "gone"],
      items: [
        { id: "a", resourceId: "r2" },
        { id: "b", sourceDocumentId: "u2" },
        { id: "c", resourceId: "r1", sourceDocumentId: "u1" },
        { id: "d", resourceId: "r2" }
      ]
    };
    const files = planFiles(plan, documents);
    expect(files.map((file) => [file.id, file.kind, file.steps])).toEqual([
      ["u1", "material", 1],
      ["u2", "material", 1],
      ["r2", "made", 2],
      ["r1", "made", 1]
    ]);
    expect(files.find((file) => file.id === "r2")).toMatchObject({ name: "Quiz week 1", typeId: "quiz", type: "Quiz" });
    expect(files.find((file) => file.id === "u1")).toMatchObject({ name: "Lecture 1", typeId: "pdf" });
  });

  it("is empty for no plan or a plan without files, and speaks Spanish", () => {
    expect(planFiles(null, documents)).toEqual([]);
    expect(planFiles({ items: [{ id: "x", generate: "quiz" }] }, documents)).toEqual([]);
    expect(planFiles({ materialIds: ["u2"], items: [] }, documents, makeT("es"))[0].type).toBe("Documento");
  });
});
