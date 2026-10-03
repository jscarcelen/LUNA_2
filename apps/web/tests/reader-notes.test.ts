import { beforeAll, describe, expect, it } from "vitest";
import { cleanDocumentHtml, markdownToBlocks, notesDocumentFor, saveDocumentNotes, htmlOfDocument } from "../modules/reader/documentView.js";
import { markedHtml } from "../modules/reader/highlights.js";

describe("document view", () => {
  it("strips scripts, handlers and unsafe links from a document's own HTML", () => {
    const html = cleanDocumentHtml('<html><head><style>x{}</style></head><body><h1 onclick="x()">Title</h1><script>alert(1)</script><a href="javascript:alert(1)">l</a><p>Text</p></body></html>');
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Text</p>");
    expect(html).not.toMatch(/script|onclick|javascript:/i);
  });
  it("falls back to the document's text when it has no rendering", () => {
    expect(htmlOfDocument({ content: "# Hello\n\nWorld" })).toContain("<h");
    expect(htmlOfDocument({})).toBe("");
  });
  it("turns markdown into blocks for the PDF layout", () => {
    const blocks = markdownToBlocks("# Intro\n\nSome **bold** text\nsecond line\n\n- one\n- two\n\n## Next\nEnd", "Notes");
    expect(blocks.map((block) => block.type)).toEqual(["document_header", "heading", "paragraph", "bullet_list", "heading", "paragraph"]);
    expect(blocks[2]).toMatchObject({ text: "Some bold text second line" });
    expect(blocks[3]).toMatchObject({ items: ["one", "two"] });
  });
});

describe("notes kept next to a document", () => {
  const sidecar = { id: "n1", tags: ["doc-notes"], content: JSON.stringify({ kind: "document-notes", documentId: "d1", highlights: [{ id: "h", text: "x", note: "n" }] }) };
  it("finds the notes of a document among the workspace's documents", () => {
    expect(notesDocumentFor([{ id: "z", tags: [] }, sidecar], "d1")?.highlights).toHaveLength(1);
    expect(notesDocumentFor([sidecar], "other")).toBeNull();
  });
  it("updates the notes file when there is one and creates it when there is not", async () => {
    const calls: string[] = [];
    const doc = { id: "d1", name: "Accounting.pdf", subjectId: "s1" };
    await saveDocumentNotes({ document: doc, existing: { document: sidecar }, list: [], onUpdateGeneratedDocument: async (id: string) => { calls.push(`update ${id}`); }, onSaveGeneratedQuizDocument: async () => { calls.push("create"); } });
    await saveDocumentNotes({ document: doc, existing: null, list: [], onUpdateGeneratedDocument: async () => { calls.push("update"); }, onSaveGeneratedQuizDocument: async (payload: { tags: string[] }) => { calls.push(`create ${payload.tags[0]}`); } });
    expect(calls).toEqual(["update n1", "create doc-notes"]);
  });
});

describe("markedHtml", () => {
  beforeAll(async () => {
    const { parseHTML } = await import("linkedom");
    const { document: dom } = parseHTML("<!doctype html><html><body></body></html>");
    Object.assign(globalThis, { document: dom, NodeFilter: { SHOW_TEXT: 4 } });
  });
  it("draws the highlights across elements and lists the notes", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>Cash flow is the <strong>movement of cash</strong> in a firm.</p>";
    const full = root.textContent || "";
    const text = "the movement of cash in";
    const anchor = { id: "a", color: "green", start: full.indexOf(text), text, prefix: "", note: "Key idea" };
    const html = markedHtml(root, [anchor], { notes: true });
    expect(html.match(/<mark/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("<sup>[1]</sup>");
    expect(html).toContain("Key idea");
    // The source page is untouched, and without notes there are no footnotes.
    expect(root.querySelector("mark")).toBeNull();
    expect(markedHtml(root, [anchor], { notes: false })).not.toContain("My notes");
    expect(markedHtml(root, [], { notes: false })).toBe(root.innerHTML);
  });
});
