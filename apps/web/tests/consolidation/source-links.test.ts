import { describe, expect, it } from "vitest";
import { linkSourceBlock, linkSourceBlocks, linkSourceTag, originalLinks, parseSourceHref, parseSourceTag, sourceHref } from "../../modules/ai-tools/pipeline/sourceLinks.js";
import { notesToBlocks, runConsolidation } from "../../modules/ai-tools/pipeline/consolidator.js";
import { blocksToReaderHtml } from "../../modules/reader/documentHtml.js";
import { renderInline, markdownToHtml } from "../../modules/reader/markdown.js";
import { pickPassage } from "../../modules/reader/sourceTarget.js";

const refs = [
  { tag: "D1", documentId: "doc-1", documentName: "Statistics.pdf", page: 3, heading: "", chunkIndex: 2 },
  { tag: "D1", documentId: "doc-1", documentName: "Statistics.pdf", page: 5, heading: "", chunkIndex: 3 },
  { tag: "D2", documentId: "doc-2", documentName: "Apuntes.docx", page: null, heading: "Osmosis › Water", chunkIndex: 4 }
];

describe("source tags", () => {
  it("parses a tag into documents and places", () => {
    expect(parseSourceTag(" [D1 p.3, p.5 · D2 §Osmosis]")).toEqual([
      { tag: "D1", places: [{ page: 3, text: "p.3" }, { page: 5, text: "p.5" }] },
      { tag: "D2", places: [{ section: "Osmosis", text: "§Osmosis" }] }
    ]);
    expect(parseSourceTag("[D3]")).toEqual([{ tag: "D3", places: [] }]);
    expect(parseSourceTag("not a tag")).toEqual([]);
    expect(parseSourceTag("")).toEqual([]);
  });

  it("builds /source URLs with the page, the section or the passage", () => {
    expect(sourceHref({ documentId: "doc-1", page: 3, chunk: 2 }, "https://luna.test")).toBe("https://luna.test/source?d=doc-1&p=3&c=2");
    expect(sourceHref({ documentId: "doc 1", section: "Osmosis (water)" })).toBe("/source?d=doc%201&s=Osmosis%20%28water%29");
    expect(sourceHref({ page: 3 })).toBe("");
    expect(parseSourceHref(sourceHref({ documentId: "a", page: 7, section: "x y", chunk: 4, quote: "hello" }))).toEqual({ documentId: "a", page: 7, section: "x y", chunk: 4, quote: "hello" });
    expect(parseSourceHref("https://x.test/other?d=a")).toBeNull();
  });

  it("links every part of a tag to its document and place", () => {
    const linked = linkSourceTag(" [D1 p.3, p.5 · D2 §Osmosis]", refs, "https://luna.test");
    expect(linked).toBe(" [[D1 p.3](https://luna.test/source?d=doc-1&p=3&c=2), [p.5](https://luna.test/source?d=doc-1&p=5&c=3) · [D2 §Osmosis](https://luna.test/source?d=doc-2&s=Osmosis%20%E2%80%BA%20Water&c=4)]");
  });

  it("leaves a part whose document is unknown as plain text", () => {
    expect(linkSourceTag(" [D9 p.1]", refs)).toBe(" [D9 p.1]");
    expect(linkSourceTag(" [D1 p.3 · D9 p.1]", refs)).toBe(" [[D1 p.3](/source?d=doc-1&p=3&c=2) · D9 p.1]");
  });

  it("links the tag of a paragraph, a bullet and a table row, and the key at the top", () => {
    const blocks = [
      { type: "paragraph", text: "Osmosis is passive. [D1 p.3]", _tags: [" [D1 p.3]"], _refs: [[refs[0]]] },
      { type: "bullet_list", title: "x", items: ["One [D1 p.5]", "Two [D2 §Osmosis]"], _tags: [" [D1 p.5]", " [D2 §Osmosis]"], _refs: [[refs[1]], [refs[2]]] },
      { type: "vocabulary", word: "Osmosis", translation: "Water moves [D1 p.3]", _tags: [" [D1 p.3]"], _refs: [[refs[0]]] },
      { type: "bullet_list", title: "Key", items: ["D1 — Statistics.pdf (3 passages)"], _docs: [{ tag: "D1", id: "doc-1", name: "Statistics.pdf" }] },
      { type: "heading", text: "H", level: 2 }
    ];
    const out: any[] = linkSourceBlocks(blocks, "");
    expect(out[0].text).toBe("Osmosis is passive. [[D1 p.3](/source?d=doc-1&p=3&c=2)]");
    expect(out[1].items[0]).toBe("One [[D1 p.5](/source?d=doc-1&p=5&c=3)]");
    expect(out[1].items[1]).toContain("(/source?d=doc-2&s=");
    expect(out[2].translation).toBe("Water moves [[D1 p.3](/source?d=doc-1&p=3&c=2)]");
    expect(out[3].items[0]).toBe("D1 — [Statistics.pdf](/source?d=doc-1) (3 passages)");
    expect(out[4]).toBe(blocks[4]);
    // the input is not modified
    expect((blocks[0] as any).text).toBe("Osmosis is passive. [D1 p.3]");
    expect(linkSourceBlock({ type: "paragraph", text: "No tag." }, "")).toEqual({ type: "paragraph", text: "No tag." });
  });

  it("works on what the consolidator really writes", async () => {
    const documents = [{ id: "d-a", name: "A.md", content: "<!-- page 4 -->\n# Osmosis\n\nWater moves across a membrane by osmosis in cells." }];
    const callModel = async (request: any) => {
      const input = JSON.parse(request.user);
      return { parsed: { topics: [{ title: "Osmosis", blocks: [{ type: "paragraph", text: "Water moves.", level: null, callout_type: null, bullets: null, term: null, meaning: null, detail: null, sources: [input.passages[0].sourceId] }] }] }, usage: null };
    };
    const result: any = await (runConsolidation as any)({ documents, options: {}, deps: { callModel } });
    const linked: any[] = linkSourceBlocks(result.blocks, "https://luna.test");
    const paragraph = linked.find((block) => block.type === "paragraph");
    expect(paragraph.text).toMatch(/\[\[D1 p\.4\]\(https:\/\/luna\.test\/source\?d=d-a&p=4&c=1\)\]$/);
    const key = linked.find((block) => block.type === "bullet_list");
    expect(key.items[0]).toContain("[A.md](https://luna.test/source?d=d-a)");
    expect(result.blocks.find((block: any) => block.type === "bullet_list")._docs[0]).toEqual({ tag: "D1", id: "d-a", name: "A.md" });
  });

  it("finds the originals a master document's passage names, for quizzes and summaries made from it", () => {
    const content = "Osmosis is passive. *(Source: Biology notes.docx, p. 3; Lab manual › Osmosis)* Other text.";
    const originals = [{ id: "bio", name: "Biology notes.docx" }, { id: "lab", name: "Lab manual" }];
    expect(originalLinks(content, "Osmosis is passive.", originals, "https://luna.test")).toBe("[Biology notes.docx, p. 3](https://luna.test/source?d=bio&p=3), [Lab manual](https://luna.test/source?d=lab)");
    expect(originalLinks("No source here.", "No source", originals)).toBe("");
  });
});

describe("source links in the reader", () => {
  it("renders the tags as links that the app can take over", () => {
    const html = blocksToReaderHtml([{ type: "paragraph", text: "Water moves. [D1 p.3]", _tags: [" [D1 p.3]"], _refs: [[refs[0]]] }]);
    expect(html).toContain('<a href="/source?d=doc-1&amp;p=3&amp;c=2" target="_blank" rel="noreferrer" data-luna-source>D1 p.3</a>');
    expect(html).toContain("[<a");
    expect(html).toContain("</a>]</p>");
  });

  it("an escaped dollar is a price, not a formula", () => {
    expect(renderInline("Costs \\$40,000 and \\$5,000 or $x^2$.")).toContain("$40,000 and $5,000");
    expect(renderInline("Costs \\$40,000 and \\$5,000 or $x^2$.")).toContain("katex");
  });

  it("marks page breaks so the reader can scroll to a page", () => {
    expect(markdownToHtml("<!-- page 4 -->\n\nText")).toContain('id="page-4"');
  });
});

describe("which passage /source opens", () => {
  const chunks = [
    { page: 1, pageEnd: 2, headingPath: ["Intro"] },
    { page: 3, pageEnd: 5, headingPath: ["Osmosis", "Water"] },
    { page: 6, pageEnd: 6, headingPath: ["Diffusion"] },
    { headingPath: [], section: "Appendix" }
  ];
  it("prefers the page, then the section, then the passage number, then the first", () => {
    expect(pickPassage(chunks, { page: 4 })).toBe(1);
    expect(pickPassage(chunks, { page: 6, chunk: 1 })).toBe(2);
    expect(pickPassage(chunks, { section: "Osmosis › Water" })).toBe(1);
    expect(pickPassage(chunks, { section: "diffusion", chunk: 1 })).toBe(2);
    expect(pickPassage(chunks, { chunk: 3 })).toBe(2);
    expect(pickPassage(chunks, {})).toBe(0);
    expect(pickPassage(chunks, { page: 99 })).toBe(2);
    expect(pickPassage(chunks, { page: 99, section: "Appendix" })).toBe(2);
    expect(pickPassage([], { page: 1 })).toBe(-1);
  });
});

void notesToBlocks;
