import { tEn } from "../../lib/i18n/index.js";

/**
import { tEn } from "../../lib/i18n/index.js";
 * Taking the file that was uploaded, in the format it was uploaded in (a Word file stays Word, a PDF stays a PDF).
 * `onDownloadDocument` is the host's download action; it answers { fileName, contentBase64, mimeType }.
 */

/** Saves what the server returns for a download. Returns false when there is nothing to save. */
export function saveFile(file, fallbackName) {
  if (!file?.contentBase64) return false;
  const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName || fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * A download-by-id function for a reader that shows something made from several uploads (a master document):
 * it finds the uploaded document among `documents` and downloads it. Returns "" on success, else a message.
 */
export function originalDownloader(documents = [], onDownloadDocument, t = tEn) {
  if (typeof onDownloadDocument !== "function") return undefined;
  return async (id) => {
    const document = documents.find((entry) => entry.id === id);
    if (!document) return t("courses.dl.gone");
    try {
      const file = await onDownloadDocument(document);
      return saveFile(file, document.name) ? "" : t("courses.wb.nothingFile");
    } catch (error) {
      return String(error?.message || error);
    }
  };
}

/** The uploaded documents a master (merged) document was made from: [{ id, name }], empty for anything else. */
export function masterOriginals(resource, t = tEn) {
  const list = resource && typeof resource.master === "object" && resource.master && Array.isArray(resource.master.originals)
    ? resource.master.originals
    : Array.isArray(resource?.data?.originals) ? resource.data.originals : [];
  return list.filter((entry) => entry && entry.id).map((entry) => ({ id: String(entry.id), name: String(entry.name || t("courses.rv.original")) }));
}
