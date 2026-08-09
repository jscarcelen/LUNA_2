import path from "node:path";
import { readFile } from "node:fs/promises";
import { renderMathMlFromLatex, hasBoundaryPunctuation, summarizeMathAst } from "./mathCanonical.js";

const BAD_LATEX_PATTERNS = [
  /\[(UNSUPPORTED|UNKNOWN)\]/,
  /<[^>]+>/,
  /xmlns/i,
  /http:\/\/schemas/i,
  /m:/,
  /w:/
];

export const EXPECTED_EQUATIONS = {
  "EQ-0001": "\\bar{x}",
  "EQ-0002": "S_x^2",
  "EQ-0003": "S_x^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2",
  "EQ-0009": "S_x",
  "EQ-0010": "S_x = \\sqrt{S_x^2} = \\sqrt{\\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2}",
  "EQ-0015": "S_{xy}",
  "EQ-0016": "S_{xy} = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})(y_i-\\bar{y})",
  "EQ-0017": "r_{xy}",
  "EQ-0018": "r_{xy} = \\frac{S_{xy}}{S_x S_y}",
  "EQ-0019": "-1 \\le r_{xy} < 1"
};

function collectEquations(documentTree) {
  const equations = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "inline_math" || node.type === "display_math") equations.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(documentTree);
  return equations;
}

function hasBalancedBraces(latex = "") {
  const stack = [];
  for (let index = 0; index < latex.length; index += 1) {
    const character = latex[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "{") stack.push(character);
    if (character === "}") {
      if (!stack.length) return false;
      stack.pop();
    }
  }
  return stack.length === 0;
}

function validateLatexShape(latex = "") {
  if (!latex) return ["EMPTY_LATEX"];
  const failures = [];
  for (const pattern of BAD_LATEX_PATTERNS) {
    if (pattern.test(latex)) failures.push(`BAD_TOKEN:${pattern}`);
  }
  if (!hasBalancedBraces(latex)) failures.push("UNBALANCED_BRACES");
  if (/\\frac(?!\{)/.test(latex)) failures.push("MALFORMED_FRAC");
  if (/\\sqrt(?!\{|\[)/.test(latex)) failures.push("MALFORMED_SQRT");
  if (/(\^|_)(\s|$)/.test(latex)) failures.push("MALFORMED_SCRIPT");
  if (/\s{2,}/.test(latex)) failures.push("DOUBLE_SPACES");
  return failures;
}

export function auditMathCanonicalization(documentTree) {
  const equations = collectEquations(documentTree);
  const equationReports = equations.map((equation) => {
    const failures = [];
    failures.push(...validateLatexShape(equation.latex || ""));
    if (!equation.source?.xml) failures.push("MISSING_SOURCE_XML");
    if (!equation.source?.nodePath) failures.push("MISSING_SOURCE_NODE_PATH");
    if (hasBoundaryPunctuation(equation.mathTree)) failures.push("BOUNDARY_PUNCTUATION_IN_MATH");

    let mathMl = "";
    try {
      mathMl = renderMathMlFromLatex(equation.latex || "", { displayMode: equation.type === "display_math" });
      if (!mathMl.includes("<math")) failures.push("MATHML_OUTPUT_MISSING_MATH_ROOT");
    } catch (error) {
      failures.push(`MATHML_RENDER_ERROR:${error?.message || error}`);
    }

    const expectedLatex = EXPECTED_EQUATIONS[equation.id] || null;
    if (expectedLatex && expectedLatex !== equation.latex) {
      failures.push(`EXPECTED_MISMATCH:${expectedLatex}`);
    }

    return {
      id: equation.id,
      type: equation.type,
      latex: equation.latex,
      provenance: equation.provenance,
      astSummary: summarizeMathAst(equation.mathTree),
      expectedLatex,
      mathMl,
      passed: failures.length === 0,
      failures
    };
  });

  return {
    equationReports,
    canonicalMathErrors: equationReports.reduce((sum, report) => sum + report.failures.length, 0),
    canonicalLaTeXContainsUnsupportedTokens: equationReports.some((report) => /\[(UNSUPPORTED|UNKNOWN)\]/.test(report.latex || "")),
    expectedEquationsChecked: Object.keys(EXPECTED_EQUATIONS).length
  };
}

export async function readExtractedStatistics(filePath = path.join(process.cwd(), "output", "statistics.json")) {
  return JSON.parse(await readFile(filePath, "utf8"));
}