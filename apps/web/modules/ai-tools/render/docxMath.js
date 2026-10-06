import {
  Math as OfficeMath, MathFraction, MathIntegral, MathRadical, MathRoundBrackets, MathRun, MathSquareBrackets, MathCurlyBrackets, MathAngledBrackets,
  MathSubScript, MathSubSuperScript, MathSum, MathSuperScript
} from "docx";
import { parseMath } from "../../template-studio/engine/math/typeset";
import { MATH_SYMBOLS } from "../../template-studio/engine/math/symbolTable";

/**
 * LaTeX → Word's native equation (OMML), so a formula in a .docx is a real, editable equation
 * rather than characters. Built from KaTeX's parse tree; what OMML has no direct element for
 * (matrices, accents) is written as its closest readable run. Returns null when the formula does not
 * parse, and the caller writes the Unicode text instead.
 */

const BRACKETS = { "(": MathRoundBrackets, "[": MathSquareBrackets, "{": MathCurlyBrackets, "\\{": MathCurlyBrackets, "⟨": MathAngledBrackets, "\\langle": MathAngledBrackets };
const COMBINING = { "\\bar": "̄", "\\overline": "̅", "\\hat": "̂", "\\widehat": "̂", "\\tilde": "̃", "\\widetilde": "̃", "\\vec": "⃗", "\\dot": "̇", "\\ddot": "̈", "\\check": "̌" };
const BIG = new Set(["\\sum", "\\prod", "\\int", "\\iint", "\\oint", "\\coprod", "\\bigcup", "\\bigcap"]);

const run = (text) => new MathRun(String(text));

function symbolText(node) {
  const text = String(node.text ?? "");
  if (text.startsWith("\\")) return MATH_SYMBOLS[text]?.[0] || text.replace(/^\\/, "");
  if (text === "-") return "−";
  if (text === "*") return "∗";
  return text;
}

/** The characters of a node, for the accents Word has no element for. */
function plainOf(node) {
  if (!node) return "";
  if (node.type === "ordgroup") return (node.body || []).map(plainOf).join("");
  if (typeof node.text === "string") return symbolText(node);
  return Array.isArray(node.body) ? node.body.map(plainOf).join("") : "";
}

function nodes(list) {
  const out = [];
  const items = Array.isArray(list) ? list : [];
  for (let i = 0; i < items.length; i += 1) {
    const node = items[i];
    // A sum / product / integral takes the terms after it as its operand, up to the next relation or operator.
    const op = node?.type === "supsub" && node.base?.type === "op" ? node.base : node?.type === "op" ? node : null;
    if (op && BIG.has(op.name)) {
      const operand = [];
      while (i + 1 < items.length && !(items[i + 1]?.type === "atom" && ["rel", "bin"].includes(items[i + 1].family))) { operand.push(items[i + 1]); i += 1; }
      const props = { children: nodes(operand), ...(node.sub ? { subScript: nodes([node.sub]) } : {}), ...(node.sup ? { superScript: nodes([node.sup]) } : {}) };
      out.push(op.name === "\\sum" || op.name === "\\prod" || op.name === "\\coprod" || op.name.startsWith("\\big") ? new MathSum(props) : new MathIntegral(props));
      continue;
    }
    out.push(...one(node));
  }
  return out.length ? out : [run("")];
}

function one(node) {
  if (!node) return [];
  switch (node.type) {
    case "ordgroup": return nodes(node.body);
    case "mathord": case "textord": case "atom": case "op-token": return [run(symbolText(node))];
    case "spacing": case "kern": return [run(" ")];
    case "genfrac": {
      const fraction = new MathFraction({ numerator: nodes([node.numer]), denominator: nodes([node.denom]) });
      return node.leftDelim || node.rightDelim ? [new MathRoundBrackets({ children: [fraction] })] : [fraction];
    }
    case "sqrt": return [new MathRadical({ children: nodes([node.body]), ...(node.index ? { degree: nodes([node.index]) } : {}) })];
    case "supsub": {
      const base = nodes([node.base]);
      if (node.sup && node.sub) return [new MathSubSuperScript({ children: base, subScript: nodes([node.sub]), superScript: nodes([node.sup]) })];
      if (node.sup) return [new MathSuperScript({ children: base, superScript: nodes([node.sup]) })];
      return [new MathSubScript({ children: base, subScript: nodes([node.sub]) })];
    }
    case "accent": {
      const mark = COMBINING[node.label] || "̅";
      return [run(`${plainOf(node.base)}${mark}`)];
    }
    case "leftright": {
      const Bracket = BRACKETS[node.left];
      if (Bracket) return [new Bracket({ children: nodes(node.body) })];
      return [run(node.left && node.left !== "." ? node.left : ""), ...nodes(node.body), run(node.right && node.right !== "." ? node.right : "")];
    }
    case "op": return [run(String(node.name || "").replace(/^\\/, ""))];
    case "operatorname": return nodes(node.body);
    case "text": return nodes(node.body);
    case "array": {
      const rows = (node.body || []).map((row) => row.flatMap((cell, index) => [...(index ? [run("  ")] : []), ...nodes([cell])]));
      return rows.flatMap((row, index) => [...(index ? [run("; ")] : []), ...row]);
    }
    case "htmlmathml": return nodes(node.html);
    case "font": case "styling": case "sizing": case "color": case "mclass": case "lap": case "phantom": case "enclose": case "overline": case "underline":
      return Array.isArray(node.body) ? nodes(node.body) : node.body ? nodes([node.body]) : [];
    default: return Array.isArray(node.body) ? nodes(node.body) : [];
  }
}

/** A Word equation for the formula, or null when it cannot be read. */
export function texToDocxMath(tex, display = false) {
  const tree = parseMath(tex, display);
  if (!tree) return null;
  try {
    return new OfficeMath({ children: nodes(tree) });
  } catch {
    return null;
  }
}
