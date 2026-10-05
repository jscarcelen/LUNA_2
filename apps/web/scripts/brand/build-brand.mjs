/**
 * Builds every logo file from the single geometry in components/brand/lunaBrand.js.
 *
 *   node apps/web/scripts/brand/build-brand.mjs        (from the repo root)
 *
 * Writes:
 *   public/brand/*.svg, *.png        mark / lockup in colour, mono and white; app tile; PNG exports
 *   public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png   (PWA manifest + iOS)
 *   app/icon.svg, app/favicon.ico    (Next.js file-based favicons)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { lockupSvg, markSvg, tileSvg, wordmarkSvg, BRAND } from "../../components/brand/lunaBrand.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
const brandDir = path.join(web, "public/brand");
fs.mkdirSync(brandDir, { recursive: true });

const write = (file, data) => { fs.writeFileSync(file, data); console.log("wrote", path.relative(web, file)); };
const png = async (svg, file, size, { background } = {}) => {
  const img = sharp(Buffer.from(svg), { density: 384 }).resize(size, size, { fit: "contain", background: background || { r: 0, g: 0, b: 0, alpha: 0 } });
  write(file, await img.png({ compressionLevel: 9 }).toBuffer());
};
const pngW = async (svg, file, width, height) => {
  write(file, await sharp(Buffer.from(svg), { density: 384 }).resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer());
};

/* ---------- SVG set ---------- */
write(path.join(brandDir, "luna-mark.svg"), markSvg({ variant: "color" }));
write(path.join(brandDir, "luna-mark-mono.svg"), markSvg({ variant: "mono" }));
write(path.join(brandDir, "luna-mark-white.svg"), markSvg({ variant: "white" }));
write(path.join(brandDir, "luna-logo.svg"), lockupSvg({ variant: "color" }));
write(path.join(brandDir, "luna-logo-mono.svg"), lockupSvg({ variant: "mono" }));
write(path.join(brandDir, "luna-logo-white.svg"), lockupSvg({ variant: "white" }));
write(path.join(brandDir, "luna-wordmark.svg"), wordmarkSvg({ color: BRAND.ink }));
write(path.join(brandDir, "luna-app-icon.svg"), tileSvg({ size: 512 }));

/* ---------- PNG exports of the brand set ---------- */
await png(markSvg({ variant: "color" }), path.join(brandDir, "luna-mark-512.png"), 512);
await png(markSvg({ variant: "mono" }), path.join(brandDir, "luna-mark-mono-512.png"), 512);
await png(markSvg({ variant: "white" }), path.join(brandDir, "luna-mark-white-512.png"), 512);
await pngW(lockupSvg({ variant: "color", height: 256 }), path.join(brandDir, "luna-logo-800.png"), 800, 256);
await pngW(lockupSvg({ variant: "white", height: 256 }), path.join(brandDir, "luna-logo-white-800.png"), 800, 256);
await png(tileSvg({ size: 1024 }), path.join(brandDir, "luna-app-icon-1024.png"), 1024);

/* ---------- PWA + iOS icons ---------- */
await png(tileSvg({ size: 512 }), path.join(web, "public/icon-512.png"), 512);
await png(tileSvg({ size: 192 }), path.join(web, "public/icon-192.png"), 192);
// Maskable: full bleed, mark inside the 80% safe zone.
await png(tileSvg({ size: 512, rounded: false, scale: 0.5 }), path.join(web, "public/icon-maskable-512.png"), 512);
// iOS rounds the corners itself and wants no transparency.
await png(tileSvg({ size: 180, rounded: false, scale: 0.58 }), path.join(web, "public/apple-touch-icon.png"), 180, { background: "#0a64e6" });

/* ---------- Favicons ---------- */
write(path.join(web, "app/icon.svg"), tileSvg({ size: 64, small: true, scale: 0.8 }));

const icoSizes = [16, 32, 48];
const icoImages = [];
for (const size of icoSizes) {
  icoImages.push(await sharp(Buffer.from(tileSvg({ size: 256, small: true, scale: 0.82 })), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer());
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
const entries = Buffer.alloc(16 * icoSizes.length);
let offset = 6 + entries.length;
icoImages.forEach((img, i) => {
  const size = icoSizes[i];
  const o = i * 16;
  entries.writeUInt8(size, o); entries.writeUInt8(size, o + 1); entries.writeUInt8(0, o + 2); entries.writeUInt8(0, o + 3);
  entries.writeUInt16LE(1, o + 4); entries.writeUInt16LE(32, o + 6);
  entries.writeUInt32LE(img.length, o + 8); entries.writeUInt32LE(offset, o + 12);
  offset += img.length;
});
write(path.join(web, "app/favicon.ico"), Buffer.concat([header, entries, ...icoImages]));
console.log("done");
