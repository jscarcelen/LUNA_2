import { describe, expect, it } from "vitest";
import { oneLiner, parseAgentPrompt } from "../modules/ai-tools/tools/agent-builder/briefParser.js";

const prompt = `You are "2 page summary", an AI agent that creates structured educational content.

INSTRUCTIONS
Summarize the source material into a concise, two-page document. Include all key takeaways.
Style: Use clear, academic language suitable for study materials.
Rules:
- Limit summary to two pages.
- Include all key takeaways and main messages.
OUTPUT STRUCTURE
Return ONE JSON object: { "items": [ ... ] }
OUTPUT INSTRUCTIONS
Make a document summary, using headings, paragraphs, and whatever block you need
ALLOWED BLOCK TYPES (fill the listed fields; set any field not needed for a block to null)
- type="document_header" (Document header): title: string — A specific title for THIS document
- type="heading" (Heading): text: string — The heading text; level: number — Heading level: 1 (main section), 2 (subsection)
- type="vocabulary" (Table): word: string — The word or term; translation: string — Its translation or definition; example?: string — A short example sentence
Output only valid JSON matching the schema.`;

describe("agent brief", () => {
  it("splits the compiled prompt into the sections people think in", () => {
    const brief: any = parseAgentPrompt(prompt);
    expect(brief.plain).toBe(false);
    expect(brief.name).toBe("2 page summary");
    expect(brief.does).toMatch(/^Summarize the source material/);
    expect(brief.style).toMatch(/^Use clear, academic language/);
    expect(brief.rules).toEqual(["Limit summary to two pages.", "Include all key takeaways and main messages."]);
    expect(brief.output).toMatch(/^Make a document summary/);
    expect(brief.blocks.map((block: any) => block.id)).toEqual(["document_header", "heading", "vocabulary"]);
    const vocabulary = brief.blocks[2];
    expect(vocabulary.label).toBe("Table");
    expect(vocabulary.fields.map((field: any) => [field.name, field.optional])).toEqual([["word", false], ["translation", false], ["example", true]]);
  });

  it("also reads the prompt when its line breaks were lost", () => {
    const brief: any = parseAgentPrompt(prompt.replace(/\n/g, " "));
    expect(brief.rules.length).toBe(2);
    expect(brief.blocks.length).toBe(3);
  });

  it("gives a one-line description", () => {
    expect(oneLiner({ instructions: prompt })).toBe("Summarize the source material into a concise, two-page document.");
    expect(oneLiner({ tagline: "Turns notes into a two-page summary." , instructions: prompt })).toBe("Turns notes into a two-page summary.");
  });
});
