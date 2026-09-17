import path from "node:path";
import { ensureDir, writeJson } from "./utils.js";
import { buildMockSourceAgnosticFixtures } from "./mockSourceFixtures.js";

async function main() {
  const outDir = path.join(process.cwd(), "output", "mock-fixtures");
  await ensureDir(outDir);

  const fixtures = buildMockSourceAgnosticFixtures();
  for (const fixture of fixtures) {
    const name = String(fixture?.metadata?.filename || "fixture.json");
    await writeJson(path.join(outDir, name), fixture);
  }

  console.log(JSON.stringify({ outDir, fixtures: fixtures.map((fixture) => fixture.metadata.filename) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
