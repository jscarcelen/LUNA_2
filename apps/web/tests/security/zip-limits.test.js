import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { zipDirectoryStats, zipWithinLimits } from "../../lib/zipLimits.js";

const zipOf = async (files) => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
};

describe("uploaded archives are checked before they are unpacked", () => {
  it("reads what a normal document declares", async () => {
    const buffer = await zipOf({ "word/document.xml": "<w:document/>", "[Content_Types].xml": "<Types/>" });
    expect(zipDirectoryStats(buffer)).toEqual({ entries: 3, expandedBytes: 13 + 8 }) // the "word/" folder is an entry too;
    expect(zipWithinLimits(buffer)).toBe(true);
  });
  it("refuses an archive that expands far beyond the limit", async () => {
    const buffer = await zipOf({ "word/document.xml": "a".repeat(2 * 1024 * 1024) });
    expect(buffer.length).toBeLessThan(50 * 1024);
    expect(zipWithinLimits(buffer, { maxBytes: 1024 * 1024 })).toBe(false);
  });
  it("lets anything that is not a zip through, and refuses a broken zip", () => {
    expect(zipWithinLimits(Buffer.from("%PDF-1.7 ..."))).toBe(true);
    expect(zipWithinLimits(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toBe(false);
  });
});
