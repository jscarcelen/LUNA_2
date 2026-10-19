import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "../../lib/i18n/messages/en.js";

const ROOT = path.resolve(__dirname, "../..");
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "tests", "messages", "i18n"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("translation keys used in source", () => {
  it("every literal t(\"key\") / t.plural(\"key\") exists in the English catalogue", () => {
    const missing = [];
    for (const file of [...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "modules")), ...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))]) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["'`]([a-zA-Z][\w.-]*\.[\w.-]+)["'`]/g)) {
        if (!(match[1] in en)) missing.push(`${path.relative(ROOT, file)}: ${match[1]}`);
      }
      for (const match of source.matchAll(/\bt\.plural\(\s*["'`]([a-zA-Z][\w.-]*\.[\w.-]+)["'`]/g)) {
        if (!(`${match[1]}.other` in en)) missing.push(`${path.relative(ROOT, file)}: ${match[1]}.other`);
      }
    }
    expect(missing).toEqual([]);
  });
});
