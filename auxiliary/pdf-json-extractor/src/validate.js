import path from "node:path";
import { readFile } from "node:fs/promises";
import { validateDocumentTree } from "./validateDocumentTree.js";

const outputDir = path.join(process.cwd(), "output");
const inputFile = path.join(outputDir, "document.json");

async function main() {
  const documentPayload = await readFile(inputFile, "utf8");

  const documentTree = JSON.parse(documentPayload);

  const validation = validateDocumentTree(documentTree);
  if (!validation.valid) {
    console.error(JSON.stringify({
      ok: false,
      errors: validation.errors
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages.length : 0;
  const elements = Array.isArray(documentTree?.content) ? documentTree.content.length : Number(documentTree?.statistics?.elements || 0);
  const equations = Array.isArray(documentTree?.content)
    ? documentTree.content.filter((node) => node?.type === "equation").length
    : Number(documentTree?.statistics?.equations || 0);
  const images = Array.isArray(documentTree?.content)
    ? documentTree.content.filter((node) => node?.type === "figure" || node?.type === "image").length
    : Number(documentTree?.statistics?.images || 0);

  console.log(JSON.stringify({
    ok: true,
    pages,
    elements,
    equations,
    images
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
