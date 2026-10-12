import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { friendlyMessage } from "../components/friendlyError.js";

describe("friendlyMessage", () => {
  it("keeps a readable server message", () => {
    expect(friendlyMessage("That name is already taken.", 409)).toBe("That name is already taken.");
  });
  it("hides technical detail", () => {
    expect(friendlyMessage('relation "documents" does not exist', 500)).toMatch(/our side/);
    expect(friendlyMessage("Unexpected token R in JSON at position 0", 200)).toMatch(/our side/);
    expect(friendlyMessage("TypeError: x is not a function", 0)).toMatch(/our side/);
  });
  it("explains the common statuses and a dropped connection", () => {
    expect(friendlyMessage("", 403)).toMatch(/permission/);
    expect(friendlyMessage("Failed to fetch", 0)).toMatch(/can't be reached/);
    expect(friendlyMessage("", 429)).toMatch(/Too many/);
  });
});
