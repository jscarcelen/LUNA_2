/**
 * The learner's working on a question: typed notes, a photo of what they wrote on paper, and a tick
 * that says "this is my full answer". The photo is shrunk in the browser (a phone photo is several
 * megabytes; a model reads 900 px of handwriting perfectly well) and is sent to the grader only. It is not
 * kept in the saved attempt, which carries the notes and the fact that there was a photo.
 */

export const MAX_SIDE = 900;
export const NOTES_LIMIT = 1500;

/** What a question's working box holds, cleaned. Null when it is empty. */
export function cleanWork(work) {
  if (!work || typeof work !== "object") return null;
  const text = String(work.text ?? "").trim().slice(0, NOTES_LIMIT);
  const image = typeof work.image === "string" && work.image.startsWith("data:image/") ? work.image : "";
  if (!text && !image) return null;
  return { text, image, full: work.full === true };
}

/** What the saved attempt keeps of the working: the notes, whether there was a photo, whether it was the full answer. */
export function workSummary(work) {
  const clean = cleanWork(work);
  return clean ? { text: clean.text, hasImage: Boolean(clean.image), full: clean.full } : undefined;
}

/** A photo file → a downscaled JPEG data URL (browser only). Rejects what is not an image. */
export function fileToWorkImage(file, maxSide = MAX_SIDE, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) { reject(new Error("Choose a photo or an image file.")); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image could not be read.")); };
    image.src = url;
  });
}
