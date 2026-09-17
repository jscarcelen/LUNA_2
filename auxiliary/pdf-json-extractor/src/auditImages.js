import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, writeJson } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const rawFile = path.join(outputDir, "raw-pages.json");
const reportFile = path.join(outputDir, "image-report.json");

async function main() {
  await ensureDir(outputDir);
  const raw = JSON.parse(await readFile(rawFile, "utf8"));

  const images = [];
  for (const page of raw?.pages || []) {
    for (const image of page.images || []) {
      images.push({
        page: page.pageNumber,
        imageId: image.id,
        operatorId: image.operatorId,
        operatorIndex: image.operatorIndex,
        objectId: image.objectId,
        geometry: image.geometry,
        transform: image.transform,
        clippingPath: image.clippingPath,
        scaling: image.scaling,
        rotation: image.rotation,
        bytesExtractable: image?.source?.bytesExtractable ?? false,
        reason: image?.source?.reason || "unknown",
        suggestedNextStep: image?.source?.suggestedNextStep || "none"
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    imageCount: images.length,
    bytesExtractableCount: images.filter((image) => image.bytesExtractable).length,
    images
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify({ reportFile, imageCount: images.length, bytesExtractableCount: report.bytesExtractableCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
