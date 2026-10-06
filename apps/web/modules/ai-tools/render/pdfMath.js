import { LineCapStyle, StandardFonts, rgb } from "pdf-lib";
import { typesetMath } from "../../template-studio/engine/math/typeset";

/**
 * Typeset maths inside a pdf-lib document.
 *
 * pdf-lib draws with the fourteen standard fonts, so there is no browser (and no KaTeX HTML) here.
 * `typesetMath` lays the formula out as boxes of glyph / rule / stroke operations; this file embeds
 * Times, Symbol and Helvetica once per document, measures with their real metrics, and draws those
 * operations at a baseline position.
 */

export async function embedMathFonts(pdf) {
  const fonts = {
    rm: await pdf.embedFont(StandardFonts.TimesRoman),
    it: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    bf: await pdf.embedFont(StandardFonts.TimesRomanBold),
    bi: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    sy: await pdf.embedFont(StandardFonts.Symbol),
    ss: await pdf.embedFont(StandardFonts.Helvetica),
    tt: await pdf.embedFont(StandardFonts.Courier)
  };
  const sets = {};
  for (const [id, font] of Object.entries(fonts)) sets[id] = new Set(font.getCharacterSet());
  const env = {
    supports: (id, ch) => sets[id]?.has(ch.codePointAt(0)) || false,
    width: (id, text) => {
      try { return fonts[id].widthOfTextAtSize(text, 1); } catch { return 0.5 * [...text].length; }
    }
  };
  return { fonts, env };
}

/** Typeset formula for this document (cached per formula), or null when it cannot be parsed. */
export function pdfMathBox(math, tex, display) {
  const key = `${display ? "D" : "T"}|${tex}`;
  if (!math.cache) math.cache = new Map();
  if (!math.cache.has(key)) math.cache.set(key, typesetMath(tex, { display, env: math.env }));
  return math.cache.get(key);
}

/** Draws a typeset box with its origin (left edge, baseline) at (x, y) in PDF points, at `size` points per em. */
export function drawMathBox(page, math, box, x, y, size, color) {
  const { fonts } = math;
  const stroke = (lw) => Math.max(0.3, lw * size);
  for (const op of box.ops) {
    if (op.t === "g") {
      try {
        page.drawText(op.s, { x: x + op.x * size, y: y + op.y * size, size: op.size * size, font: fonts[op.f], color });
      } catch {
        // A character the font cannot encode is skipped rather than aborting the whole export.
      }
    } else if (op.t === "r") {
      page.drawRectangle({ x: x + op.x * size, y: y + op.y * size, width: op.w * size, height: Math.max(0.3, op.h * size), color });
    } else if (op.t === "l") {
      page.drawLine({ start: { x: x + op.x1 * size, y: y + op.y1 * size }, end: { x: x + op.x2 * size, y: y + op.y2 * size }, thickness: stroke(op.lw), color, lineCap: LineCapStyle.Round });
    } else if (op.t === "p") {
      for (let i = 1; i < op.pts.length; i += 1) {
        page.drawLine({ start: { x: x + op.pts[i - 1][0] * size, y: y + op.pts[i - 1][1] * size }, end: { x: x + op.pts[i][0] * size, y: y + op.pts[i][1] * size }, thickness: stroke(op.lw), color, lineCap: LineCapStyle.Round });
      }
    }
  }
}

export { rgb };
