/** Cited passages → the references shown under an answer, each with the words and a link to that part of the document. */
export function sourcesFromPassages(passages = []) {
  return passages.map((passage) => ({
    n: passage.n,
    documentId: passage.documentId,
    documentName: passage.documentName,
    heading: passage.heading || "",
    page: passage.page ?? null,
    chunkIndex: passage.chunkIndex,
    extract: passage.extract || "",
    url: passage.documentId ? `/source?d=${encodeURIComponent(passage.documentId)}&c=${passage.chunkIndex}&q=${encodeURIComponent(String(passage.extract || "").slice(0, 200))}` : ""
  }));
}
