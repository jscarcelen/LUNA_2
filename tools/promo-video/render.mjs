#!/usr/bin/env node
/* Renders the Luna promo video.
 *
 *   node render.mjs                     full render -> out/luna-promo.mp4 (+ poster), music muxed if out/luna-music.wav exists
 *   node render.mjs --size 1600         render at 1600x900 instead of 1920x1080 (smaller file)
 *   node render.mjs --frames 2,5.6,12   only screenshot these times (seconds) into out/preview/ (for design checks)
 *   node render.mjs --serve             just serve the repo so index.html can be opened in a browser (?t=12.5)
 *   node render.mjs --install           after rendering copy mp4 + poster into apps/web/public/landing/
 *
 * Options: --workers N (default 6)  --crf N (default 23)  --preset slow  --poster 4.6  --keep (keep frames)
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };

const timing = JSON.parse(fs.readFileSync(path.join(here, "timing.json"), "utf8"));
const FPS = timing.fps, DURATION = timing.duration;
const WIDTH = Number(opt("size", 1920));
const HEIGHT = Math.round((WIDTH * 9) / 16);
const WORKERS = Number(opt("workers", 6));
const CRF = opt("crf", "27");
const PRESET = opt("preset", "slow");
const POSTER_T = Number(opt("poster", 4.7));
const outDir = path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(repo, url);
    if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function findChrome() {
  const home = os.homedir();
  const cands = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ...["chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell", "chromium-1234/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"].map((p) => path.join(home, "Library/Caches/ms-playwright", p)),
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
  ].filter(Boolean);
  const found = cands.find((c) => fs.existsSync(c));
  if (!found) throw new Error("No Chrome/Chromium found. Set CHROME_PATH.");
  return found;
}

function ff(argv, label) {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${label})`);
}

const server = await serve(flag("serve") ? 4173 : 0);
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/tools/promo-video/index.html?w=${WIDTH}`;
if (flag("serve")) { console.log(`Serving ${repo}\nOpen http://localhost:${port}/tools/promo-video/index.html?t=12.5`); await new Promise(() => {}); }

/* One Chromium process per worker: several tabs in one process stall (background tabs never finish decoding). */
const browsers = [];
async function openPage() {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 }
  });
  browsers.push(browser);
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) console.error("console:", m.text()); });
  await page.goto(pageUrl, { waitUntil: "load" });
  await page.evaluate(() => window.__ready);
  return page;
}
async function shot(page, t, file, type = "jpeg") {
  await page.evaluate((tt) => { window.renderAt(tt); return document.body.offsetHeight; }, t);
  await page.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 93 } : {}), optimizeForSpeed: true });
}

try {
  if (opt("frames", null)) {
    const dir = path.join(outDir, "preview");
    fs.mkdirSync(dir, { recursive: true });
    const page = await openPage();
    for (const t of opt("frames").split(",").map(Number)) await shot(page, t, path.join(dir, `t${t.toFixed(2).padStart(6, "0")}.jpg`));
    console.log("preview frames in", dir);
  } else {
    const total = Number(opt("limit", Math.round(DURATION * FPS)));
    const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "luna-promo-frames-"));
    console.log(`Rendering ${total} frames @ ${WIDTH}x${HEIGHT} with ${WORKERS} workers -> ${framesDir}`);
    let next = 0, done = 0;
    const t0 = Date.now();
    const pages = await Promise.all(Array.from({ length: WORKERS }, openPage));
    await Promise.all(pages.map(async (page) => {
      for (;;) {
        const i = next++;
        if (i >= total) return;
        await shot(page, i / FPS, path.join(framesDir, `f${String(i).padStart(5, "0")}.jpg`));
        if (++done % 100 === 0) console.log(`  ${done}/${total}  (${((done / ((Date.now() - t0) / 1000))).toFixed(1)} fps)`);
      }
    }));
    /* poster */
    const posterFrame = path.join(outDir, "poster-full.jpg");
    await shot(pages[0], POSTER_T, posterFrame);
    ff(["-i", posterFrame, "-vf", "scale=1280:-2:flags=lanczos", "-q:v", "3", path.join(outDir, "luna-promo-poster.jpg")], "poster");

    const wav = path.join(outDir, "luna-music.wav");
    const mp4 = path.join(outDir, "luna-promo.mp4");
    const inputs = ["-framerate", String(FPS), "-i", path.join(framesDir, "f%05d.jpg")];
    if (fs.existsSync(wav)) inputs.push("-i", wav);
    else console.warn("No out/luna-music.wav — run `node music.mjs` first for audio. Rendering silent video.");
    const v = ["-c:v", "libx264", "-preset", PRESET, "-crf", CRF, "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(FPS), "-g", "60", "-movflags", "+faststart",
      ...(opt("maxrate", null) ? ["-maxrate", opt("maxrate"), "-bufsize", String(parseInt(opt("maxrate"), 10) * 2) + "k"] : [])];
    const a = fs.existsSync(wav) ? ["-c:a", "aac", "-b:a", "112k", "-ar", "44100", "-ac", "2", "-t", String(DURATION)] : ["-t", String(DURATION)];
    ff([...inputs, ...v, ...a, mp4], "encode");
    const mb = (fs.statSync(mp4).size / 1048576).toFixed(2);
    console.log(`Wrote ${mp4} (${mb} MB)`);
    if (!flag("keep")) fs.rmSync(framesDir, { recursive: true, force: true });
    else console.log("frames kept in", framesDir);
    if (flag("install")) {
      const dest = path.join(repo, "apps/web/public/landing");
      fs.copyFileSync(mp4, path.join(dest, "luna-promo.mp4"));
      fs.copyFileSync(path.join(outDir, "luna-promo-poster.jpg"), path.join(dest, "luna-promo-poster.jpg"));
      console.log("Installed into", dest);
    }
  }
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  server.close();
}
