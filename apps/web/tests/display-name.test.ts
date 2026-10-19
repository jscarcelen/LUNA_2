import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { displayName, keepStorageSuffix } from "../modules/ui/displayName.js";

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
