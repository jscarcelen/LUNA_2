/** Browser-side rasterising of uploaded PDFs/images into locked page backgrounds. */
export interface ImportedPage { src: string; widthMm: number; heightMm: number }

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function importPages(file: File): Promise<ImportedPage[]> {
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: ImportedPage[] = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 110 / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const base = page.getViewport({ scale: 1 });
      pages.push({ src: canvas.toDataURL("image/jpeg", 0.82), widthMm: (base.width * 25.4) / 72, heightMm: (base.height * 25.4) / 72 });
    }
    return pages;
  }
  const src = await fileToDataUrl(file);
  const dims = await new Promise<{ w: number; h: number }>((resolve) => { const image = new Image(); image.onload = () => resolve({ w: image.width, h: image.height }); image.src = src; });
  return [{ src, widthMm: 210, heightMm: Math.round((210 * dims.h) / dims.w) }];
}
