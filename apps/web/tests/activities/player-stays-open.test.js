/**
 * Regression for "when I'm checking the answers, it leaves the answer section and closes".
 * Root cause: a host of the quiz player closed it from its `onSubmit` handler (Progress → practice called
 * `setPractising(null)` right after the attempt was saved), so the results unmounted the moment they appeared.
 * Rule: `onSubmit` records the attempt; only the learner closes the player (Leave / Done → `onClose`).
 * This scans every place that hands `onSubmit` to the player or to the reader that hosts it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** The `{ … }` expression after `onSubmit=` in a JSX attribute, brace-matched. */
function submitHandlers(source) {
  const out = [];
  let at = source.indexOf("onSubmit={");
  while (at >= 0) {
    let depth = 0;
    let end = at + "onSubmit=".length;
    for (; end < source.length; end += 1) {
      if (source[end] === "{") depth += 1;
      else if (source[end] === "}") { depth -= 1; if (depth === 0) break; }
    }
    out.push(source.slice(at, end + 1));
    at = source.indexOf("onSubmit={", end);
  }
  return out;
}

describe("the quiz player stays open on its results", () => {
  const hosts = [...files(join(ROOT, "modules")), ...files(join(ROOT, "components"))]
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => /<(ActivityPlayer|ReaderView|InteractiveView|FlashcardDeck)\b/.test(source));

  it("finds the hosts", () => {
    expect(hosts.length).toBeGreaterThan(3);
  });

  it("no onSubmit handler closes the player", () => {
    const offenders = [];
    for (const { path, source } of hosts) {
      for (const handler of submitHandlers(source)) {
        if (/set(Playing|Practising|Reading|ReaderOpen|Open)\((null|false|"")\)|onClose\??\.?\(/.test(handler)) offenders.push(`${path.slice(ROOT.length)}: ${handler.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
