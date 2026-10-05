import { useId } from "react";
import { BRAND, CRESCENT_PATH, DOT, LOCKUP, WORD } from "./lunaBrand.js";

/**
 * The LUNA logo — one component for the landing page, the demo, the app's navigation rail and the
 * sign-in dialogs, so the brand is the same everywhere.
 *
 *   <LunaLogo />                         mark + wordmark, 32px tall, colour
 *   <LunaLogo size={20} mark />          just the mark (what the collapsed rail shows)
 *   <LunaLogo variant="white" />         for gradient / dark hero backgrounds
 *   <LunaLogo variant="mono" />          one ink colour, for print and tiny uses
 *   <LunaLogo tile size={44} />          the app-icon tile (gradient square + white crescent)
 *
 * `size` is the height in px. The geometry lives in `lunaBrand.js`, shared with the build script
 * that writes public/brand/* and the favicons.
 */
export function LunaLogo({ size = 32, variant = "color", mark = false, tile = false, label = "LUNA", className, style }) {
  const uid = useId().replace(/:/g, "");
  const gid = `luna-g-${uid}`;
  const tid = `luna-t-${uid}`;
  const ink = variant === "white" ? BRAND.white : BRAND.ink;
  const fill = variant === "mono" ? BRAND.ink : variant === "white" ? BRAND.white : `url(#${gid})`;
  const dot = variant === "color" ? BRAND.green : fill;

  const gradient = (
    <linearGradient id={gid} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor={BRAND.blue} />
      <stop offset="0.55" stopColor={BRAND.sky} />
      <stop offset="1" stopColor={BRAND.teal} />
    </linearGradient>
  );

  if (tile) {
    return (
      <svg className={className} style={style} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label}>
        <defs>
          <linearGradient id={tid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0a64e6" />
            <stop offset="0.6" stopColor="#1e9bf0" />
            <stop offset="1" stopColor="#2fcbb6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14.5" fill={`url(#${tid})`} />
        <g transform="translate(32 32) scale(0.64) translate(-30.5 -32)">
          <path d={CRESCENT_PATH} fill="#fff" />
          <circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill="#fff" fillOpacity="0.92" />
        </g>
      </svg>
    );
  }

  const markShapes = (
    <>
      <path d={CRESCENT_PATH} fill={fill} />
      <circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill={dot} />
    </>
  );

  if (mark) {
    return (
      <svg className={className} style={style} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label}>
        {variant === "color" ? <defs>{gradient}</defs> : null}
        {markShapes}
      </svg>
    );
  }

  const half = WORD.stroke / 2;
  return (
    <svg
      className={className}
      style={style}
      height={size}
      width={(size * LOCKUP.width) / LOCKUP.height}
      viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}
      role="img"
      aria-label={label}
    >
      {variant === "color" ? <defs>{gradient}</defs> : null}
      {markShapes}
      <g transform={`translate(${LOCKUP.wordX} ${LOCKUP.wordY})`} fill="none" stroke={ink} strokeWidth={WORD.stroke} strokeLinecap="round" strokeLinejoin="round">
        {WORD.letters.map(([d, x]) => (
          <path key={x} d={d} transform={`translate(${x + half} ${half})`} />
        ))}
      </g>
    </svg>
  );
}
