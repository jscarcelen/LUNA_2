import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { ssim } from "ssim.js";
import { readFileSync } from "node:fs";

function readPng(filePath) {
  return PNG.sync.read(Buffer.from(readFileSync(filePath)));
}

function mae(a, b) {
  let sum = 0;
  const pixels = a.width * a.height * 3;
  for (let i = 0; i < a.data.length; i += 4) {
    sum += Math.abs(a.data[i] - b.data[i]);
    sum += Math.abs(a.data[i + 1] - b.data[i + 1]);
    sum += Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum / pixels;
}

function rmse(a, b) {
  let sumSq = 0;
  const pixels = a.width * a.height * 3;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = a.data[i] - b.data[i];
    const dg = a.data[i + 1] - b.data[i + 1];
    const db = a.data[i + 2] - b.data[i + 2];
    sumSq += dr * dr + dg * dg + db * db;
  }
  return Math.sqrt(sumSq / pixels);
}

export function compareRasterPair(sourcePngPath, htmlPngPath) {
  const source = readPng(sourcePngPath);
  const html = readPng(htmlPngPath);
  if (source.width !== html.width || source.height !== html.height) {
    return {
      ok: false,
      reason: `dimension-mismatch source=${source.width}x${source.height} html=${html.width}x${html.height}`
    };
  }

  const diff = new PNG({ width: source.width, height: source.height });
  const differentPixels = pixelmatch(source.data, html.data, diff.data, source.width, source.height, {
    threshold: 0.1,
    includeAA: true,
    alpha: 0.8,
    diffColor: [255, 0, 0]
  });

  const totalPixels = source.width * source.height;
  const score = ssim(
    { data: source.data, width: source.width, height: source.height },
    { data: html.data, width: html.width, height: html.height }
  );

  return {
    ok: true,
    width: source.width,
    height: source.height,
    differentPixels,
    pixelDifference: totalPixels ? differentPixels / totalPixels : 0,
    mae: mae(source, html),
    rmse: rmse(source, html),
    ssim: Number(score?.mssim || 0),
    diff
  };
}
