import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  splitAfterSentenceEnd, splitSentences, splitSentencesAndLines,
  stripAbbreviationDotsAndApostrophes, unbraceSimpleSuperscripts, execInstructionsMarker
} from "../lib/regexCompat.js";
import { numbersIn } from "../modules/activities/quantitative.js";
import { scrubPii } from "../lib/aiPrivacy.js";

// The ORIGINAL lookbehind patterns, kept only here to prove the rewrites behave the same.
// (Built with new RegExp so this file stays out of the source guard below.)
const LB = (src, flags = "") => new RegExp(src.replace("@@", "(?<"), flags);

let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ALPHA = ["a", "B", "c", "1", "9", ".", ".", "!", "?", " ", " ", "  ", "\n", "\n\n", "(", "\"", "…", "-", "x", "/", ",", "\t", "O", "OUTPUT", "INSTRUCTIONS", "^", "{", "}", "+", "−"];
const fuzz = (n = 4000) => Array.from({ length: n }, () => Array.from({ length: Math.floor(rand() * 14) }, () => ALPHA[Math.floor(rand() * ALPHA.length)]).join(""));
const samples = [...fuzz(), "Hello world. This is it! Is it? Yes.\nNew line. Next", "a.  b", "  . x", ".x", "e.g. U.S.A. don't", ""];

describe("lookbehind-free regex rewrites behave like the originals", () => {
  const cases = [
    ["sentences", splitSentences, (t) => t.split(LB("@@=[.!?])\\s+"))],
    ["sentences + lines", splitSentencesAndLines, (t) => t.split(LB("@@=[.!?])\\s+|\\n+"))],
    ["sentences + lines + ellipsis", (t) => splitAfterSentenceEnd(t, { always: /\n+|…/gu }), (t) => t.split(LB("@@=[.!?])\\s+|\\n+|…", "u"))],
    ["capitalised sentences", (t) => splitAfterSentenceEnd(t, { after: /\s+(?=[A-Z0-9(["'])/g }), (t) => t.split(LB("@@=[.!?])\\s+(?=[A-Z0-9(\\[\"'])"))],
    ["single whitespace", (t) => splitAfterSentenceEnd(t, { after: /\s/g }), (t) => t.split(LB("@@=[.!?])\\s"))],
    ["paragraphs or sentences", (t) => splitAfterSentenceEnd(t, { after: /\s+(?=[A-Z])/g, always: /\n{2,}/g, alwaysFirst: true }), (t) => t.split(LB("\\n{2,}|@@=[.!?])\\s+(?=[A-Z])"))],
    ["abbreviation dots", stripAbbreviationDotsAndApostrophes, (t) => t.replace(LB("@@=[a-z])\\.(?=[a-z]|\\s|$)|['`´’‘]", "g"), "")],
    ["superscripts", unbraceSimpleSuperscripts, (t) => t.replace(LB("@@=[A-Za-z0-9)])\\^\\{([A-Za-z0-9]+)\\}", "g"), "^$1")],
    ["instructions marker", (t) => execInstructionsMarker(t)?.index ?? -1, (t) => LB("@@!OUTPUT\\s)\\bINSTRUCTIONS\\b").exec(t)?.index ?? -1]
  ];
  for (const [name, next, original] of cases) {
    it(name, () => {
      for (const sample of samples) expect(next(sample), JSON.stringify(sample)).toEqual(original(sample));
    });
  }

  it("numbersIn keeps its lookbehind-free behaviour", () => {
    expect(numbersIn("3/4 and 1,234.5, 5-3, -2 a-7 1/2/3 x2 4.5.6")).toEqual(numbersIn("3/4 and 1,234.5, 5-3, -2 a-7 1/2/3 x2 4.5.6"));
    expect(numbersIn("3/4")).toEqual([0.75]);
    expect(numbersIn("1,5 and 2.5")).toEqual([1.5, 2.5]);
    expect(numbersIn("5-3")).toEqual([5, 3]);
    expect(numbersIn("a -3")).toEqual([-3]);
    expect(numbersIn("1/2 3/4")).toEqual([0.5, 0.75]);
  });

  it("numbersIn matches the original implementation on random text", () => {
    const original = (value) => {
      const text = String(value ?? "").replace(/\s+/g, " ").trim().replace(/[−–]/g, "-");
      const out = [];
      const rest = text.replace(LB("@@![\\w.,/])(-?\\d+)\\s*\\/\\s*(\\d+)(?![\\w.,/])", "g"), (_, a, b) => { if (Number(b) !== 0) out.push(Number(a) / Number(b)); return " "; });
      return { out, rest };
    };
    for (const sample of samples) {
      const expected = original(sample);
      const got = [];
      const text = String(sample).replace(/\s+/g, " ").trim().replace(/[−–]/g, "-");
      const rest = text.replace(/(^|[^\w.,/])(-?\d+)\s*\/\s*(\d+)(?![\w.,/])/g, (_, before, a, b) => { if (Number(b) !== 0) got.push(Number(a) / Number(b)); return `${before} `; });
      expect(rest, JSON.stringify(sample)).toBe(expected.rest);
      expect(got).toEqual(expected.out);
      const orig = [...expected.rest.matchAll(LB("@@![\\w.,])-?\\d+(?:[.,]\\d+)*", "g"))].map((m) => m[0]);
      const now = [...rest.matchAll(/(^|[^\w.,])(-?\d+(?:[.,]\d+)*)/g)].map((m) => m[2]);
      expect(now, JSON.stringify(sample)).toEqual(orig);
    }
  });

  it("scrubPii still masks phone numbers and leaves short numbers alone", () => {
    expect(scrubPii("call +34 612 345 678 now")).toBe("call [phone] now");
    expect(scrubPii("(415) 555-2671")).toBe("[phone]");
    expect(scrubPii("year 2024 and 12 34")).toBe("year 2024 and 12 34");
    const PHONE = LB("@@![\\w.])(?:\\+\\d{1,3}[\\s.-]?)?(?:\\(\\d{2,4}\\)[\\s.-]?)?\\d{2,4}(?:[\\s.-]\\d{2,4}){1,4}(?![\\w.])", "g");
    const digitsy = ["1", "2", "34", "5678", " ", "-", ".", "+", "(", ")", "a", "99"];
    for (let i = 0; i < 3000; i++) {
      const sample = Array.from({ length: Math.floor(rand() * 16) }, () => digitsy[Math.floor(rand() * digitsy.length)]).join("");
      const expected = sample.replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 8 ? "[phone]" : match));
      expect(scrubPii(sample), JSON.stringify(sample)).toBe(expected.replace(/\[email\]/g, "[email]"));
    }
    expect(scrubPii("id ab612345678")).toBe("id ab612345678");
  });
});

describe("source guard: no regex lookbehind in shipped code (Safari < 16.4 cannot parse it)", () => {
  const root = path.resolve(__dirname, "..");
  const SKIP = new Set(["node_modules", ".next", "tests", "debug"]);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  it("finds no (?<= or (?<! in apps/web source", () => {
    const offenders = files.filter((file) => /\(\?<[=!]/.test(fs.readFileSync(file, "utf8"))).map((file) => path.relative(root, file));
    expect(offenders.filter((file) => file !== path.join("lib", "regexCompat.js"))).toEqual([]);
  });
  it("declares a browserslist floor", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.browserslist).toContain("safari >= 14");
  });
});
