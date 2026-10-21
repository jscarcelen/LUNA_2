import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { creditsOf, monthWindow, monthlyCreditsFor, providerOf, storageLimitBytes, summariseAiUsage, summariseStorage, tokensFromBody } from "../../lib/usageCore.js";
import { runMetered, setAiActivity } from "../../lib/aiUsage.js";

describe("usage rules", () => {
  it("reads the token count of plain and streamed provider answers", () => {
    expect(tokensFromBody(JSON.stringify({ usage: { prompt_tokens: 900, completion_tokens: 100, total_tokens: 1000 } }))).toBe(1000);
    // OpenAI stream: the last usage object is the total
    expect(tokensFromBody('data: {"choices":[]}\n\ndata: {"usage":{"total_tokens":2500}}\n\ndata: [DONE]')).toBe(2500);
    // Anthropic stream: input at the start, output at the end
    expect(tokensFromBody('event: message_start\ndata: {"message":{"usage":{"input_tokens":1200,"output_tokens":1}}}\n\nevent: message_delta\ndata: {"usage":{"output_tokens":300}}')).toBe(1500);
    expect(tokensFromBody("not json")).toBe(0);
  });

  it("knows which hosts are model providers", () => {
    expect(providerOf("https://api.openai.com/v1/chat/completions")).toBe("model");
    expect(providerOf("https://api.anthropic.com/v1/messages")).toBe("model");
    expect(providerOf("https://api.mathpix.com/v3/text", { MATH_OCR_ENDPOINT: "https://api.mathpix.com/v3/text" })).toBe("ocr");
    expect(providerOf("https://api.resend.com/emails")).toBe("");
    expect(providerOf("/api/chat")).toBe("");
  });

  it("gives a monthly allowance per role, overridable by env", () => {
    expect(monthlyCreditsFor("student", {})).toBe(1000);
    expect(monthlyCreditsFor("parent", {})).toBe(1000);
    expect(monthlyCreditsFor("teacher", {})).toBe(3000);
    expect(monthlyCreditsFor("student", { LUNA_AI_MONTHLY_CREDITS: "500" })).toBe(500);
    expect(monthlyCreditsFor("teacher", { LUNA_AI_MONTHLY_CREDITS: "500" })).toBe(3000);
    expect(monthlyCreditsFor("teacher", { LUNA_AI_MONTHLY_CREDITS_TEACHER: "8000" })).toBe(8000);
    expect(storageLimitBytes({})).toBe(100 * 1024 * 1024);
    expect(storageLimitBytes({ LUNA_STORAGE_LIMIT_MB: "250" })).toBe(250 * 1024 * 1024);
  });

  it("starts the month again on the 1st (UTC)", () => {
    expect(monthWindow(new Date("2026-10-21T16:00:00Z"))).toEqual({ start: "2026-10-01T00:00:00.000Z", resetsAt: "2026-11-01T00:00:00.000Z" });
    expect(monthWindow(new Date("2026-12-31T23:59:00Z")).resetsAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("sums the month by activity, biggest first", () => {
    const ai = summariseAiUsage([
      { activity: "askLuna", tokens: 2000 }, { activity: "creating", tokens: 15000 }, { activity: "askLuna", tokens: 1500 }, { activity: "weird", tokens: 10 }
    ], { limitCredits: 20, resetsAt: "2026-11-01T00:00:00.000Z" });
    expect(ai.usedCredits).toBe(creditsOf(18510));
    expect(ai.leftCredits).toBe(1);
    expect(ai.percentUsed).toBe(95);
    expect(ai.byActivity.map((entry) => entry.activity)).toEqual(["creating", "askLuna", "other"]);
    expect(ai.byActivity[1]).toEqual({ activity: "askLuna", credits: 4, uses: 2 });
    expect(summariseAiUsage([{ activity: "creating", tokens: 50000 }], { limitCredits: 20, resetsAt: "" }).leftCredits).toBe(0);
  });

  it("sums storage by kind and lists the biggest files", () => {
    const storage = summariseStorage([
      { document_id: "a", name: "Deck.pdf", source_type: "uploaded", subject_name: "Economics", document_bytes: 5_000_000, index_bytes: 300_000, export_bytes: 0 },
      { document_id: "b", name: "Quiz", source_type: "generated", subject_name: "Biology", document_bytes: 20_000, index_bytes: 0, export_bytes: 40_000 }
    ], { limitBytes: 10_000_000 });
    expect(storage.usedBytes).toBe(5_360_000);
    expect(storage.percentUsed).toBe(54);
    expect(storage.byKind.map((entry) => entry.kind)).toEqual(["uploaded", "index", "downloads", "generated"]);
    expect(storage.biggest[0]).toMatchObject({ id: "a", bytes: 5_300_000 });
  });
});

describe("AI meter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts provider calls made inside a metered request, and nothing else", async () => {
    vi.stubGlobal("fetch", async (url) => new Response(String(url).includes("openai") ? JSON.stringify({ usage: { total_tokens: 1234 } }) : "{}", { status: 200 }));
    const outcome = await runMetered("askLuna", async () => {
      const answer = await (await fetch("https://api.openai.com/v1/chat/completions", { method: "POST" })).json();
      await fetch("https://api.resend.com/emails");
      setAiActivity("coach");
      return answer.usage.total_tokens; // the caller still reads the whole answer
    });
    expect(outcome).toEqual({ result: 1234, tokens: 1234, calls: 1, activity: "coach" });
    // Outside a metered request nothing is counted (and nothing breaks).
    expect(await (await fetch("https://api.openai.com/v1/x")).json()).toEqual({ usage: { total_tokens: 1234 } });
  });

  it("every route that uses the AI is metered", () => {
    const api = path.resolve(__dirname, "../../app/api");
    const unmetered = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "route.js") {
          const source = fs.readFileSync(full, "utf8");
          if (source.includes("denyAnonymousAi(") && !source.includes("meteredAi(")) unmetered.push(path.relative(api, full));
        }
      }
    };
    walk(api);
    expect(unmetered).toEqual([]);
  });
});
