/**
 * Line breaking for text that carries formulas and links.
 *
 * The plain wrapper counts characters; here a formula is one unbreakable atom whose width comes from
 * the maths typesetter (and whose height from KaTeX's own strut), so a line holding a stacked
 * fraction or a sum with limits is allocated the extra height it needs and the component below it
 * is pushed down instead of being overlapped. A formula wider than the whole line is cut at its
 * relations and operators (see `breakMath`); display maths gets its own centred line(s).
 */
import { latexToUnicode } from "./unicode";
import { breakMath, richToPlain, type RichSeg } from "./richText";
import { estimateMath, katexExtent } from "./typeset";

const MM_PER_PT = 0.352778;
/** KaTeX draws its formulas 1.1× the text around them (see the CSS in the HTML renderer). */
export const MATH_SCALE = 1.1;
/** KaTeX's Computer Modern letters are a little wider than Times'. */
const WIDTH_SAFETY = 1.14;

export interface RichLine {
  segs: RichSeg[];
  /** A line of display maths: centred, on its own. */
  display?: boolean;
  /** Height reserved for the line, in mm (a plain line's, or more when it holds tall maths). */
  pitch: number;
  /** Tall maths on the line, in em of the text: the line is this much taller than a plain one. */
  extraEm: number;
}

interface Token {
  kind: "word" | "math";
  text: string;
  href?: string;
  tex?: string;
  display?: boolean;
  /** Width in em of the text. */
  w: number;
  /** No space between this token and the one before it (but the line may break there if it is a piece of a formula). */
  glued: boolean;
  /** Piece of a formula cut at an operator: the pieces are joined again when they stay on one line. */
  piece?: boolean;
  /** Formula wider than a line: scale it down by this factor to hold the margin. */
  shrink?: number;
}

export interface RichStyle { fontSize: number; fontWeight?: string; lineHeight?: number }

const emMm = (fontSize: number) => fontSize * MM_PER_PT;
export const richLineHeightMm = (style: RichStyle) => emMm(style.fontSize) * (style.lineHeight || 1.35);

/** Width of a formula in em of the surrounding text. */
export function mathWidthEm(tex: string, display: boolean): number {
  const box = estimateMath(tex, display);
  return (box ? box.w : latexToUnicode(tex).length * 0.55) * MATH_SCALE * WIDTH_SAFETY;
}

/** Height a formula needs, in em of the surrounding text (above and below the baseline together). */
export function mathHeightEm(tex: string, display: boolean): number {
  const real = katexExtent(tex, display);
  if (real) return (real.h + real.d) * MATH_SCALE;
  const box = estimateMath(tex, display);
  return box ? (box.h + box.d) * MATH_SCALE * 1.15 : 1;
}

export function tokenise(segs: RichSeg[], widthEm: number, charEm: number): Token[] {
  const tokens: Token[] = [];
  let spaceBefore = true;
  const push = (token: Omit<Token, "glued">, force?: boolean) => {
    tokens.push({ ...token, glued: force ?? !spaceBefore });
    spaceBefore = false;
  };
  for (const seg of segs) {
    if (seg.t === "math") {
      const w = mathWidthEm(seg.tex, seg.display);
      if (w <= widthEm) { push({ kind: "math", text: latexToUnicode(seg.tex), tex: seg.tex, display: seg.display, w }); continue; }
      const pieces = breakMath(seg.tex);
      pieces.forEach((piece, index) => {
        const pw = mathWidthEm(piece, seg.display);
        push({ kind: "math", text: latexToUnicode(piece), tex: piece, display: seg.display, w: Math.min(pw, widthEm), piece: pieces.length > 1, ...(pw > widthEm ? { shrink: Math.max(0.55, widthEm / pw) } : {}) }, index === 0 ? undefined : true);
      });
      continue;
    }
    const text = seg.t === "link" ? seg.text : seg.text;
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { spaceBefore = true; continue; }
      push({ kind: "word", text: part, ...(seg.t === "link" ? { href: seg.href } : {}), w: [...part].length * charEm });
    }
  }
  return tokens;
}

/** Tokens → the segments of one line (neighbouring words and pieces of one formula merged). */
function toSegs(line: Token[]): RichSeg[] {
  const segs: RichSeg[] = [];
  line.forEach((token, index) => {
    const space = index > 0 && !token.glued ? " " : "";
    const last = segs[segs.length - 1];
    if (token.kind === "math") {
      if (last && last.t === "math" && token.glued && token.piece && last.display === Boolean(token.display)) { last.tex += token.tex; return; }
      if (space) segs.push({ t: "text", text: " " });
      const scale = token.shrink;
      segs.push({ t: "math", tex: token.tex || "", display: Boolean(token.display), ...(scale ? { shrink: scale } : {}) });
      return;
    }
    if (token.href) {
      if (last && last.t === "link" && last.href === token.href && !space) { last.text += token.text; return; }
      if (last && last.t === "link" && last.href === token.href && space) { last.text += ` ${token.text}`; return; }
      if (space) segs.push({ t: "text", text: " " });
      segs.push({ t: "link", text: token.text, href: token.href });
      return;
    }
    if (last && last.t === "text") last.text += `${space}${token.text}`;
    else segs.push({ t: "text", text: `${space}${token.text}` });
  });
  return segs;
}

/**
 * Wraps paragraphs of segments to `widthMm` at `style.fontSize`. Returns one rich line per output
 * line, the same lines as plain Unicode strings (what DOCX / PPTX and the plain fallbacks draw), and
 * the total height reserved.
 */
export function layoutRich(paragraphs: RichSeg[][], style: RichStyle, widthMm: number): { lines: string[]; rich: RichLine[]; height: number } {
  const em = emMm(style.fontSize);
  const widthEm = Math.max(2, widthMm / em);
  const bold = style.fontWeight === "bold";
  const charEm = bold ? 0.55 : 0.5;
  const spaceEm = charEm;
  const base = (style.lineHeight || 1.35) * em;
  const rich: RichLine[] = [];

  const finish = (tokens: Token[], display: boolean) => {
    const maths = tokens.filter((token) => token.kind === "math");
    const heights = maths.map((token) => mathHeightEm(token.tex || "", Boolean(token.display)) * (token.shrink || 1));
    const needed = heights.length ? Math.max(...heights) : 0;
    const lineEm = style.lineHeight || 1.35;
    const pitchEm = display ? needed + 0.7 : needed > 0 ? Math.max(lineEm, needed + 0.22) : lineEm;
    rich.push({ segs: toSegs(tokens), ...(display ? { display: true } : {}), pitch: pitchEm * em, extraEm: Math.max(0, pitchEm - lineEm) });
  };

  for (const segs of paragraphs) {
    if (!segs.length || (segs.length === 1 && segs[0].t === "text" && !segs[0].text.trim())) { rich.push({ segs: [], pitch: base, extraEm: 0 }); continue; }
    // Display formulas split the paragraph: text before, the formula alone, text after.
    const runs: { display: boolean; segs: RichSeg[] }[] = [];
    for (const seg of segs) {
      if (seg.t === "math" && seg.display) runs.push({ display: true, segs: [seg] });
      else if (runs.length && !runs[runs.length - 1].display) runs[runs.length - 1].segs.push(seg);
      else runs.push({ display: false, segs: [seg] });
    }
    for (const run of runs) {
      const tokens = tokenise(run.segs, widthEm, charEm);
      if (!tokens.length) continue;
      let line: Token[] = [];
      let used = 0;
      const flush = () => { if (line.length) finish(line, run.display); line = []; used = 0; };
      const place = (token: Token) => { used += (line.length && !token.glued ? spaceEm : 0) + token.w; line.push(token); };
      // Units: runs of tokens with no space between them stay together unless they are pieces of one formula.
      const units: Token[][] = [];
      for (const token of tokens) {
        const last = units[units.length - 1];
        if (last && token.glued) last.push(token); else units.push([token]);
      }
      for (const unit of units) {
        const width = unit.reduce((sum, token) => sum + token.w, 0);
        const gap = line.length && !unit[0].glued ? spaceEm : 0;
        if (width <= widthEm && (!line.length || used + gap + width <= widthEm)) { unit.forEach(place); continue; }
        if (width <= widthEm) { flush(); unit.forEach(place); continue; }
        for (const token of unit) {
          if (line.length && used + (token.glued ? 0 : spaceEm) + token.w > widthEm) flush();
          place(token);
        }
      }
      flush();
    }
  }
  const lines = rich.map((line) => richToPlain(line.segs));
  return { lines, rich, height: rich.reduce((sum, line) => sum + line.pitch, 0) };
}
