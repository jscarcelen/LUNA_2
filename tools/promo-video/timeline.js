/* Luna promo video — the whole film as a pure function of time.
   window.renderAt(t) positions every layer for time t (seconds). window.__ready resolves once
   fonts and every screenshot are decoded. Stage is 1920x1080 and CSS-scaled to the render size. */
(function () {
  "use strict";
  const W = 1920, H = 1080;
  const LAND = "../../apps/web/public/landing/";
  const IMG = (n) => (n.startsWith("m-") ? `${LAND}${n}-780.webp` : `${LAND}${n}-2000.webp`);
  const ASPECT = { performance: 2880 / 2580 };
  const GRAD = "linear-gradient(100deg,#0a6cf0 5%,#37a8ff 50%,#2fcbb6 100%)";

  /* ------------------------------------------------------------------ maths */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const eo3 = (x) => 1 - Math.pow(1 - x, 3);
  const eo5 = (x) => 1 - Math.pow(1 - x, 5);
  const eoX = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const smooth = (x) => x * x * (3 - 2 * x);
  /* damped spring 0 -> 1 with ~4% overshoot, settles by x = 1 */
  const sp = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-7 * x) * Math.cos(2 * Math.PI * 1.1 * x));
  const spS = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-8 * x) * Math.cos(2 * Math.PI * 0.8 * x));

  /* ------------------------------------------------------------------ dom helpers */
  function el(tag, cls, parent, css, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (css) Object.assign(e.style, css);
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const UNITLESS = new Set(["fontWeight", "lineHeight", "opacity", "zIndex", "flex"]);
  function px(o) { const r = {}; for (const k in o) r[k] = typeof o[k] === "number" && !UNITLESS.has(k) ? o[k] + "px" : o[k]; return r; }
  function put(e, o = {}) {
    const { x = 0, y = 0, s = 1, sx, sy, r = 0, o: op = 1, c = false } = o;
    e.style.transform = `${c ? "translate(-50%,-50%) " : ""}translate(${x}px,${y}px) rotate(${r}deg) scale(${sx ?? s},${sy ?? s})`;
    e.style.opacity = op;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  const ICON = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    cards: '<rect x="3" y="7" width="14" height="11" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v9"/>',
    summary: '<path d="M5 7h14M5 12h14M5 17h9"/>',
    exam: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    steps: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
    trend: '<path d="M3 17l6-6 4 4 7-8"/><path d="M15 7h5v5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    student: '<path d="M3 9l9-4 9 4-9 4-9-4z"/><path d="M7 11v4.5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V11"/>',
    parent: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17.5" cy="10" r="2"/><path d="M16 15c2.5 0 4.5 1.5 4.5 4"/>',
    teacher: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.5-1.2-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-1.9-.4-2.5-1.2M12 6v2M12 16v2"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function icon(name, size, color, sw = 1.9) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
  }

  /* ------------------------------------------------------------------ brand mark (crescent + dot) */
  let markId = 0;
  function mark(parent, size, { white = false } = {}) {
    const id = ++markId;
    const wrap = el("div", "", parent, { position: "absolute", width: size + "px", height: size + "px" });
    const fill = white ? "#fff" : `url(#lg${id})`;
    wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" style="overflow:visible">
      <defs><linearGradient id="lg${id}" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0a6cf0"/><stop offset=".55" stop-color="#37a8ff"/><stop offset="1" stop-color="#2fcbb6"/></linearGradient>
      <mask id="mk${id}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80"><circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="50" pathLength="100" stroke-dasharray="0 101" transform="translate(64,0) scale(-1,1) rotate(-80 32 32)"/></mask></defs>
      <g mask="url(#mk${id})"><path d="M31.91 6A26 26 0 1 0 55.51 43.09A22 22 0 1 1 31.91 6Z" fill="${fill}"/></g>
      <circle cx="44.5" cy="25.5" r="4.6" fill="${white ? "#fff" : "#34c759"}" style="transform-box:fill-box;transform-origin:center;transform:scale(0)"/></svg>`;
    const sweep = wrap.querySelector("circle[mask], mask circle");
    const dot = wrap.querySelector("svg > circle");
    return {
      el: wrap,
      set(p, dotP = 1) { sweep.setAttribute("stroke-dasharray", `${clamp(p) * 101} 101`); dot.style.transform = `scale(${dotP})`; }
    };
  }

  /* ------------------------------------------------------------------ kinetic text */
  /* lines: array of strings; *word word* = brand gradient. Returns {box, update(lt, at, opts)} */
  function kText(parent, lines, { x = 0, y = 0, size = 120, weight = 800, lh = 1.04, align = "left", width = null, color = null, track = -0.045 } = {}) {
    const box = el("div", "kbox", parent, { left: x + "px", top: y + "px", fontSize: size + "px", fontWeight: weight, lineHeight: lh, letterSpacing: track + "em", textAlign: align });
    if (width) box.style.width = width + "px";
    if (color) box.style.color = color;
    const words = [];
    lines.forEach((line) => {
      const ln = el("div", "kline", box);
      let g = false;
      const toks = line.split(/(\*)| /).filter((s) => s !== undefined && s !== "");
      let first = true;
      toks.forEach((tk) => {
        if (tk === "*") { g = !g; return; }
        if (!first) el("span", "ksp", ln);
        first = false;
        const w = el("span", "kw", ln);
        const i = el("span", "kwi" + (g ? " g" : ""), w, null, tk);
        words.push(i);
      });
    });
    return {
      box, words,
      update(lt, at, { stagger = 0.09, dur = 0.75, out = null, outDur = 0.45, rise = 118 } = {}) {
        words.forEach((w, i) => {
          const a = at + i * stagger;
          const p = eoX(seg(lt, a, a + dur));
          let ty = (1 - p) * rise, rot = (1 - p) * 5, op = p > 0 ? 1 : 0;
          if (out != null) {
            const q = eio(seg(lt, out + i * 0.03, out + i * 0.03 + outDur));
            ty = lerp(ty, -rise, q); op = q >= 1 ? 0 : op;
          }
          w.style.transform = `translateY(${ty}%) rotate(${rot}deg)`;
          w.style.opacity = op;
        });
      }
    };
  }

  /* ------------------------------------------------------------------ devices */
  function browser(parent, { x, y, w, aspect = 1.6, shots, title = "luna2-share-web.vercel.app" }) {
    const barH = Math.round(w * 0.052);
    const bodyH = w / aspect;
    const root = el("div", "bw", parent, px({ left: x, top: y, width: w, height: barH + bodyH, borderRadius: w * 0.022 }));
    const bar = el("div", "bbar", root, px({ height: barH, paddingLeft: barH * 0.5, gap: barH * 0.2 }));
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c) => el("i", "", bar, px({ width: barH * 0.3, height: barH * 0.3, background: c })));
    const url = el("div", "burl", root, px({ top: barH / 2, height: barH * 0.6, padding: `0 ${barH * 0.4}px`, fontSize: barH * 0.32 }));
    url.innerHTML = `<svg width="${barH * 0.32}" height="${barH * 0.32}" viewBox="0 0 64 64"><path d="M31.91 6A26 26 0 1 0 55.51 43.09A22 22 0 1 1 31.91 6Z" fill="#0a6cf0"/><circle cx="44.5" cy="25.5" r="6" fill="#34c759"/></svg>${title}`;
    const vp = el("div", "bvp", root, px({ top: barH, height: bodyH }));
    const layers = shots.map((n) => {
      const asp = ASPECT[n] || 1.6;
      const pan = el("div", "pan", vp, px({ width: w, height: w / asp }));
      const img = el("img", "", pan);
      img.src = IMG(n);
      return { pan, img, name: n, asp, v: { z: 1, tx: 0, ty: 0 } };
    });
    function view(layer, z, fx, fy) {
      const Hh = w / layer.asp;
      z = Math.max(z, bodyH / Hh);
      let tx = w / 2 - fx * w * z, ty = bodyH / 2 - fy * Hh * z;
      tx = clamp(tx, Math.min(0, w - w * z), 0);
      ty = clamp(ty, Math.min(0, bodyH - Hh * z), 0);
      layer.v = { z, tx, ty };
      layer.pan.style.transform = `translate(${tx}px,${ty}px) scale(${z})`;
    }
    /* image-normalised point -> viewport px */
    function toVp(layer, nx, ny) {
      const Hh = w / layer.asp, { z, tx, ty } = layer.v;
      return { x: tx + nx * w * z, y: ty + ny * Hh * z };
    }
    return { root, vp, layers, view, toVp, barH, bodyH, w, h: barH + bodyH };
  }

  function phone(parent, { x, y, w, shot }) {
    const b = w * 0.045, h = w * (2532 / 1170);
    const root = el("div", "ph", parent, px({ left: x, top: y, width: w, height: h + b * 2 - 0, borderRadius: w * 0.17 }));
    const scr = el("div", "phs", root, px({ left: b, top: b, width: w - b * 2, height: h + b * 2 - b * 2, borderRadius: w * 0.135 }));
    scr.style.height = (w - b * 2) * (2532 / 1170) + "px";
    root.style.height = (w - b * 2) * (2532 / 1170) + b * 2 + "px";
    const img = el("img", "", scr);
    img.src = IMG(shot);
    el("div", "phi", root, px({ top: b + w * 0.03, width: w * 0.28, height: w * 0.075 }));
    return { root, w, h: parseFloat(root.style.height) };
  }

  /* ------------------------------------------------------------------ chips, meters, papers */
  function chip(parent, label, { size = 44, color = "#0a6cf0", ic = null, dot = null, bg = null, textColor = null } = {}) {
    const pad = size * 0.5;
    const c = el("div", "chip", parent, px({ fontSize: size, height: size * 1.95, padding: `0 ${size * 0.75}px 0 ${ic || dot ? size * 0.45 : size * 0.75}px` }));
    if (bg) c.style.background = bg;
    if (textColor) c.style.color = textColor;
    if (ic) el("span", "ico", c, px({ width: size * 1.15, height: size * 1.15, background: color + "1f" }), icon(ic, size * 0.68, color, 2.1));
    else if (dot) el("span", "dot", c, px({ width: size * 0.48, height: size * 0.48, background: dot }));
    el("span", "", c, null, label);
    return c;
  }
  function paper(parent, label, color, { w = 200, h = 252 } = {}) {
    const p = el("div", "paper", parent, px({ width: w, height: h }));
    const hd = el("div", "", p, px({ height: h * 0.3, background: color + "22", display: "flex", alignItems: "center", padding: "0 22px", marginBottom: 22 }));
    el("b", "", hd, px({ fontSize: w * 0.17, color }), label);
    el("u", "", p); el("u", "", p, { width: "70%" }); el("u", "", p, { width: "84%" });
    return p;
  }

  /* ------------------------------------------------------------------ scene scaffolding */
  const stage = document.getElementById("stage");
  const scenes = [];
  const CHROME = el("div", "", stage); CHROME.id = "chrome";
  let TIMING = null, B = [], TR = [];

  function bgMesh(root, base, blobs) {
    root.style.background = base;
    const list = blobs.map((b) => {
      const e = el("div", "bgblob", root, px({ width: b.r * 2, height: b.r * 2, left: b.x - b.r, top: b.y - b.r, background: `radial-gradient(circle, ${b.c} 0%, rgba(255,255,255,0) 68%)` }));
      return { e, b };
    });
    return (lt) => list.forEach(({ e, b }, i) => {
      e.style.transform = `translate(${Math.sin(lt * 0.35 + i * 2.1) * 70}px,${Math.cos(lt * 0.3 + i * 1.7) * 55}px)`;
    });
  }
  const BLUE = "rgba(10,108,240,.17)", TEAL = "rgba(47,203,182,.2)", GREEN = "rgba(52,199,89,.12)", SKY = "rgba(55,168,255,.18)";

  function makeScene(build) {
    const s = { el: el("div", "scene", stage), upd: [] };
    build(s);
    scenes.push(s);
    return s;
  }
  const bob = (lt, ph, amp = 7) => Math.sin(lt * 1.9 + ph) * amp;
  function popChip(c, lt, at, { x, y, r = 0, from = 40, s0 = 0.5, center = false }) {
    const e = sp(seg(lt, at, at + 0.65));
    const o = seg(lt, at, at + 0.14);
    put(c, { x: x, y: y + (1 - e) * from + (e >= 1 ? bob(lt, x * 0.01) : 0), s: lerp(s0, 1, e), r: r * (0.6 + 0.4 * e), o, c: center });
  }

  /* ================================================================== SCENES */

  /* ---- 1 HOOK ---- */
  function buildHook(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#f6f9ff", [{ x: 300, y: 250, r: 700, c: BLUE }, { x: 1650, y: 850, r: 760, c: TEAL }, { x: 1700, y: 150, r: 420, c: SKY }]);
    const tint = el("div", "abs", r, { inset: 0, opacity: 0 });
    const flicks = [
      { t: "Notes.", c: "#0a6cf0", at: 0.12 }, { t: "PDFs.", c: "#ff453a", at: 0.58 },
      { t: "Slides.", c: "#ff9f0a", at: 1.04 }, { t: "Deadlines.", c: "#12b5a0", at: 1.5 }
    ];
    const papers = [
      { l: "PDF", c: "#ff453a", x: 230, y: 210, r: -9, d: 0.1 }, { l: "DOCX", c: "#0a6cf0", x: 1690, y: 200, r: 8, d: 0.28 },
      { l: "PPTX", c: "#ff9f0a", x: 200, y: 820, r: 7, d: 0.46 }, { l: "NOTES", c: "#12b5a0", x: 1700, y: 830, r: -8, d: 0.64 },
      { l: "EXAM", c: "#7a5af8", x: 640, y: 120, r: 6, d: 0.8, s: 0.82 }, { l: "Σ", c: "#0a6cf0", x: 1330, y: 960, r: -6, d: 0.95, s: 0.82 },
      { l: "24 OCT", c: "#ff453a", x: 120, y: 520, r: -5, d: 1.1, s: 0.75 }, { l: "SLIDES", c: "#ff9f0a", x: 1810, y: 520, r: 6, d: 1.25, s: 0.75 }
    ].map((p) => ({ ...p, el: paper(r, p.l, p.c, { w: 200, h: 252 }) }));
    const words = flicks.map((f) => {
      const e = el("div", "kbox", r, { left: 0, top: 0, width: W + "px", textAlign: "center", fontSize: "250px", fontWeight: 850, color: f.c, lineHeight: 1, top: "400px" }, f.t);
      return { e, f };
    });
    const ring = el("div", "abs", r, { width: "330px", height: "330px", left: W / 2 - 165 + "px", top: H / 2 - 165 + "px", borderRadius: "50%", border: "6px solid #37a8ff" });
    const lm = mark(r, 330); lm.el.style.left = W / 2 - 165 + "px"; lm.el.style.top = H / 2 - 165 + "px";
    const slogan = kText(r, ["Your AI educational", "*ecosystem.*"], { x: 0, y: 392, size: 150, align: "center", width: W, lh: 1.06 });
    const sub = kText(r, ["One place to learn — for students, teachers and parents."], { x: 0, y: 790, size: 54, weight: 600, align: "center", width: W, color: "#4a4d52", track: -0.02 });
    s.upd.push((lt) => {
      bgU(lt);
      /* tint flicks */
      let ti = 0, tc = "#fff";
      flicks.forEach((f, i) => { if (lt >= f.at) { ti = lt < 1.95 ? 0.055 : 0; tc = f.c; } });
      tint.style.background = tc; tint.style.opacity = ti;
      /* papers float in, then get sucked into the centre */
      const conv = eio(seg(lt, 1.85, 2.35));
      papers.forEach((p, i) => {
        const e = sp(seg(lt, p.d, p.d + 0.6));
        const fx = Math.sin(lt * 1.3 + i) * 10, fy = Math.cos(lt * 1.1 + i * 1.7) * 14;
        const cx = lerp(p.x + fx, W / 2, conv), cy = lerp(p.y + fy, H / 2, conv);
        put(p.el, { x: cx - 100, y: cy - 126, s: lerp((p.s || 1) * e, 0.15, conv), r: lerp(p.r, p.r * 3, conv), o: lt < p.d ? 0 : 1 - smooth(seg(lt, 2.15, 2.4)) });
      });
      /* flicking words */
      words.forEach(({ e, f }, i) => {
        const end = i < words.length - 1 ? flicks[i + 1].at : 1.92;
        const inP = eoX(seg(lt, f.at, f.at + 0.2));
        const outP = seg(lt, end - 0.06, end + 0.12);
        const vis = lt >= f.at && lt < end + 0.14;
        const sc = lerp(1.35, 1, inP) * lerp(1, i === words.length - 1 ? 0.2 : 0.86, eio(outP));
        e.style.opacity = vis ? (inP < 0.05 ? inP * 20 : 1) * (1 - smooth(outP)) : 0;
        e.style.transform = `scale(${sc}) translateY(${(1 - inP) * 24 - outP * -30}px) rotate(${(1 - inP) * (i % 2 ? -3 : 3)}deg)`;
      });
      /* logo reveal */
      const sw = eio(seg(lt, 2.15, 2.95));
      const dotP = sp(seg(lt, 2.85, 3.4));
      lm.set(sw, dotP);
      const grow = sp(seg(lt, 2.1, 2.9));
      const mv = eio(seg(lt, 3.2, 3.85));
      const sc = lerp(lerp(0.55, 1, grow), 0.5, mv);
      lm.el.style.transform = `translateY(${-mv * 320}px) scale(${sc}) rotate(${(1 - sw) * -28}deg)`;
      lm.el.style.opacity = seg(lt, 2.1, 2.3);
      const rp = seg(lt, 2.85, 3.6);
      ring.style.opacity = rp > 0 && rp < 1 ? (1 - rp) * 0.8 : 0;
      ring.style.transform = `scale(${1 + eo3(rp) * 1.1})`;
      slogan.update(lt, 3.55, { stagger: 0.16, dur: 0.8 });
      sub.update(lt, 4.35, { stagger: 0.035, dur: 0.6, rise: 100 });
    });
  }

  /* ---- 2 UPLOAD ---- */
  function buildUpload(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#f4f9ff", [{ x: 1500, y: 300, r: 800, c: SKY }, { x: 200, y: 950, r: 700, c: TEAL }, { x: 900, y: 100, r: 400, c: GREEN }]);
    const head = kText(r, ["Upload", "anything."], { x: 110, y: 200, size: 138, lh: 1.02 });
    const sub = kText(r, ["Luna reads every", "formula, table", "and figure."], { x: 114, y: 520, size: 62, weight: 640, lh: 1.16, color: "#4a4d52", track: -0.025 });
    const br = browser(r, { x: 900, y: 165, w: 940, aspect: 1.3, shots: ["workspaces", "reader"] });
    const [lw, lr] = br.layers;
    const ph = phone(r, { x: 1620, y: 600, w: 250, shot: "m-workspaces" });
    const files = [
      { l: "Lecture.pdf", c: "#ff453a", t: 0.9 }, { l: "Notes.docx", c: "#0a6cf0", t: 1.15 },
      { l: "Slides.pptx", c: "#ff9f0a", t: 1.4 }, { l: "Scan.jpg", c: "#12b5a0", t: 1.65 }
    ].map((f) => ({ ...f, el: chip(r, f.l, { size: 38, dot: f.c }) }));
    const call = [
      { l: "Formulas", ic: "sigma", c: "#0a6cf0", t: 2.9, x: 800, y: 700 },
      { l: "Tables", ic: "table", c: "#12b5a0", t: 3.3, x: 1130, y: 100 },
      { l: "Figures", ic: "image", c: "#ff9f0a", t: 3.7, x: 1480, y: 125 }
    ].map((c) => ({ ...c, el: chip(r, c.l, { size: 42, ic: c.ic, color: c.c }) }));
    br.view(lw, 1, 0.5, 0.5); br.view(lr, 1, 0.5, 0.5);
    s.upd.push((lt) => {
      bgU(lt);
      head.update(lt, 0.5, { stagger: 0.16, dur: 0.85 });
      sub.update(lt, 1.7, { stagger: 0.07, dur: 0.7 });
      const e = spS(seg(lt, 0.35, 1.25));
      put(br.root, { x: (1 - e) * 340, y: bob(lt, 0, 5) * 0.4, s: lerp(0.9, 1, e), o: seg(lt, 0.3, 0.6) });
      /* screens: workspaces -> reader (formulas) */
      const sw = eio(seg(lt, 2.5, 3.1));
      lw.pan.style.opacity = 1 - sw; lr.pan.style.opacity = sw;
      br.view(lw, lerp(1.2, 1.55, seg(lt, 0.4, 3.2)), 0.45, lerp(0.3, 0.45, seg(lt, 0.4, 3.2)));
      br.view(lr, lerp(1.25, 1.5, seg(lt, 2.5, 6.4)), 0.5, lerp(0.36, 0.46, seg(lt, 2.5, 6.4)));
      const pe = spS(seg(lt, 1.0, 1.9));
      put(ph.root, { x: 0, y: (1 - pe) * 700 + bob(lt, 1, 6), s: 1, r: -4 * pe + 0, o: seg(lt, 1.0, 1.2) });
      files.forEach((f) => {
        const p = seg(lt, f.t, f.t + 0.95);
        if (p <= 0 || p >= 1) { put(f.el, { o: 0 }); return; }
        const k = eio(p);
        const sx = 190, sy = 880 - (f.t - 0.9) * 120, ex = 1370, ey = 520;
        const xx = lerp(sx, ex, k), yy = lerp(sy, ey, k) - Math.sin(k * Math.PI) * 190;
        put(f.el, { x: xx, y: yy, s: lerp(1, 0.4, smooth(seg(p, 0.55, 1))), r: (1 - k) * -8, o: Math.min(1, p * 8) * (1 - smooth(seg(p, 0.8, 1))), c: false });
      });
      call.forEach((c) => popChip(c.el, lt, c.t, { x: c.x, y: c.y, r: -3 }));
    });
  }

  /* ---- 3 PLAN ---- */
  function buildPlan(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#f7fbfa", [{ x: 300, y: 400, r: 760, c: TEAL }, { x: 1700, y: 900, r: 740, c: BLUE }, { x: 1500, y: 100, r: 400, c: GREEN }]);
    const head = kText(r, ["Your deadline.", "Your plan.", "*In seconds.*"], { x: 1030, y: 250, size: 118, lh: 1.06 });
    const br = browser(r, { x: 90, y: 175, w: 890, aspect: 1.3, shots: ["plans", "calendar"] });
    const [lp, lc] = br.layers;
    const chips = [
      { l: "Exam · 24 Oct", ic: "calendar", c: "#ff453a", t: 1.6, x: 70, y: 835 },
      { l: "8 steps", ic: "steps", c: "#0a6cf0", t: 2.3, x: 470, y: 860 },
      { l: "On track", ic: "trend", c: "#34c759", t: 3.0, x: 715, y: 810 }
    ].map((c) => ({ ...c, el: chip(r, c.l, { size: 40, ic: c.ic, color: c.c }) }));
    const tag = kText(r, ["A plan for every exam,", "built from your material."], { x: 1034, y: 690, size: 54, weight: 600, lh: 1.2, color: "#4a4d52", track: -0.02 });
    br.view(lp, 1, 0.5, 0.5); br.view(lc, 1, 0.5, 0.5);
    s.upd.push((lt) => {
      bgU(lt);
      head.update(lt, 0.55, { stagger: 0.1, dur: 0.8 });
      tag.update(lt, 2.4, { stagger: 0.06, dur: 0.7, rise: 100 });
      const e = spS(seg(lt, 0.3, 1.2));
      put(br.root, { x: (1 - e) * -300, y: 0, s: lerp(0.92, 1, e), o: seg(lt, 0.25, 0.5) });
      const sw = eio(seg(lt, 3.4, 4.0));
      lp.pan.style.opacity = 1 - sw; lc.pan.style.opacity = sw;
      br.view(lp, lerp(1.2, 1.55, eio(seg(lt, 0.4, 3.9))), lerp(0.5, 0.62, seg(lt, 0.4, 3.9)), lerp(0.25, 0.3, seg(lt, 0.4, 3.9)));
      br.view(lc, lerp(1.2, 1.6, seg(lt, 3.4, 7.2)), lerp(0.3, 0.7, seg(lt, 3.4, 7.2)), lerp(0.35, 0.55, seg(lt, 3.4, 7.2)));
      chips.forEach((c) => popChip(c.el, lt, c.t, { x: c.x, y: c.y, r: -3 }));
    });
  }

  /* ---- 4 GENERATE ---- */
  function buildGenerate(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#f5f8ff", [{ x: 1500, y: 800, r: 800, c: BLUE }, { x: 200, y: 200, r: 600, c: SKY }, { x: 900, y: 1000, r: 500, c: TEAL }]);
    const head = kText(r, ["Generate", "study", "*resources.*"], { x: 110, y: 130, size: 126, lh: 1.04 });
    const br = browser(r, { x: 830, y: 120, w: 1030, aspect: 1.3, shots: ["agents", "agent-run", "template-preview"] });
    const [la, lr, lt3] = br.layers;
    const chips = [
      { l: "Quizzes", ic: "quiz", c: "#0a6cf0", x: 110, y: 565, t: 1.2 }, { l: "Flashcards", ic: "cards", c: "#12b5a0", x: 410, y: 565, t: 1.55 },
      { l: "Summaries", ic: "summary", c: "#ff9f0a", x: 110, y: 700, t: 1.9 }, { l: "Exams", ic: "exam", c: "#7a5af8", x: 470, y: 700, t: 2.25 }
    ].map((c) => ({ ...c, el: chip(r, c.l, { size: 46, ic: c.ic, color: c.c }) }));
    const stmt = kText(r, ["Accelerate creation.", "*Focus on learning.*"], { x: 114, y: 870, size: 62, weight: 760, lh: 1.1, track: -0.035 });
    br.view(la, 1, 0.5, 0.5); br.view(lr, 1, 0.5, 0.5); br.view(lt3, 1, 0.5, 0.5);
    s.upd.push((lt) => {
      bgU(lt);
      head.update(lt, 0.45, { stagger: 0.13, dur: 0.85 });
      stmt.update(lt, 4.4, { stagger: 0.1, dur: 0.8 });
      const e = spS(seg(lt, 0.3, 1.2));
      put(br.root, { x: (1 - e) * 360, y: (1 - e) * 80, s: lerp(0.9, 1, e), o: seg(lt, 0.25, 0.5) });
      const s1 = eio(seg(lt, 2.9, 3.4)), s2 = eio(seg(lt, 5.3, 5.8));
      la.pan.style.opacity = 1 - s1;
      lr.pan.style.opacity = s1 * (1 - s2);
      lt3.pan.style.opacity = s2;
      br.view(la, lerp(1.0, 1.45, seg(lt, 0.4, 3.4)), lerp(0.3, 0.45, seg(lt, 0.4, 3.4)), lerp(0.25, 0.4, seg(lt, 0.4, 3.4)));
      br.view(lr, lerp(1.1, 1.6, seg(lt, 2.9, 5.8)), lerp(0.35, 0.5, seg(lt, 2.9, 5.8)), lerp(0.3, 0.55, seg(lt, 2.9, 5.8)));
      br.view(lt3, lerp(1.1, 1.5, seg(lt, 5.3, 8)), 0.5, lerp(0.35, 0.5, seg(lt, 5.3, 8)));
      chips.forEach((c) => popChip(c.el, lt, c.t, { x: c.x, y: c.y, r: -2, from: 50 }));
    });
  }

  /* ---- 5 LEARN ---- */
  function buildLearn(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#f9fbff", [{ x: 200, y: 900, r: 700, c: GREEN }, { x: 1500, y: 150, r: 800, c: SKY }, { x: 700, y: 500, r: 400, c: TEAL }]);
    const head = kText(r, ["Answer", "inside", "*Luna.*"], { x: 110, y: 170, size: 140, lh: 1.02 });
    const sub = kText(r, ["Every answer shows", "how you learn best."], { x: 114, y: 720, size: 58, weight: 640, lh: 1.16, color: "#4a4d52", track: -0.025 });
    const br = browser(r, { x: 790, y: 110, w: 1050, aspect: 1.25, shots: ["quiz"] });
    const [lq] = br.layers;
    /* overlays in image-normalised coordinates (quiz screenshot, 1000x625 reference) */
    const OPT = [
      { x: 0.28, y: 0.29, w: 0.232, h: 0.048, t: 2.4 }, /* Q1 A */
      { x: 0.28, y: 0.493, w: 0.232, h: 0.064, t: 4.1 } /* Q2 A */
    ];
    const hl = OPT.map((o) => {
      const d = el("div", "abs", lq.pan, { left: o.x * 100 + "%", top: o.y * 100 + "%", width: o.w * 100 + "%", height: o.h * 100 + "%", borderRadius: "999px", border: "0px solid #34c759", background: "rgba(52,199,89,0)" });
      d.style.borderRadius = "18px";
      const tick = el("div", "abs", d, { right: "10px", top: "50%", marginTop: "-14px", width: "28px", height: "28px", borderRadius: "50%", background: "#34c759", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0 }, icon("check", 18, "#fff", 3.2));
      return { d, tick, o };
    });
    const cur = el("div", "abs", br.vp, { left: 0, top: 0, width: "60px", height: "60px", zIndex: 5 });
    cur.innerHTML = '<svg width="56" height="56" viewBox="0 0 24 24"><path d="M5 3l14 8-6.2 1.5L10 19z" fill="#1d1d1f" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ripple = el("div", "abs", br.vp, { width: "90px", height: "90px", borderRadius: "50%", border: "5px solid #0a6cf0", opacity: 0, zIndex: 4 });
    const saved = chip(r, "Saved to your progress", { size: 42, ic: "trend", color: "#34c759" });
    const score = chip(r, "Correct", { size: 42, ic: "check", color: "#34c759" });
    br.view(lq, 1.4, 0.5, 0.25);
    s.upd.push((lt) => {
      bgU(lt);
      head.update(lt, 0.5, { stagger: 0.14, dur: 0.85 });
      sub.update(lt, 3.5, { stagger: 0.09, dur: 0.75 });
      const e = spS(seg(lt, 0.3, 1.2));
      put(br.root, { x: (1 - e) * 400, y: 0, s: lerp(0.92, 1, e), o: seg(lt, 0.25, 0.5) });
      const zz = lerp(1.45, 1.8, eio(seg(lt, 0.5, 7)));
      const fy = lerp(0.22, 0.34, seg(lt, 2.5, 6.5));
      br.view(lq, zz, 0.5, fy);
      /* cursor path: enters, clicks Q1-A, then Q2-A */
      const a1 = br.toVp(lq, OPT[0].x + OPT[0].w * 0.6, OPT[0].y + OPT[0].h * 0.55);
      const a2 = br.toVp(lq, OPT[1].x + OPT[1].w * 0.6, OPT[1].y + OPT[1].h * 0.55);
      const start = { x: br.w * 0.95, y: br.bodyH * 0.9 };
      let cx, cy;
      if (lt < 2.4) { const k = eio(seg(lt, 1.2, 2.3)); cx = lerp(start.x, a1.x, k); cy = lerp(start.y, a1.y, k); }
      else if (lt < 4.1) { const k = eio(seg(lt, 2.9, 4.0)); cx = lerp(a1.x, a2.x, k); cy = lerp(a1.y, a2.y, k); }
      else { cx = a2.x; cy = a2.y + seg(lt, 4.3, 6) * 30; }
      cur.style.transform = `translate(${cx - 8}px,${cy - 6}px) scale(${1 - 0.15 * Math.max(clamp(1 - Math.abs(lt - 2.4) / 0.12), clamp(1 - Math.abs(lt - 4.1) / 0.12))})`;
      cur.style.opacity = seg(lt, 1.2, 1.5);
      const rp = [seg(lt, 2.4, 3.0), seg(lt, 4.1, 4.7)];
      const rr = rp[0] > 0 && rp[0] < 1 ? { p: rp[0], at: a1 } : rp[1] > 0 && rp[1] < 1 ? { p: rp[1], at: a2 } : null;
      if (rr) { ripple.style.opacity = 0.8 * (1 - rr.p); ripple.style.transform = `translate(${rr.at.x - 45}px,${rr.at.y - 45}px) scale(${0.4 + rr.p * 1.6})`; } else ripple.style.opacity = 0;
      hl.forEach(({ d, tick, o }) => {
        const k = sp(seg(lt, o.t, o.t + 0.5));
        d.style.background = `rgba(52,199,89,${0.16 * k})`;
        d.style.borderWidth = 4 * k + "px";
        d.style.boxShadow = k > 0 ? `0 0 0 ${10 * (1 - k)}px rgba(52,199,89,${0.3 * (1 - k)})` : "none";
        tick.style.opacity = k; tick.style.transform = `scale(${k})`;
      });
      popChip(score, lt, 2.7, { x: 1520, y: 120, r: 2 });
      popChip(saved, lt, 5.2, { x: 1160, y: 905, r: -2 });
    });
  }

  /* ---- 6 TRACK ---- */
  function buildTrack(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#f8fafd", [{ x: 1700, y: 200, r: 800, c: BLUE }, { x: 300, y: 950, r: 700, c: TEAL }, { x: 1000, y: 500, r: 450, c: GREEN }]);
    /* part A */
    const gl = el("div", "abs", r, { inset: 0 }), gr = el("div", "abs", r, { inset: 0 });
    const head = kText(gl, ["Track", "performance.", "*Know why.*"], { x: 110, y: 120, size: 112, lh: 1.04 });
    const br = browser(gr, { x: 1000, y: 110, w: 820, aspect: 2880 / 2580, shots: ["performance"] });
    const [lp] = br.layers;
    const meters = [
      { l: "Topic knowledge", v: 83, c: "#ff453a", t: 1.5 }, { l: "Analytical", v: 11, c: "#ff9f0a", t: 1.95 }, { l: "Accuracy", v: 6, c: "#0a6cf0", t: 2.4 }
    ].map((m, i) => {
      const card = el("div", "card", gl, px({ left: 110, top: 580 + i * 128, width: 700, height: 108, borderRadius: 54 }));
      el("div", "abs", card, px({ left: 40, top: 24, fontSize: 40, fontWeight: 720, letterSpacing: "-0.02em" }), m.l);
      const num = el("div", "abs", card, px({ right: 44, top: 24, fontSize: 40, fontWeight: 800, color: m.c, letterSpacing: "-0.02em" }), "0%");
      const track = el("div", "meter-track", card, px({ left: 40, right: 40, top: 80, height: 12 }));
      const fill = el("div", "meter-fill", track, { background: m.c, width: "0%" });
      return { ...m, card, num, fill };
    });
    /* part B */
    const gb = el("div", "abs", r, { inset: 0 });
    const head2 = kText(gb, ["One view for every role."], { x: 0, y: 105, size: 100, align: "center", width: W, lh: 1.05 });
    const roles = [
      { who: "Students", txt: "know what to fix", ic: "student", c: "#0a6cf0", t: 5.2 },
      { who: "Teachers", txt: "see every class and group", ic: "teacher", c: "#12b5a0", t: 5.5 },
      { who: "Parents", txt: "know how to help", ic: "parent", c: "#34c759", t: 5.8 }
    ].map((m, i) => {
      const card = el("div", "card", gb, px({ left: 120 + i * 570, top: 290, width: 540, height: 600, borderRadius: 52 }));
      el("div", "abs", card, px({ left: 48, top: 48, width: 120, height: 120, borderRadius: 60, background: m.c + "1f", display: "flex", alignItems: "center", justifyContent: "center" }), icon(m.ic, 66, m.c, 1.8));
      el("div", "abs", card, px({ left: 48, top: 214, fontSize: 72, fontWeight: 820, letterSpacing: "-0.04em", color: m.c }), m.who + ":");
      el("div", "abs", card, px({ left: 48, top: 318, width: 460, fontSize: 64, fontWeight: 720, letterSpacing: "-0.035em", lineHeight: 1.12 }), m.txt);
      return { ...m, card };
    });
    br.view(lp, 1, 0.5, 0.5);
    s.upd.push((lt) => {
      bgU(lt);
      const exit = eio(seg(lt, 4.15, 4.9));
      gl.style.transform = `translateX(${-exit * 700}px)`; gl.style.opacity = 1 - smooth(seg(lt, 4.3, 4.9));
      gr.style.transform = `translateX(${exit * 900}px)`; gr.style.opacity = 1 - smooth(seg(lt, 4.3, 4.9));
      gl.style.display = gr.style.display = exit >= 1 ? "none" : "block";
      gb.style.display = lt < 4.7 ? "none" : "block";
      head.update(lt, 0.5, { stagger: 0.14, dur: 0.85 });
      const e = spS(seg(lt, 0.3, 1.2));
      put(br.root, { x: (1 - e) * 380, y: 0, s: lerp(0.92, 1, e), o: seg(lt, 0.25, 0.5) });
      br.view(lp, lerp(1.2, 1.7, eio(seg(lt, 0.8, 4.2))), 0.5, lerp(0.22, 0.86, eio(seg(lt, 0.8, 4.2))));
      meters.forEach((m) => {
        const p = sp(seg(lt, m.t, m.t + 0.8));
        put(m.card, { x: (1 - p) * -120, o: seg(lt, m.t, m.t + 0.2), s: 1 });
        const f = eo5(seg(lt, m.t + 0.1, m.t + 1.5));
        m.fill.style.width = m.v * f + "%";
        m.num.textContent = Math.round(m.v * f) + "%";
      });
      head2.update(lt, 4.85, { stagger: 0.07, dur: 0.7 });
      roles.forEach((m, i) => {
        const p = sp(seg(lt, m.t, m.t + 0.75));
        put(m.card, { y: (1 - p) * 160 + (p >= 1 ? bob(lt, i * 2, 6) : 0), s: lerp(0.85, 1, p), r: (1 - p) * (i - 1) * 4, o: seg(lt, m.t, m.t + 0.2) });
      });
    });
  }

  /* ---- 7 SHARE ---- */
  function buildShare(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#f6fbfa", [{ x: 1450, y: 600, r: 820, c: TEAL }, { x: 150, y: 150, r: 600, c: SKY }, { x: 700, y: 1000, r: 500, c: GREEN }]);
    const head = kText(r, ["Share resources.", "*Connect everyone.*"], { x: 110, y: 110, size: 108, lh: 1.04 });
    const sub = kText(r, ["Folders, plans and agents —", "shared live."], { x: 114, y: 370, size: 56, weight: 640, lh: 1.18, color: "#4a4d52", track: -0.025 });
    const p1 = phone(r, { x: 110, y: 600, w: 370, shot: "m-chat" });
    const p2 = phone(r, { x: 450, y: 690, w: 370, shot: "m-home" });
    const N = {
      teacher: { x: 1440, y: 345, c: "#12b5a0", ic: "teacher", l: "Teacher", t: 0.5 },
      student: { x: 1180, y: 770, c: "#0a6cf0", ic: "student", l: "Student", t: 0.7 },
      parent: { x: 1700, y: 770, c: "#34c759", ic: "parent", l: "Parent", t: 0.9 }
    };
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H); svg.style.cssText = "position:absolute;left:0;top:0";
    svg.innerHTML = '<defs><linearGradient id="ln" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a6cf0"/><stop offset="1" stop-color="#2fcbb6"/></linearGradient></defs>';
    r.appendChild(svg);
    const pairs = [["student", "teacher"], ["teacher", "parent"], ["parent", "student"]];
    const lines = pairs.map(([a, b], i) => {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", N[a].x); l.setAttribute("y1", N[a].y); l.setAttribute("x2", N[b].x); l.setAttribute("y2", N[b].y);
      l.setAttribute("stroke", "url(#ln)"); l.setAttribute("stroke-width", 7); l.setAttribute("stroke-linecap", "round"); l.setAttribute("pathLength", "100");
      l.setAttribute("stroke-dasharray", "0 100"); l.style.opacity = "0.9";
      svg.appendChild(l);
      return l;
    });
    const nodes = Object.entries(N).map(([k, n]) => {
      const e = el("div", "abs", r, px({ left: n.x - 100, top: n.y - 100, width: 200, height: 200, borderRadius: 100, background: "#fff", boxShadow: `0 30px 60px -20px ${n.c}77, 0 0 0 8px ${n.c}22, 0 0 0 1.5px rgba(0,0,0,.05)`, display: "flex", alignItems: "center", justifyContent: "center" }), icon(n.ic, 96, n.c, 1.7));
      const lab = el("div", "abs", r, px({ left: n.x - 150, top: n.y + 116, width: 300, textAlign: "center", fontSize: 42, fontWeight: 760, letterSpacing: "-0.02em" }), n.l);
      const ring = el("div", "abs", r, px({ left: n.x - 100, top: n.y - 100, width: 200, height: 200, borderRadius: 100, border: `6px solid ${n.c}`, opacity: 0 }));
      return { k, n, e, lab, ring };
    });
    const doc = el("div", "paper", r, px({ width: 170, height: 210, borderRadius: 24 }));
    const docIc = el("div", "", doc, px({ height: 92, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a6cf01f", marginBottom: 16 }));
    const docLab = el("b", "", doc, px({ fontSize: 30, padding: "0 20px", color: "#1d1d1f" }), "Folder");
    el("u", "", doc, { width: "60%", marginTop: "12px" });
    const legs = [
      { a: "student", b: "teacher", t: 2.0, d: 0.9, l: "Folder", ic: "folder", c: "#0a6cf0", chip: "Folder shared", cx: 1470, cy: 215 },
      { a: "teacher", b: "parent", t: 3.2, d: 0.9, l: "Plan", ic: "calendar", c: "#12b5a0", chip: "Study plan", cx: 1700, cy: 600 },
      { a: "parent", b: "student", t: 4.4, d: 0.9, l: "Agent", ic: "spark", c: "#7a5af8", chip: "Agent", cx: 1180, cy: 600 }
    ];
    legs.forEach((g) => { g.el = chip(r, g.chip, { size: 40, ic: g.ic, color: g.c }); });
    const dots = lines.map(() => el("div", "abs", r, px({ width: 22, height: 22, borderRadius: 11, background: "#0a6cf0", left: -11, top: -11, opacity: 0 })));
    s.upd.push((lt) => {
      bgU(lt);
      head.update(lt, 0.5, { stagger: 0.12, dur: 0.85 });
      sub.update(lt, 1.5, { stagger: 0.07, dur: 0.7 });
      [p1, p2].forEach((p, i) => {
        const e = spS(seg(lt, 0.9 + i * 0.25, 1.9 + i * 0.25));
        put(p.root, { y: (1 - e) * 600 + bob(lt, i * 2, 6), r: (i ? 4 : -4) * e });
      });
      nodes.forEach(({ n, e, lab, ring }, i) => {
        const p = sp(seg(lt, n.t, n.t + 0.7));
        put(e, { s: p, o: seg(lt, n.t, n.t + 0.12) });
        put(lab, { y: (1 - p) * 20, o: seg(lt, n.t + 0.2, n.t + 0.5) });
        let ro = 0, rs = 1;
        legs.forEach((g) => { if (g.b === n.k || (g.a === n.k && false)) { const q = seg(lt, g.t + g.d, g.t + g.d + 0.7); if (q > 0 && q < 1) { ro = 0.8 * (1 - q); rs = 1 + q * 0.7; } } });
        ring.style.opacity = ro; ring.style.transform = `scale(${rs})`;
      });
      lines.forEach((l, i) => { l.setAttribute("stroke-dasharray", `${eio(seg(lt, 1.0 + i * 0.25, 1.9 + i * 0.25)) * 100} 100`); });
      /* flying document */
      let shown = false;
      legs.forEach((g) => {
        const p = seg(lt, g.t, g.t + g.d);
        const A = N[g.a], Bn = N[g.b];
        if (lt >= g.t && lt < g.t + g.d + 0.35) {
          const k = eio(p);
          const x = lerp(A.x, Bn.x, k), y = lerp(A.y, Bn.y, k) - Math.sin(k * Math.PI) * 90;
          const arrive = seg(lt, g.t + g.d, g.t + g.d + 0.35);
          put(doc, { x: x - 85, y: y - 105, s: lerp(1, 0.2, eo3(arrive)) * lerp(0.7, 1, eo3(Math.min(p * 3, 1))) , r: Math.sin(k * Math.PI) * -14, o: 1 - smooth(arrive) });
          docLab.textContent = g.l; docIc.innerHTML = icon(g.ic, 54, g.c, 2); docIc.style.background = g.c + "1f";
          shown = true;
        }
      });
      if (!shown) put(doc, { o: 0 });
      legs.forEach((g, i) => popChip(g.el, lt, g.t + g.d - 0.05, { x: g.cx, y: g.cy, r: 0, from: 24, center: true }));
      /* ambient travelling dots once everything is linked */
      dots.forEach((d, i) => {
        const [a, b] = pairs[i];
        const o = seg(lt, 5.4, 5.8);
        const k = ((lt * 0.35 + i * 0.33) % 1);
        d.style.opacity = o * Math.sin(k * Math.PI);
        d.style.transform = `translate(${lerp(N[a].x, N[b].x, k)}px,${lerp(N[a].y, N[b].y, k)}px)`;
      });
    });
  }

  /* ---- 8 BUILD & SELL ---- */
  function buildSell(s) {
    const r = s.el;
    const bgU = bgMesh(r, "#fbf9ff", [{ x: 300, y: 300, r: 720, c: "rgba(122,90,248,.14)" }, { x: 1650, y: 850, r: 760, c: TEAL }, { x: 1000, y: 100, r: 520, c: SKY }]);
    const head = kText(r, ["Build your own AI agent.", "Share it. *Sell it.*"], { x: 0, y: 90, size: 112, align: "center", width: W, lh: 1.04 });
    const br = browser(r, { x: 300, y: 385, w: 1180, aspect: 1.5, shots: ["marketplace"] });
    const [lm] = br.layers;
    const ph = phone(r, { x: 1400, y: 430, w: 320, shot: "m-marketplace" });
    const chips = [
      { l: "Free", dot: "#34c759", t: 1.9, x: 1500, y: 395 }, { l: "€15.00", ic: "coin", c: "#0a6cf0", t: 2.4, x: 230, y: 580 },
      { l: "Sell your agent", ic: "bag", c: "#7a5af8", t: 3.0, x: 1330, y: 880 }
    ].map((c) => ({ ...c, el: chip(r, c.l, { size: 42, ic: c.ic, color: c.c, dot: c.dot }) }));
    br.view(lm, 1, 0.5, 0.5);
    s.upd.push((lt) => {
      bgU(lt);
      head.update(lt, 0.45, { stagger: 0.08, dur: 0.8 });
      const e = spS(seg(lt, 0.9, 1.8));
      put(br.root, { y: (1 - e) * 600, s: lerp(0.95, 1, e), o: seg(lt, 0.85, 1.05) });
      br.view(lm, lerp(1.0, 1.28, seg(lt, 1, 5.5)), lerp(0.4, 0.55, seg(lt, 1, 5.5)), lerp(0.3, 0.42, seg(lt, 1, 5.5)));
      const pe = spS(seg(lt, 1.3, 2.2));
      put(ph.root, { y: (1 - pe) * 800 + bob(lt, 2, 6), r: 5 * pe });
      chips.forEach((c) => popChip(c.el, lt, c.t, { x: c.x, y: c.y, r: -3, from: 40 }));
    });
  }

  /* ---- 9 OUTRO ---- */
  function buildOutro(s) {
    const r = s.el;
    r.style.background = "linear-gradient(135deg,#0a5fe0 0%,#1f8df5 48%,#2fcbb6 100%)";
    const blobs = bgMesh(r, "linear-gradient(135deg,#0a5fe0 0%,#1f8df5 48%,#2fcbb6 100%)", [{ x: 250, y: 150, r: 700, c: "rgba(255,255,255,.16)" }, { x: 1700, y: 950, r: 800, c: "rgba(255,255,255,.14)" }]);
    const lm = mark(r, 250, { white: true }); lm.el.style.left = W / 2 - 125 + "px"; lm.el.style.top = "120px";
    const name = kText(r, ["Luna"], { x: 0, y: 380, size: 200, align: "center", width: W, color: "#fff" });
    const slogan = kText(r, ["Your AI educational ecosystem."], { x: 0, y: 625, size: 84, weight: 720, align: "center", width: W, color: "#fff", track: -0.035 });
    const free = el("div", "abs", r, px({ left: W / 2 - 230, top: 790, width: 460, height: 120, borderRadius: 60, background: "#fff", color: "#0a5fe0", fontSize: 60, fontWeight: 780, letterSpacing: "-0.03em", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px -18px rgba(0,30,100,.5)" }), "Free to try");
    const url = el("div", "abs", r, px({ left: 0, top: 955, width: W, textAlign: "center", fontSize: 50, fontWeight: 650, letterSpacing: "-0.01em", color: "rgba(255,255,255,.95)" }), "luna2-share-web.vercel.app");
    s.upd.push((lt) => {
      blobs(lt);
      const sw = eio(seg(lt, 0.6, 1.4));
      lm.set(sw, sp(seg(lt, 1.3, 1.9)));
      lm.el.style.transform = `scale(${lerp(0.7, 1, sp(seg(lt, 0.5, 1.4)))}) rotate(${(1 - sw) * -24}deg)`;
      lm.el.style.opacity = seg(lt, 0.5, 0.7);
      name.update(lt, 1.2, { dur: 0.8 });
      slogan.update(lt, 1.7, { stagger: 0.08, dur: 0.75 });
      const fp = sp(seg(lt, 2.4, 3.1));
      put(free, { y: (1 - fp) * 60, s: lerp(0.7, 1, fp) * (1 + (fp >= 1 ? Math.sin((lt - 3.1) * 3.2) * 0.018 : 0)), o: seg(lt, 2.4, 2.6) });
      put(url, { y: (1 - eoX(seg(lt, 3.0, 3.8))) * 30, o: seg(lt, 3.0, 3.5) });
    });
  }

  /* ------------------------------------------------------------------ chrome overlay (logo, progress) + fx */
  let wm, wmBar, fxRing, fxBand, fxFlash;
  function buildChrome() {
    wm = el("div", "abs", CHROME, { left: "56px", top: "34px", display: "flex", alignItems: "center", gap: "14px", opacity: 0 });
    wm.innerHTML = `<svg width="46" height="46" viewBox="0 0 64 64"><defs><linearGradient id="wmg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0a6cf0"/><stop offset=".55" stop-color="#37a8ff"/><stop offset="1" stop-color="#2fcbb6"/></linearGradient></defs><path d="M31.91 6A26 26 0 1 0 55.51 43.09A22 22 0 1 1 31.91 6Z" fill="url(#wmg)"/><circle cx="44.5" cy="25.5" r="4.6" fill="#34c759"/></svg><span style="font-size:34px;font-weight:800;letter-spacing:-0.03em;color:#1d1d1f">Luna</span>`;
    const track = el("div", "abs", CHROME, { left: 0, bottom: 0, width: "100%", height: "8px", background: "rgba(10,108,240,.10)", opacity: 0 });
    wmBar = el("div", "abs", track, { left: 0, top: 0, bottom: 0, background: "linear-gradient(90deg,#0a6cf0,#2fcbb6)", borderRadius: "0 4px 4px 0" });
    wmBar.parent = track;
    fxRing = el("div", "fx", stage, { zIndex: 20, borderRadius: "50%", border: "14px solid transparent", background: "linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg,#0a6cf0,#2fcbb6) border-box" });
    fxRing.style.background = "transparent"; fxRing.style.borderColor = "#37a8ff";
    fxBand = el("div", "fx", stage, { zIndex: 20, inset: 0, background: "linear-gradient(90deg,#2fcbb6,#37a8ff,#0a6cf0)" });
    fxFlash = el("div", "fx", stage, { zIndex: 25, inset: 0, background: "#fff" });
  }

  /* ------------------------------------------------------------------ transitions */
  const TYPES = ["slide", "zoom", "circle", "push", "white", "wipe", "slideR", "circle2"];
  function applyTransition(type, p, role, s) {
    const st = s.el.style;
    const e = eio(p);
    switch (type) {
      case "slide":
        if (role === "in") { st.transform = `translateX(${(1 - eo5(p)) * W}px)`; st.boxShadow = "-60px 0 100px rgba(10,40,120,.16)"; }
        else st.transform = `translateX(${-eo5(p) * W * 0.28}px) scale(${1 - 0.04 * e})`;
        break;
      case "slideR":
        if (role === "in") { st.transform = `translateX(${-(1 - eo5(p)) * W}px)`; st.boxShadow = "60px 0 100px rgba(10,40,120,.16)"; }
        else st.transform = `translateX(${eo5(p) * W * 0.28}px) scale(${1 - 0.04 * e})`;
        break;
      case "zoom":
        if (role === "in") { st.transform = `scale(${lerp(0.72, 1, eo3(p))})`; st.opacity = smooth(seg(p, 0.15, 0.8)); }
        else { st.transform = `scale(${lerp(1, 1.9, eio(p))})`; st.opacity = 1 - smooth(seg(p, 0.25, 0.95)); }
        break;
      case "circle":
      case "circle2": {
        const cx = type === "circle" ? 1480 : W / 2, cy = type === "circle" ? 560 : H / 2;
        const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 20;
        const rr = eio(p) * maxR;
        if (role === "in") {
          st.clipPath = `circle(${rr}px at ${cx}px ${cy}px)`;
          Object.assign(fxRing.style, { display: p > 0 && p < 0.97 ? "block" : "none", left: cx - rr - 7 + "px", top: cy - rr - 7 + "px", width: 2 * rr + 14 + "px", height: 2 * rr + 14 + "px", opacity: 1 - smooth(seg(p, 0.75, 1)), borderColor: "#37a8ff" });
        } else st.transform = `scale(${1 - 0.05 * e})`;
        break;
      }
      case "push":
        if (role === "in") st.transform = `translateY(${(1 - eo5(p)) * H}px)`;
        else st.transform = `translateY(${-eo5(p) * H}px)`;
        break;
      case "white": {
        const f = p < 0.5 ? eo3(p / 0.5) : 1 - eio((p - 0.5) / 0.5);
        fxFlash.style.display = "block"; fxFlash.style.opacity = f;
        if (role === "in") { st.opacity = p >= 0.5 ? 1 : 0; st.transform = `scale(${lerp(1.04, 1, eo3(seg(p, 0.5, 1)))})`; }
        else { st.opacity = p < 0.5 ? 1 : 0; st.transform = `scale(${lerp(1, 1.04, eo3(seg(p, 0, 0.5)))})`; }
        break;
      }
      case "wipe": {
        const X = e * (W + 420);
        if (role === "in") {
          st.clipPath = `polygon(0px 0px, ${X}px 0px, ${X - 360}px ${H}px, 0px ${H}px)`;
          fxBand.style.display = p > 0 && p < 1 ? "block" : "none";
          fxBand.style.clipPath = `polygon(${X - 130}px 0px, ${X + 14}px 0px, ${X - 346}px ${H}px, ${X - 490}px ${H}px)`;
        } else st.transform = `translateX(${e * 120}px)`;
        break;
      }
    }
  }

  /* ------------------------------------------------------------------ renderAt */
  const IMGS_READY = [];
  window.renderAt = function (t) {
    if (!TIMING) return;
    const D = TIMING.duration;
    fxRing.style.display = fxBand.style.display = fxFlash.style.display = "none";
    scenes.forEach((s, i) => {
      const start = i === 0 ? 0 : B[i - 1];
      const end = i === scenes.length - 1 ? D + 1 : B[i];
      const trOut = i < scenes.length - 1 ? TR[i] : 0;
      const visible = t >= start && t <= end + trOut;
      s.el.style.display = visible ? "block" : "none";
      if (!visible) return;
      Object.assign(s.el.style, { transform: "", opacity: "", clipPath: "", boxShadow: "", zIndex: 1 });
      if (i > 0 && t < start + TR[i - 1]) { s.el.style.zIndex = 2; applyTransition(TYPES[i - 1], clamp((t - start) / TR[i - 1]), "in", s); }
      else if (t > end) { applyTransition(TYPES[i], clamp((t - end) / TR[i]), "out", s); }
      s.upd.forEach((f) => f(t - start));
    });
    /* persistent chrome */
    const wmO = smooth(seg(t, 5.9, 6.3)) * (1 - smooth(seg(t, B[7] - 0.2, B[7] + 0.3)));
    wm.style.opacity = wmO;
    const bar = wmBar.parentNode;
    bar.style.opacity = wmO;
    wmBar.style.width = (t / D) * 100 + "%";
  };

  /* ------------------------------------------------------------------ boot */
  function fit() {
    const sc = (parseFloat(new URLSearchParams(location.search).get("w")) || window.innerWidth) / W;
    stage.style.transform = `scale(${sc})`;
  }
  const ready = (async () => {
    TIMING = await (await fetch("timing.json")).json();
    const spb = 60 / TIMING.bpm;
    B = TIMING.boundaryBeats.map((b) => b * spb);
    TR = TIMING.transitions;
    window.LUNA_BOUNDARIES = B;
    buildChrome();
    [buildHook, buildUpload, buildPlan, buildGenerate, buildLearn, buildTrack, buildShare, buildSell, buildOutro].forEach((b) => makeScene(b));
    /* keep chrome above scenes */
    stage.appendChild(CHROME);
    fit();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all([...document.images].map((im) => im.decode().catch(() => null)));
    const q = new URLSearchParams(location.search).get("t");
    window.renderAt(q != null ? parseFloat(q) : 0);
    return true;
  })();
  window.__ready = ready;
  window.addEventListener("resize", fit);
})();
