import { describe, expect, it } from "vitest";
import { chunkDocument } from "../modules/ai-tools/pipeline/chunking.js";

const words = (topic: string, n: number) => Array.from({ length: n }, (_, i) => `${topic}${i % 9}`).join(" ");
const para = (topic: string, n = 90) => `The ${topic} section discusses ${topic}-related ideas: ${words(topic, n)}.`;

const doc = (content: string): any => ({ id: "d1", name: "Doc", content });

describe("semantic chunking", () => {
  it("tracks pages, starts a chunk's heading path where it starts, and loses no text", () => {
    const paragraphs = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map((t) => para(t, 120));
    const md = [
      "<!-- page 1 -->", "# Chapter One", "## First", paragraphs[0], paragraphs[1],
      "<!-- page 2 -->", "## Second", paragraphs[2], paragraphs[3],
      "<!-- page 3 -->", "# Chapter Two", paragraphs[4], paragraphs[5]
    ].join("\n\n");
    const chunks = chunkDocument(doc(md), { chunkWords: 700, overlapWords: 80 }) as any[];
    expect(chunks.length).toBeGreaterThan(1);
    for (const text of paragraphs) expect(chunks.some((c) => c.content.includes(text.slice(0, 60)))).toBe(true);
    expect(chunks.some((c) => c.content.includes("<!--"))).toBe(false);
    const chapterTwo = chunks.find((c) => c.content.includes("# Chapter Two"));
    expect(chapterTwo.headingPath).toEqual(["Chapter Two"]);
    expect(chapterTwo.page).toBe(3);
    expect(chunks[0].page).toBe(1);
  });

  it("does not leave a tiny subsection as a chunk of its own", () => {
    const md = ["# Book", "## Big", para("alpha", 300), "## Tiny", "One short line about tiny things.", "## Next", para("bravo", 300)].join("\n\n");
    const chunks = chunkDocument(doc(md)) as any[];
    expect(chunks.every((c) => c.tokenCount >= 100)).toBe(true);
    expect(chunks.some((c) => c.content.includes("One short line"))).toBe(true);
  });

  it("cuts a long section where the topic changes", () => {
    const first = [para("photosynthesis", 80), para("photosynthesis", 80), para("photosynthesis", 80), para("photosynthesis", 80)];
    const second = [para("mortgage", 80), para("mortgage", 80), para("mortgage", 80), para("mortgage", 80)];
    const md = ["# Mixed", ...first, ...second].join("\n\n");
    const chunks = chunkDocument(doc(md), { chunkWords: 700, overlapWords: 80 }) as any[];
    expect(chunks.length).toBeGreaterThan(1);
    const withFirst = chunks.find((c) => c.content.includes("photosynthesis0"));
    const withSecond = chunks.find((c) => c.content.includes("mortgage0"));
    expect(withFirst).not.toBe(withSecond);
    // a chunk is about one topic, apart from a little overlap at the seam
    expect((withSecond.content.match(/photosynthesis/g) || []).length).toBeLessThan((withSecond.content.match(/mortgage/g) || []).length / 3);
  });
});
