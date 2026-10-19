import { describe, expect, it } from "vitest";
import { shouldAutoOpenTour, tourStorageKey } from "../lib/tourSeen.js";

describe("first-run tour memory", () => {
  it("keys the browser flag by account so a shared Mac does not mix people", () => {
    expect(tourStorageKey("a1")).toBe("luna.tour.v1.a1");
    expect(tourStorageKey("a2")).not.toBe(tourStorageKey("a1"));
    expect(tourStorageKey("")).toBe("luna.tour.v1");
  });

  it("the account flag wins over an empty browser", () => {
    expect(shouldAutoOpenTour({ accountId: "a1", serverSeen: true, localValue: null })).toBe(false);
  });

  it("opens for a new account even if another person closed it in this browser", () => {
    expect(shouldAutoOpenTour({ accountId: "a1", serverSeen: false, localValue: null })).toBe(true);
  });

  it("falls back to the per-account browser flag when the migration is missing", () => {
    expect(shouldAutoOpenTour({ accountId: "a1", serverSeen: null, localValue: "1" })).toBe(false);
    expect(shouldAutoOpenTour({ accountId: "a1", serverSeen: null, localValue: null })).toBe(true);
  });

  it("the demo keeps the per-browser behaviour", () => {
    expect(shouldAutoOpenTour({ localValue: "1" })).toBe(false);
    expect(shouldAutoOpenTour({ localValue: null })).toBe(true);
  });
});
