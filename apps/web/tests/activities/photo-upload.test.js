import { describe, expect, it } from "vitest";
import { fitWithin, isPhotoFile, jpegName, PHOTO_MAX_SIDE } from "../../modules/activities/photoUpload.js";

describe("downscaling iPhone photos before upload", () => {
  it("fits the longest side within 2000 px, keeping proportions", () => {
    expect(PHOTO_MAX_SIDE).toBe(2000);
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500, scale: 2000 / 4032 });
    expect(fitWithin(3024, 4032)).toMatchObject({ width: 1500, height: 2000 });
    expect(fitWithin(8064, 6048)).toMatchObject({ width: 2000, height: 1500 });
  });
  it("never enlarges a small image and survives nonsense", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scale: 1 });
    expect(fitWithin(0, 600)).toEqual({ width: 0, height: 0, scale: 0 });
    expect(fitWithin(10000, 1)).toMatchObject({ width: 2000, height: 1 });
  });
  it("names the JPEG after the photo, HEIC included", () => {
    expect(jpegName("IMG_0042.HEIC")).toBe("IMG_0042.jpg");
    expect(jpegName("", 1, new Date("2026-10-19T08:00:00Z"))).toBe("Notes photo 2026-10-19 2.jpg");
  });
  it("accepts photos with an empty type (iOS HEIC) and refuses other files", () => {
    expect(isPhotoFile({ type: "", name: "IMG_1.heic" })).toBe(true);
    expect(isPhotoFile({ type: "image/jpeg", name: "x" })).toBe(true);
    expect(isPhotoFile({ type: "application/pdf", name: "notes.pdf" })).toBe(false);
  });
});
