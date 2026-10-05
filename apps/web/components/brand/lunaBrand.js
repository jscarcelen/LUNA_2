/**
 * The LUNA mark, as pure data (no React, no fonts).
 *
 * One source of truth for the logo: `LunaLogo.js` renders it as JSX, and
 * `scripts/brand/build-brand.mjs` renders the very same geometry into the SVG/PNG/ICO files in
 * `public/brand/`, the PWA icons and the favicon.
 *
 * The idea: a crescent moon (Luna) with a single bright point resting in its cradle — the learner,
 * the thing the whole environment grows around. The crescent carries the app's blue→teal identity,
 * the point is the green accent. The wordmark is drawn from strokes (L U N A) so it never depends
 * on a font and renders identically in SVG, PNG and the page.
 */

/** Brand colours — they mirror the tokens in globals.css (--accent, --sky, --teal). */
export const BRAND = {
  blue: "#0a6cf0",
  sky: "#37a8ff",
  teal: "#2fcbb6",
  green: "#34c759",
  ink: "#1d1d1f",
  white: "#ffffff"
};

/** The mark lives in a 64 x 64 box. */
export const MARK_SIZE = 64;

/** Outer circle r26 @ (32,32) minus an inner circle r22 @ (43,25): a fat, friendly crescent. */
export const CRESCENT_PATH = "M31.91 6A26 26 0 1 0 55.51 43.09A22 22 0 1 1 31.91 6Z";

/** The point in the crescent's cradle. */
export const DOT = { cx: 44.5, cy: 25.5, r: 4.6 };

/** Wordmark: four strokes-only letters on a 28-unit cap height. Stroke is applied by the renderer. */
export const WORD = {
  stroke: 5.2,
  capHeight: 28,
  /** [path, x offset] — paths are drawn from x = 0. */
  letters: [
    ["M0 0V28H16", 0],
    ["M0 0V17A11 11 0 0 0 22 17V0", 25],
    ["M0 28V0L22 28V0", 56],
    ["M0 28L12 0L24 28M4.4 19.2H19.6", 87]
  ],
  /** Width of the drawn letters (without stroke). */
  width: 111
};

/** Lockup geometry (mark + wordmark) in one 64-tall box. */
export const LOCKUP = {
  width: 200,
  height: 64,
  wordX: 82,
  wordY: 18
};

/* ------------------------------------------------------------------------------------------ */
/* String renderers (used by the build script; React renders the same numbers as JSX).         */
/* ------------------------------------------------------------------------------------------ */

const gradientDefs = (id, { diagonal = true } = {}) =>
  `<linearGradient id="${id}" x1="${diagonal ? 8 : 0}" y1="${diagonal ? 6 : 0}" x2="${diagonal ? 56 : 64}" y2="${diagonal ? 58 : 64}" gradientUnits="userSpaceOnUse">` +
  `<stop offset="0" stop-color="${BRAND.blue}"/><stop offset="0.55" stop-color="${BRAND.sky}"/><stop offset="1" stop-color="${BRAND.teal}"/></linearGradient>`;

const tileGradient = (id) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">` +
  `<stop offset="0" stop-color="#0a64e6"/><stop offset="0.6" stop-color="#1e9bf0"/><stop offset="1" stop-color="#2fcbb6"/></linearGradient>`;

/** Mark body for a given variant: "color" | "mono" (ink) | "white". */
function markBody(variant, gid) {
  const fill = variant === "mono" ? BRAND.ink : variant === "white" ? BRAND.white : `url(#${gid})`;
  const dot = variant === "color" ? BRAND.green : fill;
  return `<path d="${CRESCENT_PATH}" fill="${fill}"/><circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${dot}"/>`;
}

export function markSvg({ variant = "color", size = 64 } = {}) {
  const gid = "luna-g";
  const defs = variant === "color" ? `<defs>${gradientDefs(gid)}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="LUNA">${defs}${markBody(variant, gid)}</svg>`;
}

function wordBody() {
  const half = WORD.stroke / 2;
  return WORD.letters
    .map(([d, x]) => `<path d="${d}" transform="translate(${x + half} ${half})"/>`)
    .join("");
}

export function wordmarkSvg({ color = BRAND.ink, height = 36 } = {}) {
  const w = WORD.width + WORD.stroke;
  const h = WORD.capHeight + WORD.stroke;
  return `<svg xmlns="http://www.w3.org/2000/svg" height="${height}" width="${(height * w) / h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="LUNA"><g fill="none" stroke="${color}" stroke-width="${WORD.stroke}" stroke-linecap="round" stroke-linejoin="round">${wordBody()}</g></svg>`;
}

export function lockupSvg({ variant = "color", height = 64 } = {}) {
  const gid = "luna-g";
  const defs = variant === "color" ? `<defs>${gradientDefs(gid)}</defs>` : "";
  const ink = variant === "white" ? BRAND.white : BRAND.ink;
  const width = (height * LOCKUP.width) / LOCKUP.height;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${LOCKUP.width} ${LOCKUP.height}" role="img" aria-label="LUNA">${defs}` +
    markBody(variant, gid) +
    `<g transform="translate(${LOCKUP.wordX} ${LOCKUP.wordY})" fill="none" stroke="${ink}" stroke-width="${WORD.stroke}" stroke-linecap="round" stroke-linejoin="round">${wordBody()}</g></svg>`
  );
}

/**
 * App-icon tile: gradient square, white crescent. `rounded` for "any" icons, `bleed` for maskable and
 * Apple touch icons (the OS applies its own mask). `small` drops the point so the shape survives 16 px.
 */
export function tileSvg({ size = 512, rounded = true, scale = 0.64, small = false } = {}) {
  const gid = "luna-t";
  const rx = rounded ? 14.5 : 0;
  const dot = small ? "" : `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="#ffffff" fill-opacity="0.92"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="LUNA"><defs>${tileGradient(gid)}</defs>` +
    `<rect width="64" height="64" rx="${rx}" fill="url(#${gid})"/>` +
    `<g transform="translate(32 32) scale(${scale}) translate(-30.5 -32)"><path d="${CRESCENT_PATH}" fill="#ffffff"/>${dot}</g></svg>`
  );
}
