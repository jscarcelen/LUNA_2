import path from "node:path";
import { pathToFileURL } from "node:url";
import { runPdfPipeline } from "./pipeline/index.js";
import { parseArgs, resolveProjectPath } from "./utils.js";

const baseDir = process.cwd();
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;
  const result = await runPdfPipeline(sourceFile, {});

  console.log(JSON.stringify({
    sourceFile,
    pages: Number(result?.documentTree?.pages?.length || 0),
    elements: Number(result?.documentTree?.statistics?.elements || 0),
    schemaOk: Boolean(result?.schema?.ok),
    invariantsOk: Boolean(result?.invariants?.ok)
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
