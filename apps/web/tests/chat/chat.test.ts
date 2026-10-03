import { describe, expect, it } from "vitest";
import { CHAT_TOOLS, documentsInScope } from "../../modules/chat/tools.js";
import { readChatStream } from "../../modules/chat/stream.js";
import { agentFromAction, documentFromAction } from "../../modules/chat/actions.js";
import { answersFromOptions } from "../../modules/plans/execute.js";
import { CONFIRM_ABOVE_TOKENS, estimateChat } from "../../modules/chat/engine.js";
import { matrixFamilies, templateKind } from "../../modules/template-studio/matrix";

const tree = [{
  id: "w", subjects: [
    { id: "s1", name: "Accounting", folders: [{ id: "f1", name: "Unit 1" }], documents: [
      { id: "a", name: "Notes.pdf", folderIds: ["f1"], tags: [] },
      { id: "b", name: "Other.pdf", folderIds: [], tags: [] },
      { id: "g", name: "Agent", sourceType: "generated", tags: ["ai-agent"] },
      { id: "r", name: "Quiz", sourceType: "generated", tags: ["resource"] }
    ] },
    { id: "s2", name: "History", folders: [], documents: [{ id: "c", name: "War.pdf", folderIds: [], tags: [] }] }
  ]
}];
const ids = (list: { id: string }[]) => list.map((entry) => entry.id).sort();

describe("documentsInScope", () => {
  it("reads the whole workspace unless it is focused, and never reads agent definitions", () => {
    expect(ids(documentsInScope(tree, { workspaceId: "w" }, []))).toEqual(["a", "b", "c", "r"]);
  });
  it("focus narrows to a subject, then to folders, but referenced documents are always in", () => {
    expect(ids(documentsInScope(tree, { workspaceId: "w", focus: true, subjectId: "s1" }, []))).toEqual(["a", "b", "r"]);
    expect(ids(documentsInScope(tree, { workspaceId: "w", focus: true, subjectId: "s1", folderIds: ["f1"] }, []))).toEqual(["a"]);
    expect(ids(documentsInScope(tree, { workspaceId: "w", focus: true, subjectId: "s1", folderIds: ["f1"] }, ["c"]))).toEqual(["a", "c"]);
  });
});

describe("tools", () => {
  it("every tool has a name, a description and an object schema", () => {
    for (const tool of CHAT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toMatch(/^[a-z_]+$/);
      expect(tool.function.description.length).toBeGreaterThan(20);
      expect(tool.function.parameters.type).toBe("object");
    }
    expect(CHAT_TOOLS.map((tool: any) => tool.function.name)).toEqual(expect.arrayContaining(["search_material", "propose_run_agent", "propose_document", "propose_new_agent", "log_unsupported_request"]));
  });
});

describe("readChatStream", () => {
  const streamOf = (lines: string[]) => ({ body: new ReadableStream({ start(controller) { const enc = new TextEncoder(); for (const line of lines) controller.enqueue(enc.encode(line)); controller.close(); } }) });
  it("joins text pieces, tool-call fragments (split across chunks) and usage", async () => {
    const data = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
    const pieces: string[] = [];
    const result = await readChatStream(streamOf([
      data({ choices: [{ delta: { content: "Hel" } }] }),
      data({ choices: [{ delta: { content: "lo" } }] }).slice(0, 20), data({ choices: [{ delta: { content: "lo" } }] }).slice(20),
      data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "search_", arguments: "{\"query\":" } }] } }] }),
      data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "material", arguments: "\"cash\"}" } }] }, finish_reason: "tool_calls" }] }),
      data({ choices: [], usage: { total_tokens: 42 } }),
      "data: [DONE]\n\n"
    ]), (piece: string) => pieces.push(piece));
    expect(result.content).toBe("Hello");
    expect(pieces.join("")).toBe("Hello");
    expect(result.toolCalls).toEqual([{ id: "c1", name: "search_material", arguments: "{\"query\":\"cash\"}" }]);
    expect((result.usage as any)?.total_tokens).toBe(42);
    expect(result.finishReason).toBe("tool_calls");
  });
});

describe("estimateChat", () => {
  it("lets small requests through and asks for confirmation on huge ones", () => {
    expect(estimateChat({ system: "x".repeat(4000), history: [{ role: "user", content: "hi" }], hasMaterial: true }).needsConfirm).toBe(false);
    const huge = estimateChat({ system: "x", history: [{ role: "user", content: "y".repeat(CONFIRM_ABOVE_TOKENS * 5) }], hasMaterial: false });
    expect(huge.needsConfirm).toBe(true);
    expect(huge.tokens).toBeGreaterThan(CONFIRM_ABOVE_TOKENS);
  });
});

describe("answersFromOptions", () => {
  it("answers each of the agent's questions from the words of the request", () => {
    const agent = { questions: [
      { id: "q1", text: "How many questions?", type: "number" }, { id: "q2", text: "Difficulty", type: "single-select" },
      { id: "q3", text: "Question types", type: "multi-select" }, { id: "q4", text: "Language", type: "text" }, { id: "q5", text: "Unrelated", type: "text" }
    ] };
    expect(answersFromOptions(agent, { count: "12", difficulty: "Hard", types: "True/false", language: "French" })).toEqual({ q1: 12, q2: "Hard", q3: ["True/false"], q4: "French" });
  });
});

describe("actions", () => {
  it("a proposed document becomes a block-output resource", () => {
    const resource = documentFromAction({ title: "Cash flow guide", blocks: [{ type: "heading", text: "Intro", level: "1" }, { type: "paragraph", text: "Hello." }] }, { subjectName: "Accounting" });
    expect(resource.name).toBe("Cash flow guide");
    expect((resource.data as any).isBlockOutput).toBe(true);
    expect((resource.data as any).blocks[0].level).toBe(1);
  });
  it("a proposed agent becomes a saved agent whose source material is never an input", () => {
    const made = agentFromAction({ name: "Weekly recap", purpose: "Recaps my notes", instructions: "Summarise the notes in five bullets.", inputs: [{ name: "Language", type: "language" }], outputBlocks: ["heading", "bullet_list"] });
    expect(made.fileName).toBe("Weekly recap.agent.json");
    expect(JSON.parse(made.content).instructions).toContain("five bullets");
    expect(made.prompt).toContain("five bullets");
  });
});

describe("template matrix", () => {
  it("classifies templates by the components they contain", () => {
    expect(templateKind({ "block-flashcard-single": {} })).toBe("game");
    expect(templateKind({ "block-header-exam": {}, "block-exam-question": {} })).toBe("quiz");
    expect(templateKind({ "block-header-minimal": {}, "block-paragraph": {} })).toBe("document");
  });
  it("lists every component of the library once, grouped by what it is", () => {
    const families = matrixFamilies();
    expect(new Set(families.map((entry) => entry.key)).size).toBe(families.length);
    expect(new Set(families.map((entry) => entry.group))).toEqual(new Set(["Document structure", "Interactive — questions", "Games & cards"]));
  });
});
