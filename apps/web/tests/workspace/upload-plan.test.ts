import { describe, expect, it } from "vitest";
import { estimateRemaining, planUploadBatches, uploadFailureMessage, MAX_BATCH_BYTES } from "../../modules/workspace/uploadPlan.js";

const f = (name: string, size: number) => ({ name, size });

describe("planUploadBatches", () => {
  it("packs files under the limit and reports a file that can never fit", () => {
    const mb = 1024 * 1024;
    const { batches, tooLarge } = planUploadBatches([f("a", 1.5 * mb), f("b", 1.2 * mb), f("c", 1 * mb), f("huge", 9 * mb), f("d", 0.1 * mb)]);
    expect(tooLarge.map((x) => x.name)).toEqual(["huge"]);
    expect(batches.map((b) => b.map((x) => x.name))).toEqual([["a", "b"], ["c", "d"]]);
    for (const batch of batches) expect(batch.reduce((n, x) => n + x.size, 0)).toBeLessThanOrEqual(MAX_BATCH_BYTES);
  });
  it("caps files per batch", () => {
    const { batches } = planUploadBatches(Array.from({ length: 14 }, (_, i) => f(`n${i}`, 1000)));
    expect(batches.map((b) => b.length)).toEqual([8, 6]);
  });
});

describe("messages", () => {
  it("explains a 413 and non-JSON bodies", () => {
    expect(uploadFailureMessage(413, "Request Entity Too Large")).toMatch(/Reduce the file size/);
    expect(uploadFailureMessage(500, "Internal Server Error")).toMatch(/could not process/);
    expect(uploadFailureMessage(400, '{"error":"Bad name"}')).toBe("Bad name");
  });
  it("estimates time left only once there is progress", () => {
    expect(estimateRemaining({ doneBytes: 0, totalBytes: 10, elapsedMs: 5000 })).toBe("");
    expect(estimateRemaining({ doneBytes: 1e6, totalBytes: 5e6, elapsedMs: 10000 })).toBe("about 40 s");
  });
});
