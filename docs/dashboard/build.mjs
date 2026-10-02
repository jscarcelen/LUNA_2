#!/usr/bin/env node
/**
 * Builds the LUNA dashboard as ONE self-contained HTML file and saves it as a new dated version.
 *
 *   node docs/dashboard/build.mjs              write a new version if anything changed
 *   node docs/dashboard/build.mjs --publish    ...and commit + push it
 *   node docs/dashboard/build.mjs --check      build in memory only, report prompt-extraction problems
 *   node docs/dashboard/build.mjs --date 2026-12-01   override the date in the file name
 *
 * Versions are never overwritten: docs/dashboard/versions/luna-dashboard-YYYY-MM-DD.html, and on a
 * second change the same day -2, -3… `latest.html` is a copy of the newest one. If nothing changed
 * since the newest version (same content hash) no file is written.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as manifest from "./manifest.mjs";
import { renderPage } from "./page.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const versionsDir = join(here, "versions");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : "");

/* ------------------------------------------------------------------------------- source facts */

const read = (path) => readFileSync(join(root, path), "utf8");
const warnings = [];

function readPrices() {
  const source = read("apps/web/modules/ai-tools/pipeline/agentBuilder.js");
  const match = source.match(/export const MODEL_PRICING = (\{[\s\S]*?\n\});/);
  if (!match) {
    warnings.push("MODEL_PRICING not found in agentBuilder.js — using the values in this script");
    return { "gpt-4o-mini": { input: 0.15, output: 0.6 }, "gpt-4o": { input: 2.5, output: 10 }, "gpt-4.1": { input: 2, output: 8 } };
  }
  return Function(`"use strict"; return (${match[1]});`)();
}

const prices = { ...readPrices(), ...manifest.EXTRA_PRICES };
const priceOf = (model) => prices[model] || prices["gpt-4o-mini"];
const costOf = (model, inTok, outTok) => (inTok * priceOf(model).input + outTok * priceOf(model).output) / 1e6;

/* --------------------------------------------------------------------------------- requests */

function tokensFor(request, units) {
  const t = request.tokens;
  const scale = t.scale;
  if (!scale) return { in: t.typical.in, out: t.typical.out };
  const n = units ?? scale.units;
  const inTok = scale.fixedIn + scale.inPer * n;
  let outTok = scale.outPer * n + (scale.outPerItem ? scale.outPerItem * (scale.items || 0) : 0);
  if (scale.outCap) outTok = Math.min(outTok, scale.outCap);
  return { in: Math.round(inTok), out: Math.round(outTok) };
}

function lineOf(text, re) {
  const m = re.exec(text);
  return m ? text.slice(0, m.index).split("\n").length : 0;
}

const requests = manifest.REQUESTS.map((request) => {
  const typical = tokensFor(request);
  const sourceText = read(request.file);
  const anchorLine = lineOf(sourceText, request.anchor);
  if (!anchorLine) warnings.push(`${request.id}: anchor ${request.anchor} not found in ${request.file} — the function was probably renamed`);
  const prompts = request.prompts.map((spec) => {
    const text = spec.file === request.file ? sourceText : read(spec.file);
    const match = text.match(spec.re);
    if (!match) {
      warnings.push(`${request.id} · ${spec.label}: prompt text not found in ${spec.file} — update the regex in manifest.mjs`);
      return { label: spec.label, file: spec.file, text: "", missing: true, line: 0 };
    }
    return { label: spec.label, file: spec.file, text: match[1].trim(), missing: false, line: lineOf(text, spec.re) };
  });
  return {
    ...request,
    anchor: undefined,
    prompts: prompts.map((p) => ({ ...p })),
    anchorLine,
    anchorMissing: !anchorLine,
    tokens: { basis: request.tokens.basis, scale: request.tokens.scale, in: typical.in, out: typical.out },
    costUsd: costOf(request.model, typical.in, typical.out),
    price: priceOf(request.model)
  };
});

/* -------------------------------------------------------------------------------- unit costs */

const byId = Object.fromEntries(requests.map((r) => [r.id, r]));
const u1 = byId.U1.tokens.scale;
const u1Page = costOf("gpt-4o", u1.inPer, u1.outPer);
const embedChunk = costOf("text-embedding-3-small", byId.U6.tokens.scale.inPer, 0);
const agentCost = (model, chars = 12) => {
  const s = byId.A1.tokens.scale;
  return costOf(model, s.fixedIn + s.inPer * chars, s.outPerItem * s.items);
};
const slide = byId.U2.tokens.scale;
const image = byId.U3.tokens.scale;
const concepts = byId.U7.costUsd;
const designCost = byId.T1.costUsd + byId.T2.costUsd + byId.T3.costUsd + 0.3 * byId.T4.costUsd;

const unit = {
  pdfPage: u1Page,
  embedChunk,
  chunksPerPage: 2,
  concepts,
  slideDeck20: costOf("gpt-4o", slide.fixedIn + slide.inPer * 20, slide.outPer * 20),
  image: costOf("gpt-4o", image.fixedIn, image.outPer),
  plan: byId.P1.costUsd,
  revise: byId.P2.costUsd,
  agentMini: agentCost("gpt-4o-mini"),
  agentPro: agentCost("gpt-4o"),
  agentMax: agentCost("gpt-4.1"),
  agentTokens: byId.A1.tokens.in + byId.A1.tokens.out,
  resourceConcepts: byId.P3.costUsd,
  coach: byId.F1.costUsd,
  design: designCost
};
unit.pdfUpload10 = 10 * (unit.pdfPage + unit.chunksPerPage * unit.embedChunk) + unit.concepts;
unit.docxUpload = 10 * unit.chunksPerPage * unit.embedChunk + unit.concepts;

/** Storage per document, from the measured rows. */
const storage = manifest.MEASURED.storage.map((row) => {
  const vectors = row.chunks * manifest.INFRA.vectorBytesPerChunk;
  const bytes = row.base64Chars + row.markdownChars + row.renderHtmlChars + vectors;
  return { ...row, vectors, bytes, mb: bytes / 1048576 };
});
const avgDocMb = storage.reduce((sum, row) => sum + row.mb, 0) / storage.length;
const dbGbMonth = manifest.INFRA.supabase.dbOverGb;
unit.storageDocMonth = (avgDocMb / 1024) * dbGbMonth;
unit.storageDocMb = avgDocMb;

/* ----------------------------------------------------------------------------------- the page */

const data = {
  meta: manifest.META,
  prices,
  models: manifest.MODELS,
  stages: manifest.STAGES,
  requests,
  freeSteps: manifest.FREE_STEPS,
  measured: manifest.MEASURED,
  storage,
  infra: manifest.INFRA,
  business: manifest.BUSINESS,
  lanes: manifest.LANES,
  nodes: manifest.NODES,
  edges: manifest.EDGES,
  stores: manifest.STORES,
  notes: manifest.COMPARISON_NOTES,
  process: manifest.PROCESS,
  roles: manifest.ROLES,
  perf: manifest.PERFORMANCE_METRICS,
  risks: manifest.RISKS,
  unit,
  warnings
};

const css = readFileSync(join(here, "page.css"), "utf8");
const client = readFileSync(join(here, "page.client.js"), "utf8");
const template = renderPage({ data, css, client });

/* ---------------------------------------------------------------------------------- versions */

const hash = createHash("sha256").update(template).digest("hex").slice(0, 16);
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const date = option("--date") || isoDate(new Date());

function gitShort() {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return "unknown"; }
}

function existingVersions() {
  if (!existsSync(versionsDir)) return [];
  return readdirSync(versionsDir).filter((f) => /^luna-dashboard-\d{4}-\d{2}-\d{2}(-\d+)?\.html$/.test(f)).sort((a, b) => key(a).localeCompare(key(b)));
}
function key(file) {
  const m = file.match(/(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.html$/);
  return `${m[1]}-${String(m[2] || 1).padStart(4, "0")}`;
}

for (const warning of warnings) console.warn(`⚠  ${warning}`);

if (flag("--check")) {
  if (flag("--prompts")) for (const r of requests) for (const p of r.prompts) console.log(`${r.id.padEnd(3)} ${p.label.slice(0, 34).padEnd(34)} ${String(p.text.length).padStart(6)}  ${p.text.slice(0, 70).replace(/\n/g, "⏎")}`);
  console.log(`checked ${requests.length} requests · ${requests.reduce((n, r) => n + r.prompts.length, 0)} prompt specs · ${warnings.length} warning(s)`);
  process.exit(warnings.length ? 1 : 0);
}

mkdirSync(versionsDir, { recursive: true });
const versions = existingVersions();
const newest = versions[versions.length - 1];
const hashOf = (file) => readFileSync(join(versionsDir, file), "utf8").match(/<meta name="luna-content-hash" content="([a-f0-9]+)"/)?.[1];

let written = "";
if (newest && hashOf(newest) === hash) {
  console.log(`no change since ${newest} — nothing written`);
} else {
  let name = `luna-dashboard-${date}.html`;
  for (let n = 2; existsSync(join(versionsDir, name)); n += 1) name = `luna-dashboard-${date}-${n}.html`;
  const label = name.replace(/^luna-dashboard-|\.html$/g, "");
  const html = template
    .replace("__HASH__", hash)
    .replace("__VERSION__", label)
    .replace("__BUILT__", `${date} · source ${gitShort()}`);
  writeFileSync(join(versionsDir, name), html);
  copyFileSync(join(versionsDir, name), join(here, "latest.html"));
  written = name;
  console.log(`wrote docs/dashboard/versions/${name} (${(html.length / 1024).toFixed(0)} KB) and latest.html`);
}

if (flag("--publish")) {
  const run = (cmd, argv) => execFileSync(cmd, argv, { cwd: root, stdio: "inherit" });
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "docs/dashboard"], { cwd: root, encoding: "utf8" }).trim();
  if (!dirty) {
    console.log("nothing to commit under docs/dashboard");
  } else {
    run("git", ["add", "docs/dashboard"]);
    const subject = written ? `dashboard: add ${written.replace(".html", "")}` : "dashboard: update generator";
    const messageArgs = ["commit", "-m", subject];
    if (process.env.DASHBOARD_COMMIT_TRAILER) messageArgs.push("-m", process.env.DASHBOARD_COMMIT_TRAILER);
    run("git", [...messageArgs, "--", "docs/dashboard"]);
    run("git", ["push"]);
  }
}
