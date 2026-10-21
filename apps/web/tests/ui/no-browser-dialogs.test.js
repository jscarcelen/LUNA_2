import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The browser's own boxes say "luna2-share-web.vercel.app says" and "OK"; LUNA uses modules/ui/dialogs.js instead.
const ROOT = path.resolve(__dirname, "../..");
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "tests"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("no browser dialogs", () => {
  it("never calls confirm / alert / prompt outside modules/ui/dialogs.js", () => {
    const found = [];
    for (const file of ["app", "components", "modules"].flatMap((dir) => walk(path.join(ROOT, dir)))) {
      if (file.endsWith(path.join("ui", "dialogs.js"))) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?<![\w.]|function )(?:window\.)?(confirm|alert|prompt)\(/g)) {
        found.push(`${path.relative(ROOT, file)}: ${match[0]}`);
      }
    }
    expect(found).toEqual([]);
  });
});
