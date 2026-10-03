import { beforeAll, describe, expect, it } from "vitest";
import { cleanDocumentHtml, focusSections, htmlToMarkdown, markdownToBlocks, notesDocumentFor, saveDocumentNotes, htmlOfDocument } from "../modules/reader/documentView.js";
import { markdownToHtml } from "../modules/reader/markdown.js";
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

describe("money is not a formula", () => {
  it("leaves prices alone and still renders real maths", () => {
    const html = markdownToHtml("It pays $40,000 cash and later $5,000 by year-end. Also $x^2 + 1$ holds.");
    expect(html).toContain("$40,000 cash and later $5,000");
    expect(html).toContain("katex");
  });
});

describe("a study step shows its part of a long document", () => {
  const page = "<div>" + ["Introduction", "Income Statement", "Balance Sheet", "Cash Flow"].map((heading, index) => `<h2>${heading}</h2><p>${heading === "Income Statement" ? "Revenue and expenses make up the income statement. The income statement shows profit." : `Text about ${heading.toLowerCase()} number ${index}.`} ${"filler ".repeat(40)}</p>`).join("") + "</div>";
  beforeAll(async () => {
    const { parseHTML } = await import("linkedom");
    Object.assign(globalThis, { document: parseHTML("<!doctype html><html><body></body></html>").document });
  });
  it("hides the other sections but keeps them in the page", () => {
    const result = focusSections(page, { title: "Study Income Statement Concepts", concepts: ["Revenue", "Expenses"] });
    expect(result.focused).toBe(true);
    expect(result.label).toContain("Income Statement");
    expect(result.html).toContain("Balance Sheet");
    expect((result.html.match(/data-luna-hidden/g) || []).length).toBe(6);
  });
  it("leaves the document whole when nothing stands out", () => {
    expect(focusSections(page, { title: "Something unrelated entirely", concepts: [] }).focused).toBe(false);
  });
  it("turns an edited page back into Markdown, formulas and tables included", () => {
    const root = document.createElement("div");
    root.innerHTML = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> with <span class="math-inline" data-latex="x^2">x2</span>.</p><ul><li>one</li><li>two</li></ul><div class="md-table"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div>';
    const markdown = htmlToMarkdown(root);
    expect(markdown).toContain("## Title");
    expect(markdown).toContain("Some **bold** and *italic* with $x^2$.");
    expect(markdown).toContain("- one\n- two");
    expect(markdown).toContain("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });
});
