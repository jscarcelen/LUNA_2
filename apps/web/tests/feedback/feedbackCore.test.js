import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS, KINDS, areaKeyOf, buildBrief, countByArea, sanitizeFeedback, shortId, titleOf } from "../../lib/feedbackCore.js";

const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("sanitizeFeedback", () => {
  it("keeps what is useful and bounds everything", () => {
    const { row, error } = sanitizeFeedback({ kind: "prompt", message: "  The quiz repeats questions.  ", quote: "x".repeat(5000), page: "custom-agent:abc", role: "teacher", target: { selector: "main > section", text: "Generate", tag: "button" }, screenshot: jpeg, context: { agent: { id: "abc", name: "Quiz" } } });
    expect(error).toBeUndefined();
    expect(row.kind).toBe("prompt");
    expect(row.message).toBe("The quiz repeats questions.");
    expect(row.quote).toHaveLength(1500);
    expect(row.area).toBe("custom-agent");
    expect(row.has_screenshot).toBe(true);
    expect(row.context.agent.name).toBe("Quiz");
  });

  it("refuses empty feedback and anything that is not a small image", () => {
    expect(sanitizeFeedback({ message: "hi" }).error).toBeTruthy();
    expect(sanitizeFeedback({ message: "A real comment", screenshot: "javascript:alert(1)" }).error).toBeTruthy();
    expect(sanitizeFeedback({ message: "A real comment", screenshot: `data:image/jpeg;base64,${"A".repeat(1_300_000)}` }).error).toBeTruthy();
    expect(sanitizeFeedback({ screenshot: jpeg }).row.has_screenshot).toBe(true);
    expect(sanitizeFeedback({ quote: "selected words" }).row.quote).toBe("selected words");
  });

  it("falls back to safe values for unknown kinds, roles and shapes", () => {
    const { row } = sanitizeFeedback({ kind: "<script>", message: "Something to say", role: "admin", target: "nope", context: "nope" });
    expect(row.kind).toBe("idea");
    expect(row.role).toBe("");
    expect(row.target).toBeNull();
    expect(row.context).toBeNull();
  });
});

describe("the hand-off brief", () => {
  const item = { id: "11111111-2222-3333-4444-555555555555", kind: "prompt", message: "The plan puts reviews after the exam.\nFix it.", page: "plans?open=x", area: "plans", role: "student", viewport: "390x844", signed_in: true, has_screenshot: true, location: "/platform", quote: "Review day", target: { selector: "main > section.plan", text: "Review", section: "Plan", tag: "div" }, admin_note: "Do this first", context: { run: "produced a result" } };

  it("says what, where, which files, which prompts, and what to attach", () => {
    const brief = buildBrief([item], { origin: "https://luna.example", today: new Date("2026-10-08T10:00:00Z") });
    expect(brief).toContain("1 item (2026-10-08)");
    expect(brief).toContain("[AI result] Study plans");
    expect(brief).toContain("apps/web/modules/plans/PlansPage.js");
    expect(brief).toContain("apps/web/app/api/plans/generate/route.js (P1)");
    expect(brief).toContain("> The plan puts reviews after the exam.");
    expect(brief).toContain(`feedback-${shortId(item.id)}`);
    expect(brief).toContain("Text they selected: “Review day”");
    expect(brief).toContain("My note: Do this first");
    expect(brief).toContain("https://luna.example/platform");
  });

  it("does not list prompts for feedback that is not about an AI result", () => {
    expect(buildBrief([{ ...item, kind: "ui" }])).not.toContain("- Prompts involved");
  });
});

describe("areas", () => {
  it("reads the page key and groups by it", () => {
    expect(areaKeyOf("ai-tool:quiz")).toBe("ai-tool");
    expect(areaKeyOf("plans?open=abc")).toBe("plans");
    expect(countByArea([{ area: "plans" }, { area: "plans" }, { area: "workspaces" }])[0]).toMatchObject({ key: "plans", count: 2, label: "Study plans" });
    expect(titleOf({ message: "First sentence. Second one." })).toBe("First sentence.");
    expect(KINDS.map((entry) => entry.id)).toEqual(["idea", "problem", "ui", "prompt"]);
  });

  it("only points at files that exist", () => {
    const root = resolve(__dirname, "../../../..");
    const paths = Object.values(AREAS).flatMap((area) => [...area.files, ...area.prompts.map((entry) => entry.replace(/ \(.*\)$/, ""))]);
    for (const path of paths) expect(existsSync(resolve(root, path)), path).toBe(true);
  });
});
