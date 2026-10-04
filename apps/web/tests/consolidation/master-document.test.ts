import { describe, expect, it } from "vitest";
import { blocksToMarkdown, formatSourceNames, formatSourceTag, isMasterDocument, masterDocumentMarkdown, masterInfo, MASTER_TAG } from "../../modules/ai-tools/pipeline/masterDocument.js";
import { runConsolidation } from "../../modules/ai-tools/pipeline/consolidator.js";
import { chunkDocuments } from "../../modules/ai-tools/pipeline/chunking.js";
import { collectScopedDocuments } from "../../modules/ai-tools/pipeline/agentBuilder.js";
import { buildResource } from "../../modules/resources/resource.js";

const run: any = runConsolidation;
const collect: any = collectScopedDocuments;
const md: any = masterDocumentMarkdown;
const toMarkdown: any = blocksToMarkdown;
const resourceOf: any = buildResource;

const refs = [
  { sid: "S1", tag: "D1", documentName: "Biology notes.docx", heading: "Osmosis", page: null },
  { sid: "S5", tag: "D2", documentName: "Lab manual.pdf", heading: "Methods", page: 3 }
];

describe("source tags", () => {
  it("groups places by document in the short tag", () => {
    expect(formatSourceTag(refs)).toBe("D1 §Osmosis · D2 p.3");
    expect(formatSourceTag([{ tag: "D1", page: 2 }, { tag: "D1", page: 4 }, { tag: "D1", page: 2 }])).toBe("D1 p.2, p.4");
  });
  it("spells out the original documents in the long form", () => {
    expect(formatSourceNames(refs)).toBe("Biology notes.docx, Osmosis; Lab manual.pdf, p. 3");
  });
});

describe("master document as Markdown", () => {
  const blocks: any[] = [
    { type: "document_header", title: "Cell transport" },
    { type: "section_header", title: "Osmosis", intro: null },
    { type: "paragraph", text: "Water moves across the membrane. [D1 §Osmosis · D2 p.3]", _tags: [" [D1 §Osmosis · D2 p.3]"], _refs: [refs] },
    { type: "bullet_list", title: "Key points", items: ["One [D1 §Osmosis]", "Two [D2 p.3]"], _tags: [" [D1 §Osmosis]", " [D2 p.3]"], _refs: [[refs[0]], [refs[1]]] },
    { type: "vocabulary", word: "Distilled", translation: "+12 % [D2 p.3]", example: null, _tags: [" [D2 p.3]"], _refs: [[refs[1]]] },
    { type: "vocabulary", word: "Salt", translation: "-8 %", example: "0.5 M", _refs: [] },
    { type: "callout", text: "Figure: graph of mass against salt.", callout_type: "note", _tags: [""], _refs: [[]] }
  ];
  const markdown = toMarkdown(blocks);

  it("expands each short tag into the original document's name, so a cited passage still says where it came from", () => {
    expect(markdown).toContain("Water moves across the membrane. *(Source: Biology notes.docx, Osmosis; Lab manual.pdf, p. 3)*");
    expect(markdown).toContain("- One *(Source: Biology notes.docx, Osmosis)*");
    expect(markdown).not.toMatch(/\[D1/);
  });

  it("keeps headings, tables and figure descriptions readable by retrieval", () => {
    expect(markdown).toContain("# Cell transport");
    expect(markdown).toContain("## Osmosis");
    expect(markdown).toContain("| Term | Meaning | Detail |");
    expect(markdown).toContain("| Distilled | +12 % *(Source: Lab manual.pdf, p. 3)* |");
    expect(markdown).toContain("> **Note:** Figure: graph of mass against salt.");
  });

  it("is what a stored master document reads as", () => {
    const resource = resourceOf({ name: "Biology — master document", data: { items: [], isBlockOutput: true, blocks, originals: [{ tag: "D1", name: "Biology notes.docx" }] } });
    const document = { id: "m", sourceType: "generated", tags: ["resource", MASTER_TAG], content: JSON.stringify(resource) };
    expect(isMasterDocument(document)).toBe(true);
    expect(md(document)).toBe(markdown);
    expect(masterInfo(resource)?.originals?.[0]?.name).toBe("Biology notes.docx");
    expect(md({ tags: ["resource"], content: "not json" })).toBe("");
  });
});

describe("a master document as the source of later material", () => {
  const biology = { id: "bio", name: "Biology notes.docx", content: "# Osmosis\n\nOsmosis is the passive movement of water across a semipermeable membrane." };
  const lab = { id: "lab", name: "Lab manual.pdf", content: "<!-- page 3 -->\n# Methods\n\nWeigh the potato slice before and after the salt bath." };

  it("passages cut from it name the original documents, even though it is a generated resource", async () => {
    const result = await run({ documents: [biology, lab], options: {}, deps: {} });
    const resource = resourceOf({ name: "Plan — master document", data: { items: [], isBlockOutput: true, blocks: result.blocks, originals: result.originals } });
    const master = { id: "master", name: "Plan — master document.resource.json", sourceType: "generated", reviewStatus: "approved", tags: ["resource", MASTER_TAG], content: md({ tags: ["resource", MASTER_TAG], content: JSON.stringify(resource) }) };
    const chunks = chunkDocuments([{ ...master, documentId: master.id }], {});
    const text = chunks.map((chunk: any) => chunk.content).join("\n");
    expect(text).toContain("Biology notes.docx");
    expect(text).toContain("Lab manual.pdf");
    expect(text).toContain("potato slice");
  });

  it("is read as material only when picked explicitly (never swept into a subject-wide read)", () => {
    const master: any = { id: "master", name: "Master", sourceType: "generated", reviewStatus: "approved", tags: [MASTER_TAG], content: "# Master\n\ntext" };
    const quiz: any = { id: "quiz", name: "Quiz", sourceType: "generated", reviewStatus: "approved", tags: ["resource"], content: "{}" };
    const upload: any = { id: "up", name: "Notes", sourceType: "uploaded", reviewStatus: "approved", tags: [], content: "text" };
    const workspaces = [{ id: "w", subjects: [{ id: "s", documents: [master, quiz, upload] }] }];
    expect(collect(workspaces, { workspaceId: "w", documentIds: ["master"] }).map((document: any) => document.id)).toEqual(["master"]);
    expect(collect(workspaces, { workspaceId: "w", documentIds: ["quiz"] })).toEqual([]);
    expect(collect(workspaces, { workspaceId: "w" }).map((document: any) => document.id)).toEqual(["up"]);
    expect(collect(workspaces, { workspaceId: "w", documentIds: ["up", "master"] }).map((document: any) => document.id).sort()).toEqual(["master", "up"]);
  });

  it("documents from different subjects can be picked together (the consolidator ignores the subject filter)", () => {
    const workspaces = [{ id: "w", subjects: [{ id: "s1", documents: [{ id: "a", name: "A", sourceType: "uploaded", reviewStatus: "approved", tags: [], content: "x" }] }, { id: "s2", documents: [{ id: "b", name: "B", sourceType: "uploaded", reviewStatus: "approved", tags: [], content: "y" }] }] }];
    expect(collect(workspaces, { workspaceId: "w", documentIds: ["a", "b"] }).map((document: any) => document.id)).toEqual(["a", "b"]);
  });
});
