import { describe, expect, it } from "vitest";
import { authorizeDemoAction } from "../../lib/workspaceGuard.js";
import { demoAiAllowed, denyAnonymousAi } from "../../lib/aiAccess.js";

const DEMO = "demo-owner";
const OTHER = "acc-other";

/** The demo owns w1/s1/f1/d1; a real account owns w9/s9/f9/d9. */
const facts = {
  workspaceOwner: new Map([["w1", DEMO], ["w9", OTHER]]),
  subjects: new Map([["s1", { workspaceId: "w1" }], ["s9", { workspaceId: "w9" }]]),
  folders: new Map([["f1", { subjectId: "s1" }], ["f9", { subjectId: "s9" }]]),
  documents: new Map([["d1", { subjectId: "s1" }], ["d9", { subjectId: "s9" }]])
};
const run = (payload) => authorizeDemoAction({ payload, ownerUserId: DEMO, facts });

describe("the public demo only touches the demo owner's items", () => {
  it("lets the demo use its own ids and new names", () => {
    expect(run({ documentId: "d1" }).ok).toBe(true);
    expect(run({ workspaceId: "w1", subjectId: "s1", parentFolderId: "f1", name: "Unit 1" }).ok).toBe(true);
    expect(run({ name: "New workspace" }).ok).toBe(true);
  });
  it("refuses a real account's workspace, topic, folder or document", () => {
    for (const payload of [
      { workspaceId: "w9" },
      { subjectId: "s9" },
      { folderId: "f9" },
      { targetFolderId: "f9", documentId: "d1" },
      { documentId: "d9" },
      { documentIds: ["d1", "d9"] }
    ]) {
      const verdict = run(payload);
      expect(verdict.ok, JSON.stringify(payload)).toBe(false);
      expect(verdict.status).toBe(404);
    }
  });
  it("leaves ids that point at nothing to the repository (they change no row)", () => {
    expect(run({ documentId: "missing" }).ok).toBe(true);
  });
});

describe("AI routes need an account in production", () => {
  const anonymous = { headers: new Headers() };
  it("refuses an anonymous request in production unless the demo AI is switched on", async () => {
    const response = await denyAnonymousAi(anonymous, { env: { NODE_ENV: "production" } });
    expect(response.status).toBe(401);
    expect(await denyAnonymousAi(anonymous, { env: { NODE_ENV: "production", LUNA_DEMO_AI: "on" } })).toBe(null);
  });
  it("stays open in local development", () => {
    expect(demoAiAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(demoAiAllowed({ NODE_ENV: "production" })).toBe(false);
  });
});
