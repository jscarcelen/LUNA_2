import { describe, expect, it } from "vitest";
import { renameInResource } from "../../modules/workspace/renameCascade.js";

describe("renameInResource", () => {
  it("updates every {id, name} pair for the document", () => {
    const content = JSON.stringify({ kind: "resource", master: { originals: [{ id: "d1", name: "old.pdf" }, { id: "d2", name: "other.pdf" }] }, plan: { sources: [{ id: "d1", name: "old.pdf" }] } });
    const out = JSON.parse(renameInResource(content, { id: "d1", from: "old.pdf", to: "new.pdf" })!);
    expect(out.master.originals.map((o: any) => o.name)).toEqual(["new.pdf", "other.pdf"]);
    expect(out.plan.sources[0].name).toBe("new.pdf");
  });
  it("returns null when nothing refers to it", () => {
    expect(renameInResource(JSON.stringify({ a: 1 }), { id: "d1", from: "a", to: "b" })).toBeNull();
    expect(renameInResource("not json d1", { id: "d1", from: "a", to: "b" })).toBeNull();
  });
});
