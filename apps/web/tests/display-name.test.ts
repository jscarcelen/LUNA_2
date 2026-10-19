import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { displayName, keepStorageSuffix, nameToSave } from "../modules/ui/displayName.js";

describe("displayName", () => {
  it("hides the .resource.json suffix", () => {
    expect(displayName("Quiz: Balance sheet.resource.json")).toBe("Quiz: Balance sheet");
    expect(displayName("Summary.RESOURCE.JSON")).toBe("Summary");
  });
  it("keeps the storage suffix on rename", () => {
    expect(keepStorageSuffix("A.resource.json", "B")).toBe("B.resource.json");
    expect(keepStorageSuffix("A.resource.json", "B.resource.json")).toBe("B.resource.json");
    expect(keepStorageSuffix("a.pdf", "b.pdf")).toBe("b.pdf");
  });
  it("leaves other names alone and survives empty input", () => {
    expect(displayName("notes.pdf")).toBe("notes.pdf");
    expect(displayName("data.json")).toBe("data.json");
    expect(displayName(undefined)).toBe("");
  });
});

describe("nameToSave: the name box may be empty while typing, it is checked on Save", () => {
  it("refuses an empty or blank name with a reason instead of putting a default back", () => {
    expect(nameToSave("")).toEqual({ ok: false, reason: "empty" });
    expect(nameToSave("   ")).toEqual({ ok: false, reason: "empty" });
    expect(nameToSave(undefined)).toEqual({ ok: false, reason: "empty" });
  });
  it("trims and collapses spaces, and keeps the storage suffix on a rename", () => {
    expect(nameToSave("  Balance   sheet quiz ")).toEqual({ ok: true, name: "Balance sheet quiz" });
    expect(nameToSave("New name", "Old.resource.json")).toEqual({ ok: true, name: "New name.resource.json" });
    expect(nameToSave("notes.pdf", "a.pdf")).toEqual({ ok: true, name: "notes.pdf" });
  });
});
