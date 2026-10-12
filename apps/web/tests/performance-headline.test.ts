import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { onTrackStatus } from "../modules/performance/headline.js";

const now = new Date("2026-10-12T10:00:00");
describe("onTrackStatus", () => {
  it("says so when there is no plan", () => {
    expect(onTrackStatus(null, now).tone).toBe("none");
    expect(onTrackStatus({ total: 0 }, now).label).toBe("No plan yet");
  });
  it("is on track with nothing late, behind with late steps or a passed date", () => {
    expect(onTrackStatus({ name: "Bio", done: 3, total: 10, late: 0, deadline: "2026-10-20" }, now)).toMatchObject({ label: "On track", tone: "good" });
    expect(onTrackStatus({ name: "Bio", done: 3, total: 10, late: 1, deadline: "2026-10-20" }, now)).toMatchObject({ label: "Behind", tone: "warn" });
    expect(onTrackStatus({ name: "Bio", done: 3, total: 10, late: 4, deadline: "2026-10-20" }, now).tone).toBe("bad");
    expect(onTrackStatus({ name: "Bio", done: 3, total: 10, late: 0, deadline: "2026-10-01" }, now)).toMatchObject({ label: "Behind", tone: "bad" });
    expect(onTrackStatus({ done: 5, total: 5, late: 0 }, now).label).toBe("On track");
  });
});
