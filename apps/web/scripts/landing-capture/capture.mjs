/**
 * Captures REAL screenshots and a short walkthrough video of the running LUNA app for the landing page.
 *
 *   cd apps/web/scripts/landing-capture && npm install        (once: playwright-core + ffmpeg-static)
 *   LUNA_URL=http://localhost:3000 npm run capture            (the app must be running; read-only)
 *   npm run capture -- --only=home,plans                      (refresh a few shots)
 *   npm run capture -- --no-video                             (skip the video)
 *
 * Output (committed): apps/web/public/landing/*.webp, hero.mp4/.webm and hero-poster.webp.
 *
 * Rules this script keeps:
 *  - It only navigates and reads. It never saves, uploads, generates or submits anything, so the
 *    account you point it at is not changed. (Typing into the agent wizard stays in the browser.)
 *  - Each run uses a throwaway browser profile. The marketplace is empty in the demo account, so
 *    that one screen is captured with a handful of sample listings put into the *throwaway profile's*
 *    localStorage — the real marketplace UI, clearly sample content (see MARKET_SEED below).
 *  - The Next.js dev overlay ("N", "UI issues") is hidden so the shots look like production.
 *
 * Chromium: uses PLAYWRIGHT_CHROMIUM (path) if set, else the Playwright cache, else Google Chrome.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../public/landing");
const RAW = path.join(here, ".raw");
const BASE = (process.env.LUNA_URL || "http://localhost:3000").replace(/\/$/, "");
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const wantVideo = !args.includes("--no-video") && (!only.length || only.includes("video"));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      const p = path.join(cache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
      if (fs.existsSync(p)) return p;
    }
  }
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

/* ----------------------------------------------------------------------- sample marketplace */
const MARKET_SEED = (() => {
  const at = new Date().toISOString();
  const store = { id: "store_sample", name: "Luna sample store", tagline: "Example listings so the marketplace is not empty.", about: "", colour: "#0071e3", owner: "Maria G.", createdAt: at };
  const listing = (n, kind, name, tagline, description, subject, price, pricingType, tags) => ({
    id: `lst_sample_${n}`, kind, name, tagline, description, subject, price, pricingType, storeId: store.id,
    payload: {}, preview: "", tags, downloads: 0, reviews: [], publishedAt: at
  });
  return {
    stores: [store],
    listings: [
      listing(1, "agent", "Exam from my notes", "Multiple-choice and open questions, with an answer key.", "Reads the material you pick and writes a mixed exam. Choose how many questions and how hard.", "Exam prep", 40, "per-use", ["exam", "quiz"]),
      listing(2, "agent", "Vocabulary flashcards", "Word pairs between two languages, at your level.", "Pairs words from your text or from general knowledge. Ready to flip on Luna.", "Languages", 0, "one-time", ["flashcards", "languages"]),
      listing(3, "agent", "One-page summary", "A clean summary with key points and a glossary.", "Turns a chapter into one page you can read in five minutes.", "Humanities", 15, "per-use", ["summary"]),
      listing(4, "agent", "Maths practice sets", "Step-by-step problems that grow in difficulty.", "Generates practice sets from a topic, with worked solutions.", "Maths", 25, "per-use", ["maths", "practice"]),
      listing(5, "agent", "Revision question bank", "Short questions to test recall before an exam.", "Quick-fire recall questions grouped by topic.", "Science", 20, "one-time", ["revision"]),
      listing(6, "agent", "Reading comprehension", "A passage with questions of rising difficulty.", "Builds a short passage from your topic and tests understanding.", "Languages", 30, "per-use", ["reading"])
    ]
  };
})();

/* ----------------------------------------------------------------------- browser plumbing */
const HIDE_DEV_OVERLAY = `
  const css = "nextjs-portal,next-route-announcer,.ui-critic,[aria-label='Send feedback']{display:none!important}";
  const add = () => {
    if (!document.getElementById("__cap") && document.documentElement) { const s = document.createElement("style"); s.id = "__cap"; s.textContent = css; document.documentElement.appendChild(s); }
    document.querySelectorAll("nextjs-portal").forEach((e) => e.remove());
  };
  add(); document.addEventListener("DOMContentLoaded", add);
  setInterval(add, 150);
`;
const CURSOR = `
  (() => {
    const mk = () => {
      if (document.getElementById("__cursor")) return;
      const c = document.createElement("div"); c.id = "__cursor";
      c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none;transition:transform .45s cubic-bezier(.4,0,.2,1);transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
      c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 8.2-6.2 1.6 3.4 6.4-2.6 1.4-3.4-6.4L4 17z" fill="#fff" stroke="#1d1d1f" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      document.documentElement.appendChild(c);
      window.addEventListener("mousemove", (e) => { c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true);
    };
    document.addEventListener("DOMContentLoaded", mk); mk();
    new MutationObserver(mk).observe(document, { childList: true });
  })();
`;

/**
 * Read-only guard for the shots that interact (answering a quiz, painting a highlight, deleting a note):
 * the page may do anything locally, but no write ever reaches the shared demo account. Only the calls that
 * read or analyse (Luna's read of the performance, template previews, AI generation) are let through.
 */
const GUARD_ALLOW = /\/api\/(performance\/coach|chat|ai-tools|agents|templates\/render-preview)/;
async function guardWrites(ctx) {
  await ctx.route("**/api/**", (route) => {
    const request = route.request();
    if (request.method() !== "GET" && !GUARD_ALLOW.test(request.url())) return route.abort();
    return route.continue();
  });
}
/** Serve an AI answer from .raw/<file> when it exists; otherwise make the one real call and keep it, so retakes cost nothing. */
async function cachedAnswer(page, pattern, file) {
  const cachePath = path.join(RAW, file);
  await page.route(pattern, async (route) => {
    if (route.request().method() === "GET") return route.continue();
    if (fs.existsSync(cachePath)) return route.fulfill({ status: 200, contentType: "application/json", body: fs.readFileSync(cachePath, "utf8") });
    const response = await route.fetch({ timeout: 110000 });
    const body = await response.text();
    if (response.ok()) fs.writeFileSync(cachePath, body);
    return route.fulfill({ response, body });
  });
}

async function newContext(browser, { width, height, scale, mobile, video, cursor, market, guard }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: !!mobile,
    hasTouch: !!mobile,
    colorScheme: "light",
    reducedMotion: "no-preference",
    ...(video ? { recordVideo: { dir: path.join(RAW, "video"), size: { width, height } } } : {})
  });
  await ctx.addInitScript(HIDE_DEV_OVERLAY);
  if (guard) await guardWrites(ctx);
  if (cursor) await ctx.addInitScript(CURSOR);
  if (market) {
    await ctx.addInitScript(`try {
      if (!localStorage.getItem("luna.marketplace.v2")) localStorage.setItem("luna.marketplace.v2", ${JSON.stringify(JSON.stringify(MARKET_SEED.listings))});
      if (!localStorage.getItem("luna.marketplace.stores.v1")) localStorage.setItem("luna.marketplace.stores.v1", ${JSON.stringify(JSON.stringify(MARKET_SEED.stores))});
    } catch (e) {}`);
  }
  return ctx;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function openApp(page) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
      await page.waitForSelector(".nav-rail-item, .bottom-tab", { timeout: 20000 });
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
  await wait(1800);
}
const rail = (page, label) => page.locator(`.nav-rail-item[aria-label="${label}"]`).click();
async function mobileNav(page, label) {
  const tab = page.locator(".bottom-tab", { hasText: label });
  if (await tab.count()) return tab.first().click();
  await page.locator('button:has-text("☰")').first().click();
  await wait(400);
  await page.locator(`.nav-rail-item[aria-label="${label}"]`).first().click();
}
async function go(page, label, mobile) { await (mobile ? mobileNav(page, label) : rail(page, label)); await wait(1600); }

/* ----------------------------------------------------------------------- the shots */
// Each shot: { name, mobile?, height?, run(page, mobile) } — returns once the screen is ready to be photographed.
// Scroll so an element whose own text matches sits at the top of the view.
const scrollToText = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src.source, src.flags);
  const el = [...document.querySelectorAll("p, h2, h3, h4, span, div")].find((n) => n.children.length === 0 && rx.test(n.textContent || ""));
  if (el) el.scrollIntoView({ block: "start" });
}, { source: re.source, flags: re.flags });
const clickRowButton = async (page, rowText, button) => {
  const row = page.locator("div, li, article", { has: page.locator(`text=${rowText}`) }).filter({ has: page.locator(`button:has-text("${button}")`) }).last();
  await row.locator(`button:has-text("${button}")`).first().click();
};

const SHOTS = [
  { name: "home", run: async (p) => { await go(p, "Home"); } },
  { name: "workspaces", run: async (p) => { await go(p, "Workspaces"); await p.click("text=Expand all"); await wait(800); } },
  { name: "reader", run: async (p) => { await go(p, "Workspaces"); await p.click("text=Expand all"); await wait(500); await clickRowButton(p, "Accounting.pdf", "Preview"); await wait(2200); } },
  { name: "plans", run: async (p) => { await go(p, "Study plans"); } },
  { name: "calendar", run: async (p) => { await go(p, "Study plans"); await p.locator("button", { hasText: /^Calendar$/ }).first().click(); await wait(1500); await scrollToText(p, /Calendar · /i); await wait(500); } },
  { name: "activities", run: async (p) => { await go(p, "Activities"); } },
  { name: "results", run: async (p) => { await go(p, "Activities"); await p.locator("main button", { hasText: /^Done$/ }).first().click(); await wait(600); await p.click("text=Quiz on Income Statement and Balanc"); await wait(1200); } },
  { name: "quiz", run: async (p) => { await go(p, "Workspaces"); await p.click("text=Expand all"); await wait(500); await clickRowButton(p, "Quiz on Accounting Principles", "Open"); await wait(800); await p.locator('button:has-text("Start")').first().click(); await wait(1500); } },
  { name: "performance", height: 1290, run: async (p) => { await go(p, "Performance"); await wait(800); } },
  { name: "agents", run: async (p) => { await go(p, "AI agents"); } },
  { name: "agent-run", run: async (p) => { await go(p, "AI agents"); await p.locator("main button", { hasText: /^Run$/ }).first().click(); await wait(1800); } },
  {
    name: "studio",
    run: async (p) => {
      await go(p, "AI agents");
      await p.click("text=Create agent"); await wait(500);
      await p.click("text=Start from scratch"); await wait(500);
      await p.locator("input").first().fill("Exam from my notes");
      await p.locator("textarea").first().fill("Create a mixed exam with multiple-choice and open questions from my notes, with an answer key.");
      for (let i = 0; i < 3; i += 1) { await p.locator('button:has-text("Next:")').first().click(); await wait(500); }
      await p.locator("button", { hasText: /^Questions$/ }).first().click(); await wait(500);
      for (const label of ["Multiple Choice", "Open Answer", "True / False"]) { await p.locator(`text="${label}"`).first().click(); await wait(250); }
      await wait(800);
    }
  },
  { name: "templates", run: async (p) => { await go(p, "Templates"); } },
  {
    name: "template-preview",
    run: async (p) => {
      await go(p, "Templates");
      const box = await p.locator("text=/^Doc$/").first().boundingBox();
      await p.mouse.click(box.x + 60, box.y - 120); await wait(1200);
      await p.locator('button:has-text("Preview")').first().click(); await wait(2500);
    }
  },
  { name: "marketplace", market: true, run: async (p) => { await go(p, "Marketplace"); await wait(800); } },
  { name: "chat", run: async (p) => { await go(p, "AI agents"); await p.click("text=Open chatbot"); await wait(1500); } },
  // --- Interactive shots (read-only guard: nothing typed, answered or painted is ever saved).
  {
    name: "builder-prompt",
    guard: true,
    run: async (p) => {
      await go(p, "AI agents");
      await p.click("text=Create agent"); await wait(500);
      await p.click("text=Start from scratch"); await wait(500);
      await p.locator("input").first().fill("Exam from my notes");
      await p.locator("textarea").first().fill("Create a mixed exam with multiple-choice and open questions from my notes, with an answer key.");
      await p.locator("textarea").first().blur(); await wait(500);
    }
  },
  {
    name: "builder-inputs",
    guard: true,
    height: 1290,
    run: async (p) => {
      await go(p, "AI agents");
      await p.click("text=Create agent"); await wait(500);
      await p.click("text=Start from scratch"); await wait(500);
      await p.locator("input").first().fill("Exam from my notes");
      await p.locator("textarea").first().fill("Create a mixed exam with multiple-choice and open questions from my notes, with an answer key.");
      await p.locator('button:has-text("Next:")').first().click(); await wait(600);
      for (const label of ["Number of items", "Difficulty", "Language", "Include explanations"]) { await p.locator("button", { hasText: label }).first().click(); await wait(450); }
      await wait(600);
    }
  },
  {
    name: "quiz-answered",
    guard: true,
    // The top of the result (score + the first wrong answer with its source); the page is cut under the second question's options.
    clip: async () => ({ x: 0, y: 0, width: 1440, height: 812 }),
    run: async (p) => {
      await go(p, "Workspaces"); await p.click("text=Expand all"); await wait(500);
      await clickRowButton(p, "Quiz on Accounting Principles", "Open"); await wait(800);
      await p.locator("button", { hasText: /^(Start|Do it again)$/ }).first().click(); await wait(1500);
      // A believable attempt: most right, a couple wrong (so the marks and the source of the right answer show).
      for (const answer of ["Assets = Liabilities + Shareholder's Equity", "The allocation of the cost of a tangible asset over its useful life", "Total Assets / Total Liabilities", "It records only cash transactions", "To allocate the cost of an intangible asset over its useful life", "It shows better ability to pay short-term obligations"]) {
        await p.locator("button", { hasText: answer }).first().click(); await wait(200);
      }
      await p.locator("button:has-text('Check my answers')").first().click(); await wait(3000);
      await p.evaluate(() => { const box = document.querySelector("div.overflow-y-auto.flex-1"); if (box) box.scrollTop = 0; });
      await wait(600);
    }
  },
  {
    name: "reader-notes",
    guard: true,
    run: async (p) => {
      await go(p, "Workspaces"); await p.click("text=Expand all"); await wait(500);
      await clickRowButton(p, "Accounting.pdf", "Preview"); await wait(2500);
      p.setDefaultTimeout(10000);
      const select = async (re, block = "center") => {
        const find = (scroll) => p.evaluate(([src, scroll, block]) => {
          const rx = new RegExp(src);
          const walker = document.createTreeWalker(document.querySelector("article"), NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            const m = rx.exec(n.textContent);
            if (m) {
              if (scroll) { if (block === "top") { let box = n.parentElement; while (box && !(box.scrollHeight > box.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement; if (box) box.scrollTop = 0; } else n.parentElement.scrollIntoView({ block }); }
              const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
              const rects = r.getClientRects(); const a = rects[0], b = rects[rects.length - 1];
              return { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2 };
            }
          }
          return null;
        }, [re.source, scroll, block]);
        await find(true); await wait(300);
        const b = await find(false);
        if (!b) throw new Error("sentence not found: " + re);
        await p.mouse.move(b.x1, b.y1); await p.mouse.down(); await p.mouse.move(b.x2, b.y2, { steps: 12 }); await p.mouse.up(); await wait(450);
      };
      // Start from a clean page of notes (local to this throwaway browser: the guard keeps it off the account).
      const notesButton = p.locator("button", { hasText: /^✎\s*Notes/ }).first();
      await notesButton.click(); await wait(500);
      for (let i = 0; i < 12 && await p.locator("aside button:has-text('Delete')").count(); i += 1) { await p.locator("aside button:has-text('Delete')").first().click(); await wait(200); }
      const palette = p.locator("div.fixed.rounded-full").filter({ has: p.locator("button[aria-label='Highlight Green']") });
      await select(/Enterprise value estimation involves time-value of money, free-cashflow structure and cost of capital \(discount rate\) to bring money value back in time\./, "center");
      await palette.locator("button", { hasText: /Note/ }).click(); await wait(500);
      await p.locator("aside textarea").first().fill("EV = the whole business, not only the shareholders' part.");
      await select(/The big picture of an MBA: key firm activities and financial statements\./, "center");
      await palette.locator("button[aria-label='Highlight Green']").click(); await wait(500);
      await select(/For-profit firm goal is maximizing current shareholder value \(or market capitalization\)\./, "top");
      await wait(500);
    }
  },
  {
    // The answer key of a saved resource (slides view): each answer next to the passage of the document it comes from.
    name: "agent-answers",
    guard: true,
    clip: async (p) => p.evaluate(() => {
      const frame = document.querySelector("iframe");
      let panel = frame.parentElement;
      while (panel && !panel.querySelector("button") ) panel = panel.parentElement;
      while (panel && panel.parentElement && panel.parentElement.querySelectorAll("iframe").length === 1 && panel.getBoundingClientRect().width > 700) panel = panel.parentElement;
      const r = panel.getBoundingClientRect();
      const top = Math.max(0, r.top), bottom = Math.min(window.innerHeight, r.bottom);
      return { x: Math.round(r.left), y: Math.round(top), width: Math.round(r.width), height: Math.round(bottom - top) };
    }),
    run: async (p) => {
      await go(p, "Workspaces"); await p.click("text=Expand all"); await wait(500);
      await clickRowButton(p, "Quiz on Accounting Principles", "Open"); await wait(1200);
      await p.locator("button", { hasText: /^Format & colour$/ }).first().click(); await wait(2500);
      // The preview grid: Student view / Answer key rows x A4 / Letter / Slides columns. The last button is "Answer key, slides".
      const buttons = p.locator("button", { hasText: /^Show(ing)?$/ });
      // The page also lists them once per view; the preview grid is the first six, in reading order.
      await buttons.nth(5).click(); await wait(4000);
      await p.evaluate(() => document.querySelector("iframe").scrollIntoView({ block: "start" })); await wait(500);
      const frame = p.frames().find((f) => f !== p.mainFrame());
      await frame.evaluate(() => window.scrollTo(0, 420)); await wait(600);
    }
  },
  {
    name: "coach-read",
    guard: true,
    height: 1240,
    run: async (p) => {
      await cachedAnswer(p, "**/api/performance/coach", "coach-read.json");
      await go(p, "Performance"); await wait(1200);
      await p.locator("button", { hasText: /Read my results/ }).first().click();
      await p.waitForSelector("text=Your top 5 next actions", { timeout: 110000 });
      await wait(800);
      await p.evaluate(() => { const el = [...document.querySelectorAll("p, h2, h3")].find((n) => /^Luna.s read$/i.test((n.textContent || "").trim())); if (el) el.scrollIntoView({ block: "start" }); });
      await wait(600);
    }
  },
  // Phone shots (PWA bottom tabs).
  { name: "m-home", mobile: true, run: async (p) => { await openApp(p); } },
  { name: "m-workspaces", mobile: true, run: async (p, m) => { await go(p, "Workspaces", m); await wait(800); } },
  { name: "m-plans", mobile: true, run: async (p, m) => { await go(p, "Study plans", m); } },
  { name: "m-performance", mobile: true, run: async (p, m) => { await go(p, "Performance", m); } },
  { name: "m-agents", mobile: true, run: async (p, m) => { await go(p, "AI agents", m); } },
  { name: "m-chat", mobile: true, run: async (p, m) => { await go(p, "AI agents", m); await p.locator("button", { hasText: /Open\s+chatbot/ }).first().click(); await wait(1500); } }
];

/* ----------------------------------------------------------------------- image optimisation */
async function optimise(name, mobile) {
  const src = path.join(RAW, `${name}.png`);
  const widths = mobile ? [780] : [1000, 2000];
  for (const w of widths) {
    const file = path.join(OUT, `${name}-${w}.webp`);
    await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: w >= 1500 ? 80 : 78, effort: 5 }).toFile(file);
  }
  const meta = await sharp(src).metadata();
  return { width: meta.width, height: meta.height };
}

async function shoot(browser) {
  const sizes = {};
  for (const mobile of [false, true]) {
    const list = SHOTS.filter((s) => !!s.mobile === mobile && (!only.length || only.includes(s.name)));
    for (const shot of list) {
      const height = shot.height || (mobile ? 844 : 900);
      const ctx = await newContext(browser, { width: mobile ? 390 : 1440, height, scale: mobile ? 3 : 2, mobile, market: shot.market, guard: shot.guard });
      const page = await ctx.newPage();
      try {
        await openApp(page);
        await shot.run(page, mobile);
        await wait(700);
        await page.screenshot({ path: path.join(RAW, `${shot.name}.png`), ...(shot.clip ? { clip: await shot.clip(page) } : {}) });
        sizes[shot.name] = await optimise(shot.name, mobile);
        console.log("ok   ", shot.name, `${sizes[shot.name].width}x${sizes[shot.name].height}`);
      } catch (error) {
        console.log("FAIL ", shot.name, String(error.message || error).split("\n")[0]);
      }
      await ctx.close();
    }
  }
  // Record the sizes next to the images so the page can reserve space (no layout shift).
  const manifestPath = path.join(OUT, "manifest.json");
  let current = {};
  try { current = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* first run */ }
  fs.writeFileSync(manifestPath, JSON.stringify({ ...current, ...sizes }, null, 2) + "\n");
}

/* ----------------------------------------------------------------------- the walkthrough video */
async function glide(page, locator) {
  const box = await locator.first().boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 24), { steps: 18 });
  await wait(450);
}
async function recordVideo(browser) {
  fs.rmSync(path.join(RAW, "video"), { recursive: true, force: true });
  const ctx = await newContext(browser, { width: 1280, height: 800, scale: 1, video: true, cursor: true, market: true });
  const page = await ctx.newPage();
  await openApp(page);
  await page.mouse.move(640, 400);
  await wait(1800);

  const rail2 = async (label) => { const l = page.locator(`.nav-rail-item[aria-label="${label}"]`); await glide(page, l); await l.click(); await wait(1700); };
  const slowScroll = async (selector, to, ms = 2400) => {
    await page.evaluate(([sel, y, dur]) => new Promise((resolve) => {
      const el = (sel && document.querySelector(sel)) || document.scrollingElement;
      const start = el.scrollTop; const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / dur); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; el.scrollTop = start + (y - start) * e; k < 1 ? requestAnimationFrame(step) : resolve(); };
      requestAnimationFrame(step);
    }), [selector, to, ms]);
  };

  await rail2("Workspaces");
  const expand = page.locator("text=Expand all"); await glide(page, expand); await expand.click(); await wait(1600);
  const pdf = page.locator('button:has-text("Preview")').nth(1); await glide(page, pdf); await pdf.click(); await wait(2200);
  await slowScroll("", 520, 2600); await wait(900);
  const close = page.locator('button:has-text("Close")').first(); await glide(page, close); await close.click(); await wait(1200);

  await rail2("Study plans");
  await wait(900);
  const cal = page.locator("button", { hasText: /^Calendar$/ }).first(); await glide(page, cal); await cal.click(); await wait(2000);
  await rail2("Performance");
  await slowScroll(".main-pane", 520, 2800); await wait(1300);
  await rail2("AI agents");
  const run = page.locator("main button", { hasText: /^Run$/ }).first(); await glide(page, run); await wait(900);
  await rail2("Templates");
  const matrix = page.locator("button", { hasText: /^Matrix$/ }).first(); await glide(page, matrix); await matrix.click(); await wait(2000);
  await rail2("Marketplace");
  await wait(2200);
  await rail2("Home");
  await wait(1500);

  const videoPath = await page.video().path();
  await ctx.close();
  const webmRaw = videoPath;
  const run2 = (a) => execFileSync(ffmpegPath, ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
  run2(["-i", webmRaw, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-vf", "scale=1280:-2,fps=30", path.join(OUT, "hero.mp4")]);
  run2(["-i", webmRaw, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", "-vf", "scale=1280:-2,fps=30", path.join(OUT, "hero.webm")]);
  run2(["-i", webmRaw, "-ss", "1.2", "-frames:v", "1", path.join(RAW, "hero-poster.png")]);
  await sharp(path.join(RAW, "hero-poster.png")).webp({ quality: 78 }).toFile(path.join(OUT, "hero-poster.webp"));
  console.log("ok    video", (fs.statSync(path.join(OUT, "hero.mp4")).size / 1e6).toFixed(2) + " MB mp4");
}

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  if (!only.length || only.some((n) => n !== "video")) await shoot(browser);
  if (wantVideo) await recordVideo(browser);
} finally {
  await browser.close();
}
