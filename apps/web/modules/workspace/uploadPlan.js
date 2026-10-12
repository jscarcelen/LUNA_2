/**
 * Uploading many files without hitting the server's request-size limit.
 *
 * The browser sends files as base64 inside a JSON request, and the host refuses requests above about 4.5 MB
 * (it answers with plain text, not JSON — which used to surface as "Unexpected token R"). So files are sent
 * in batches whose raw size stays under MAX_BATCH_BYTES (base64 adds about a third). A single file larger than
 * that cannot be sent: it is reported, with advice, instead of failing the whole folder.
 */

export const MAX_BATCH_BYTES = 3 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 8;

const sizeOf = (file) => Number(file?.size ?? file?.sizeBytes ?? 0);

/** @returns {{ batches: File[][], tooLarge: File[] }} files in their given order, packed into batches */
export function planUploadBatches(files = [], { maxBytes = MAX_BATCH_BYTES, maxFiles = MAX_FILES_PER_BATCH } = {}) {
  const batches = [];
  const tooLarge = [];
  let batch = [];
  let bytes = 0;
  for (const file of files) {
    const size = sizeOf(file);
    if (size > maxBytes) { tooLarge.push(file); continue; }
    if (batch.length && (bytes + size > maxBytes || batch.length >= maxFiles)) { batches.push(batch); batch = []; bytes = 0; }
    batch.push(file);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return { batches, tooLarge };
}

export const formatBytes = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Time left, from the bytes done so far: "about 40 s", "about 2 min". "" until there is enough to go on. */
export function estimateRemaining({ doneBytes = 0, totalBytes = 0, elapsedMs = 0 } = {}) {
  if (doneBytes <= 0 || elapsedMs < 1500 || totalBytes <= doneBytes) return "";
  const seconds = Math.ceil(((totalBytes - doneBytes) / doneBytes) * (elapsedMs / 1000));
  if (seconds < 5) return "a few seconds";
  if (seconds < 90) return `about ${Math.round(seconds / 5) * 5} s`;
  return `about ${Math.round(seconds / 60)} min`;
}

/** A readable reason for a failed upload request: the host's plain-text 413 and other non-JSON answers included. */
export function uploadFailureMessage(status, body = "") {
  if (status === 413) return "Too large to send in one go. Reduce the file size or upload fewer files at a time.";
  if (status === 504 || status === 408) return "The server took too long to process this file. Try it on its own.";
  const text = String(body || "").trim();
  if (text.startsWith("{")) {
    try { const parsed = JSON.parse(text); if (parsed?.error) return String(parsed.error); } catch { /* fall through */ }
  }
  return status >= 500 ? "The server could not process this file. Try it again, or on its own." : `The upload was refused (${status || "no answer"}).`;
}

export const tooLargeMessage = (file) => `${file.name} is ${formatBytes(sizeOf(file))}, over the ${formatBytes(MAX_BATCH_BYTES)} limit for one file. Reduce its size (compress or split it) and upload it again.`;
