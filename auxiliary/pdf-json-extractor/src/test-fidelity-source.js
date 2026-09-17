import path from "node:path";
import { rasterizePdf } from "./fidelityRasterizer.js";

async function main() {
  const baseDir = process.cwd();
  const pdfPath = path.resolve(baseDir, "../../Statistics.pdf");
  const outDir = path.join(baseDir, "output", "fidelity", "source-stage");

  const started = Date.now();
  console.log("[FIDELITY] test-source START");
  const result = await rasterizePdf(pdfPath, outDir, { dpi: 150, expectedPageCount: 4 });
  console.log("[FIDELITY] test-source SUCCESS", JSON.stringify({
    renderer: result.renderer,
    pageCount: result.pageCount,
    elapsedMs: Date.now() - started
  }));
}

main().catch((error) => {
  console.error("[FIDELITY] test-source ERROR", error);
  process.exitCode = 1;
});
