/**
 * Photos of notes, ready to upload from a phone. An iPhone photo is 12–48 MP and often HEIC: too big for the
 * platform's 4.5 MB request limit once base64-encoded, and a format the OCR/vision path cannot read. The browser
 * redraws it on a canvas as a JPEG whose longest side is at most 2000 px (plenty for OCR and for the vision model to
 * read handwriting), which is typically 300–900 KB. Safari decodes HEIC itself, so the JPEG works everywhere after.
 *
 * `fitWithin` and `jpegName` are pure (tested); `photoToJpeg` needs a browser.
 */

export const PHOTO_MAX_SIDE = 2000;
export const PHOTO_QUALITY = 0.82;
/** Photos per quiz: each one is uploaded and read separately. */
export const MAX_PHOTOS = 8;
/** After compression a photo above this is compressed again, smaller (base64 adds a third; the request limit is 4.5 MB). */
export const MAX_UPLOAD_BYTES = 2_500_000;

/** The size to draw an image at so its longest side is at most `maxSide`, keeping its proportions; never enlarged. */
export function fitWithin(width, height, maxSide = PHOTO_MAX_SIDE) {
  const w = Math.max(0, Math.round(Number(width) || 0));
  const h = Math.max(0, Math.round(Number(height) || 0));
  if (!w || !h) return { width: 0, height: 0, scale: 0 };
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

/** "IMG_0042.HEIC" -> "IMG_0042.jpg"; a camera capture with no name gets a dated one. */
export function jpegName(name, index = 0, now = new Date()) {
  const base = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^\p{L}\p{N} _.-]+/gu, "").trim();
  return `${base || `Notes photo ${now.toISOString().slice(0, 10)} ${index + 1}`}.jpg`;
}

/** Is this file a photo we can try to read? (iOS sometimes gives HEIC with an empty type.) */
export function isPhotoFile(file) {
  const type = String(file?.type || "").toLowerCase();
  return type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(String(file?.name || ""));
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    image.src = url;
  });
}

function draw(image, maxSide, quality) {
  const size = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, maxSide);
  if (!size.width) throw new Error("unreadable");
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("unreadable"))), "image/jpeg", quality));
}

/** A photo file -> a JPEG File (longest side ≤ 2000 px, compressed again if still large). Rejects what cannot be decoded. */
export async function photoToJpeg(file, index = 0, { maxSide = PHOTO_MAX_SIDE, quality = PHOTO_QUALITY } = {}) {
  if (!isPhotoFile(file)) throw new Error("not-image");
  const { image, release } = await loadImage(file);
  try {
    let blob = await draw(image, maxSide, quality);
    if (blob.size > MAX_UPLOAD_BYTES) blob = await draw(image, Math.round(maxSide * 0.75), 0.72);
    return new File([blob], jpegName(file.name, index), { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    release();
  }
}
