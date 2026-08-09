import path from "node:path";
import { readFile } from "node:fs/promises";
import { resolveProjectPath } from "./utils.js";

const outputFile = resolveProjectPath("output", "statistics.json");

function collectFailures(documentTree) {
  const failures = [];

  function walk(node, parent = null) {
    if (!node || typeof node !== "object") return;

    if (["heading", "paragraph", "list_item", "table", "table_cell", "image", "inline_math", "display_math"].includes(node.type) && !node.provenance) {
      failures.push(`Missing provenance for ${node.type}`);
    }

    if (node.type === "paragraph") {
      const children = Array.isArray(node.children) ? node.children : [];
      if (!children.length) {
        failures.push("Empty paragraph node found");
      }
    }

    if (node.type === "heading" && parent?.type === "section" && parent.heading) {
      failures.push(`Duplicate section heading metadata at ${node.provenance?.nodePath || "unknown"}`);
    }

    if (node.type === "text") {
      const text = String(node.text || "");
      if (/S_\(x\)\^\(2\)|S x 2|\(1\)\/\(n-1\)/.test(text)) {
        failures.push(`Math flattened into text at ${node.provenance?.nodePath || "unknown"}`);
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((item) => walk(item, node));
      else if (value && typeof value === "object") walk(value, node);
    }
  }

  const contentRoots = [
    ...(Array.isArray(documentTree?.body?.children) ? documentTree.body.children : []),
    ...(Array.isArray(documentTree?.headers) ? documentTree.headers : []),
    ...(Array.isArray(documentTree?.footers) ? documentTree.footers : [])
  ];
  contentRoots.forEach((node) => walk(node, null));
  return failures;
}

async function main() {
  const raw = await readFile(outputFile, "utf8");
  const documentTree = JSON.parse(raw);
  const failures = collectFailures(documentTree);
  const result = {
    ok: failures.length === 0,
    failures,
    unsupportedElements: documentTree?.diagnostics?.unsupportedElements?.length || 0,
    warnings: documentTree?.diagnostics?.warnings?.length || 0
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});