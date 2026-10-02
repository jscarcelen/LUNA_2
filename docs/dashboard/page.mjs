/**
 * Page template: turns the manifest data into one self-contained HTML string.
 * Static parts (process, flow diagram, request catalog, unit-cost chart) are rendered here so they
 * work even without JavaScript; the calculators and filters are in page.client.js.
 * `__HASH__`, `__VERSION__` and `__BUILT__` are filled in by build.mjs.
 */

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const usd = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return "$0";
  if (v < 0.0001) return "<$0.0001";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
};
const STATUS_LABEL = { live: "Live", fallback: "Backup path", "on-demand": "On demand", legacy: "Not used by UI" };

function wrap(text, max, limit = 2) {
  const out = [];
  let line = "";
  for (const word of String(text).split(" ")) {
    if ((line + " " + word).trim().length > max && line) { out.push(line); line = word; } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out.slice(0, limit);
}

/* ------------------------------------------------------------------------------- flow diagram */

function flowSvg(data) {
  const colW = 134, nodeW = 124, nodeH = 92, laneH = 160, padX = 24, topPad = 40;
  const cols = Math.max(...data.nodes.map((n) => n.col)) + 1;
  const W = cols * colW + padX * 2;
  const H = data.lanes.length * laneH + 36;
  const stageColor = Object.fromEntries(data.stages.map((s) => [s.id, s.color]));
  const pos = Object.fromEntries(data.nodes.map((n) => [n.id, { ...n, x: padX + n.col * colW + (colW - nodeW) / 2, y: n.lane * laneH + topPad }]));

  const bands = data.lanes.map((lane, i) => `<rect x="0" y="${i * laneH}" width="${W}" height="${laneH}" fill="${i % 2 ? "#ffffff" : "#f7f7f9"}"/><text x="14" y="${i * laneH + 20}" class="fl-lane">${esc(lane.label.toUpperCase())}</text>`).join("");

  const edges = data.edges.map(([from, to]) => {
    const a = pos[from], b = pos[to];
    if (!a || !b) return "";
    let d;
    if (a.col === b.col) {
      const down = b.y > a.y;
      d = `M${a.x + nodeW / 2},${down ? a.y + nodeH : a.y} L${b.x + nodeW / 2},${down ? b.y : b.y + nodeH}`;
    } else if (b.col > a.col) {
      const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2;
      const dx = Math.min(70, (x2 - x1) / 2);
      d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    } else {
      const x1 = a.x + nodeW / 2, y1 = a.y + nodeH, x2 = b.x + nodeW / 2, y2 = b.y + nodeH, yy = y1 + 24;
      d = `M${x1},${y1} C${x1},${yy} ${x2},${yy} ${x2},${y2}`;
    }
    return `<path d="${d}" class="fl-edge" marker-end="url(#arrow)"/>`;
  }).join("");

  const nodes = data.nodes.map((n) => {
    const p = pos[n.id];
    const color = stageColor[n.phase] || "#86868b";
    const title = wrap(n.label, 17, 2);
    const titleSvg = title.map((line, i) => `<text x="${p.x + 11}" y="${p.y + 24 + i * 14}" class="fl-label">${esc(line)}</text>`).join("");
    const subTop = p.y + 24 + (title.length - 1) * 14 + 16;
    const sub = wrap(n.sub || "", 23, 3).map((line, i) => `<text x="${p.x + 11}" y="${subTop + i * 12.5}" class="fl-sub">${esc(line)}</text>`).join("");
    const badges = (n.reqs || []).length
      ? (() => {
          const label = n.reqs.join(" · ");
          const w = label.length * 5.8 + 12;
          return `<rect x="${p.x + nodeW - w - 6}" y="${p.y - 8}" width="${w}" height="16" rx="8" fill="${color}"/><text x="${p.x + nodeW - w / 2 - 6}" y="${p.y + 3.5}" class="fl-badge" text-anchor="middle">${esc(label)}</text>`;
        })()
      : "";
    const body = `<g class="fl-node"><rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" rx="12" fill="#fff" stroke="${color}" stroke-width="1.6"/><rect x="${p.x}" y="${p.y + 12}" width="4" height="${nodeH - 24}" rx="2" fill="${color}"/>${titleSvg}${sub}${badges}</g>`;
    return n.reqs?.length ? `<a href="#req-${esc(n.reqs[0])}" data-req="${esc(n.reqs[0])}">${body}</a>` : body;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="flow-svg" role="img" aria-label="Information flow of LUNA from upload to marketplace"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9aa0aa"/></marker></defs>${bands}${edges}${nodes}</svg>`;
}

/* ----------------------------------------------------------------------------- request catalog */

function stageChip(stage) {
  return `<span class="chip" style="--c:${stage.color}">${esc(stage.label)}</span>`;
}

function summaryTable(data) {
  const stages = Object.fromEntries(data.stages.map((s) => [s.id, s]));
  const rows = data.requests.map((r) => `<tr data-stage="${r.stage}"><td><a href="#req-${r.id}" class="id" style="--c:${stages[r.stage].color}">${r.id}</a></td><td><strong>${esc(r.name)}</strong></td><td class="mono">${esc(r.model)}</td><td class="r">${num(r.tokens.in)}</td><td class="r">${num(r.tokens.out)}</td><td class="r"><strong>${usd(r.costUsd)}</strong></td><td class="r">${r.seconds.typical}s</td><td><span class="basis ${r.tokens.basis}">${r.tokens.basis}</span></td></tr>`).join("");
  return `<div class="table-wrap"><table class="sum"><thead><tr><th>#</th><th>Request</th><th>Model</th><th class="r">Tokens in</th><th class="r">Tokens out</th><th class="r">Cost / call</th><th class="r">Time</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function requestCard(r, stage) {
  const t = r.tokens;
  const scale = t.scale;
  const math = `${num(t.in)} in × $${r.price.input}/M + ${num(t.out)} out × $${r.price.output}/M = <strong>${usd(r.costUsd)}</strong>`;
  const grows = scale
    ? `<p class="grows">Grows with size: ≈ ${num(scale.inPer)} in${scale.outPer ? ` + ${num(scale.outPer)} out` : ""} tokens per ${esc(scale.unit)}${scale.outPerItem ? `, plus ≈ ${scale.outPerItem} out tokens per generated item` : ""}${scale.fixedIn ? ` (+ ${num(scale.fixedIn)} fixed in)` : ""}. Shown above for ${scale.units} × ${esc(scale.unit)}.</p>`
    : "";
  const params = Object.entries(r.params).map(([k, v]) => `<span class="param"><b>${esc(k.replace(/([A-Z])/g, " $1").toLowerCase())}</b> ${esc(v)}</span>`).join("");
  const prompts = r.prompts.map((p) => p.missing
    ? `<div class="prompt missing"><div class="prompt-head"><span>${esc(p.label)}</span></div><p class="warn">⚠ The prompt text could not be extracted from <code>${esc(p.file)}</code> — the code changed. Update the regex in <code>docs/dashboard/manifest.mjs</code>.</p></div>`
    : `<div class="prompt"><div class="prompt-head"><span>${esc(p.label)}</span><span class="ref">${esc(p.file.replace("apps/web/", ""))}:${p.line}</span><button type="button" class="copy" data-copy>Copy</button></div><pre>${esc(p.text)}</pre></div>`).join("");
  return `<details class="req" id="req-${r.id}" data-stage="${r.stage}" style="--c:${stage.color}">
  <summary><span class="id">${r.id}</span><span class="req-title"><strong>${esc(r.name)}</strong><small>${esc(r.purpose)}</small></span><span class="req-meta"><span class="mono model">${esc(r.model)}</span><span class="cost">${usd(r.costUsd)}</span></span></summary>
  <div class="req-body">
    <div class="req-grid">
      <div><h5>What it does</h5><p>${esc(r.purpose)}</p><h5>Why it exists</h5><p>${esc(r.why)}</p></div>
      <div><h5>Where in the process</h5><p>${esc(r.position)}</p><h5>Triggered by</h5><p>${esc(r.trigger)}</p></div>
      <div><h5>Input</h5><p>${esc(r.input)}</p><h5>Output</h5><p>${esc(r.output)}</p></div>
      <div><h5>If it fails</h5><p>${esc(r.fallbacks)}</p><h5>Status</h5><p><span class="status ${r.status}">${STATUS_LABEL[r.status]}</span></p></div>
    </div>
    <div class="req-cost"><div><span class="k">Model</span><strong>${esc(r.model)}</strong><small>${esc(r.provider)}${r.modelEnv && r.modelEnv !== "(fixed)" ? ` · override: <code>${esc(r.modelEnv)}</code>` : ""}</small></div><div><span class="k">Typical call</span><strong>${math}</strong><small><span class="basis ${t.basis}">${t.basis}</span> · ~${r.seconds.typical}s (${esc(r.seconds.note)})</small></div></div>
    ${grows}
    <div class="params">${params}</div>
    ${prompts}
    <p class="src">Source: <code>${esc(r.file.replace("apps/web/", ""))}</code>${r.anchorLine ? ` · line ${r.anchorLine}` : ""}${r.anchorMissing ? ' · <span class="warn">⚠ function not found — renamed?</span>' : ""}</p>
  </div>
</details>`;
}

/* ---------------------------------------------------------------------------------- unit costs */

function unitRows(data) {
  const u = data.unit;
  const R = (id) => data.requests.find((r) => r.id === id);
  const tok = (r) => r.tokens.in + r.tokens.out;
  const rows = [
    { name: "Upload a PDF · 10 pages", usd: u.pdfUpload10, tokens: 10 * (R("U1").tokens.scale.inPer + R("U1").tokens.scale.outPer), stage: "upload", basis: "measured", note: "GPT-4o reads every page (U1) + embeddings + concept tree" },
    { name: "Upload a PowerPoint · 20 slides", usd: u.slideDeck20 + u.concepts, tokens: tok(R("U2")), stage: "upload", basis: "estimated", note: "Slide text + up to 5 images (U2) + concept tree" },
    { name: "Upload a photo / handwriting", usd: u.image + u.concepts, tokens: tok(R("U3")), stage: "upload", basis: "estimated", note: "Vision transcription (U3) + concept tree" },
    { name: "Upload a Word document (.docx)", usd: u.docxUpload, tokens: 0, stage: "upload", basis: "estimated", note: "Parsed locally — only embeddings and the concept tree use AI" },
    { name: "Save to the cloud · per document, per month", usd: u.storageDocMonth, tokens: 0, stage: "upload", basis: "measured", note: `≈ ${u.storageDocMb.toFixed(2)} MB per document in Postgres (original + text + preview + vectors)` },
    { name: "Build the concept map", usd: u.concepts, tokens: tok(R("U7")), stage: "upload", basis: "measured", note: "U7 · GPT-4o" },
    { name: "Generate a study plan", usd: u.plan, tokens: tok(R("P1")), stage: "plan", basis: "measured", note: "P1 · GPT-4o" },
    { name: "Re-plan after adding material", usd: u.revise, tokens: tok(R("P2")), stage: "plan", basis: "estimated", note: "P2 · GPT-4o" },
    { name: "Run an agent · Luna 3 Pro (default) · 10 questions", usd: u.agentPro, tokens: u.agentTokens, stage: "agents", basis: "estimated", note: "A1 · GPT-4o (tokens measured on Mini, priced at Pro)" },
    { name: "Run an agent · Luna 3 Max · 10 questions", usd: u.agentMax, tokens: u.agentTokens, stage: "agents", basis: "estimated", note: "A1 · GPT-4.1" },
    { name: "Tag a resource with concepts", usd: u.resourceConcepts, tokens: tok(R("P3")), stage: "plan", basis: "estimated", note: "P3 · GPT-4o" },
    { name: "Design a custom template (AI)", usd: u.design, tokens: tok(R("T1")) + tok(R("T2")) + tok(R("T3")), stage: "design", basis: "estimated", note: "T1 + T2 + T3 (+ T4 about 30% of the time)" },
    { name: "Performance coach reading", usd: u.coach, tokens: tok(R("F1")), stage: "track", basis: "estimated", note: "F1 · GPT-4o" },
    { name: "Mastery, charts, grading, exports", usd: 0, tokens: 0, stage: "track", basis: "measured", note: "Rule-based — no AI call" }
  ];
  return rows;
}

function unitChart(data) {
  const stages = Object.fromEntries(data.stages.map((s) => [s.id, s]));
  const rows = unitRows(data);
  const max = Math.max(...rows.map((r) => r.usd));
  return `<div class="bars" id="unit-bars" data-max="${max}">${rows.map((r) => `<div class="bar-row" data-usd="${r.usd}" style="--c:${stages[r.stage].color}"><div class="bar-name"><strong>${esc(r.name)}</strong><small>${esc(r.note)}</small></div><div class="bar-track"><i style="width:${Math.max(r.usd > 0 ? 0.6 : 0, (r.usd / max) * 100).toFixed(2)}%"></i></div><div class="bar-val"><strong>${r.usd === 0 ? "$0" : usd(r.usd)}</strong><small>${r.tokens ? num(r.tokens) + " tokens" : "no tokens"} · <span class="basis ${r.basis}">${r.basis}</span></small></div></div>`).join("")}</div>`;
}

/* ------------------------------------------------------------------------------------- the page */

export function renderPage({ data, css, client }) {
  const stages = Object.fromEntries(data.stages.map((s) => [s.id, s]));
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, " ");
  const totalCalls = data.requests.length;
  const prompts = data.requests.reduce((n, r) => n + r.prompts.length, 0);

  const process = data.process.map((p, i) => `<div class="step" style="--c:${p.color}"><span class="step-n">${p.n}</span><h3>${esc(p.title)}</h3><p class="step-line">${esc(p.line)}</p><p>${esc(p.body)}</p><div class="step-out"><span>Produces</span><strong>${esc(p.out)}</strong></div><div class="step-ai"><span>AI requests</span><strong>${esc(p.ai)}</strong></div></div>${i < data.process.length - 1 ? '<div class="step-arrow" aria-hidden="true">→</div>' : ""}`).join("");

  const roles = data.roles.map((r) => `<div class="role"><h4>${esc(r.role)}</h4><p>${esc(r.asks)}</p></div>`).join("");

  const legend = data.stages.map((s) => `<span class="legend-i"><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("");

  const stores = data.stores.map((s) => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.where)}</td><td>${esc(s.holds)}</td></tr>`).join("");

  const filters = `<button type="button" class="filter on" data-filter="all">All ${totalCalls}</button>${data.stages.map((s) => `<button type="button" class="filter" data-filter="${s.id}" style="--c:${s.color}">${esc(s.label)}</button>`).join("")}`;

  const cards = data.requests.map((r) => requestCard(r, stages[r.stage])).join("");

  const free = data.freeSteps.map((f) => `<div class="free"><strong>${esc(f.name)}</strong><p>${esc(f.note)}</p><span class="tag">${esc(f.cost)}</span></div>`).join("");

  const models = data.models.map((m) => {
    const p = data.prices[m.id];
    return `<tr><td><strong>${esc(m.label)}</strong>${m.brand !== "—" ? `<small class="brand">sold as “${esc(m.brand)}”</small>` : ""}</td><td class="mono">${esc(m.id)}</td><td class="r">$${p.input}</td><td class="r">$${p.output}</td><td>${esc(m.use)}</td></tr>`;
  }).join("");

  const measured = data.measured;
  const pdfRows = measured.pdfMarkdown.map((r) => {
    const cost = (r.in * data.prices["gpt-4o"].input + r.out * data.prices["gpt-4o"].output) / 1e6;
    return `<tr><td>${esc(r.doc)}</td><td class="r">${r.pages}</td><td class="r">${num(r.in)}</td><td class="r">${num(r.out)}</td><td class="r">${r.seconds}s</td><td class="r"><strong>${usd(cost)}</strong></td><td class="r">${usd(cost / r.pages)}</td></tr>`;
  }).join("");
  const storageRows = data.storage.map((r) => `<tr><td>${esc(r.doc)}</td><td class="r">${num(r.originalKb)} KB</td><td class="r">${(r.base64Chars / 1024).toFixed(0)} KB</td><td class="r">${(r.markdownChars / 1024).toFixed(0)} KB</td><td class="r">${(r.renderHtmlChars / 1024).toFixed(0)} KB</td><td class="r">${r.chunks}</td><td class="r"><strong>${r.mb.toFixed(2)} MB</strong></td></tr>`).join("");

  const perf = data.perf.map((m) => `<div class="metric${m.ai ? " ai" : ""}"><div class="metric-top"><strong>${esc(m.name)}</strong>${m.ai ? `<a href="#req-${m.req}" class="tag ai">AI · ${m.req}</a>` : '<span class="tag">no AI · $0</span>'}</div><p class="q">“${esc(m.q)}”</p><p>${esc(m.note)}</p><small>${esc(m.roles)}</small></div>`).join("");

  const built = data.business.status.built.map((x) => `<li>${esc(x)}</li>`).join("");
  const planned = data.business.status.planned.map((x) => `<li>${esc(x)}</li>`).join("");
  const risks = data.risks.map((r) => `<div class="risk ${r.level}"><span class="lvl">${r.level === "high" ? "High" : r.level === "med" ? "Medium" : "Low"}</span><div><strong>${esc(r.title)}</strong><p>${esc(r.body)}</p></div></div>`).join("");

  const warningBanner = data.warnings.length
    ? `<div class="banner">⚠ ${data.warnings.length} item${data.warnings.length === 1 ? "" : "s"} could not be verified against the code when this version was built: <ul>${data.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
    : "";

  const nav = [["process", "The process"], ["flow", "Information flow"], ["ai", "AI requests"], ["costs", "Unit costs"], ["operating", "Operating cost"], ["money", "Lunas & pricing"], ["perf", "Performance"], ["status", "Status & risks"]];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="luna-content-hash" content="__HASH__">
<title>LUNA — how it works, what it costs</title>
<style>${css}</style>
</head>
<body>
<header class="topbar">
  <a href="#top" class="brand-mark"><span class="moon"></span>LUNA</a>
  <nav>${nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}</nav>
  <span class="ver" title="Built __BUILT__">v __VERSION__</span>
</header>

<main>
<section class="hero" id="top">
  <div class="wrap">
    <p class="eyebrow">Product &amp; economics overview</p>
    <h1>Upload your material.<br>Get a study plan.<br>Practise with AI agents.<br><span>Sell what you build.</span></h1>
    <p class="lead">One page that explains what LUNA does, how information moves through it, every AI request behind it — with the exact prompt, model, tokens and cost — and what it takes to run it.</p>
    <div class="kpis">
      <div class="kpi"><strong>${totalCalls}</strong><span>AI requests catalogued</span></div>
      <div class="kpi"><strong>${prompts}</strong><span>exact prompts, read from the code</span></div>
      <div class="kpi"><strong>${usd(data.unit.pdfUpload10)}</strong><span>to upload a 10-page PDF</span></div>
      <div class="kpi"><strong>${usd(data.unit.agentPro)}</strong><span>to generate a 10-question quiz</span></div>
    </div>
    <p class="hint">Press <kbd>P</kbd> for presentation mode · click any box in the diagram to jump to its request · open any request to see its prompt</p>
    ${warningBanner}
  </div>
</section>

<section class="sec" id="process">
  <div class="wrap">
    <p class="eyebrow">1 · What LUNA does</p>
    <h2>Four steps, one loop</h2>
    <p class="lead">Material goes in; a plan, practice and results come out; what a teacher or student builds along the way can be sold.</p>
    <div class="steps">${process}</div>
    <div class="loop">↻ Results of every activity flow back into the plan — the study plan updates, and the coach suggests what to practise next.</div>
    <h3 class="sub">Who it serves</h3>
    <div class="roles">${roles}</div>
  </div>
</section>

<section class="sec alt" id="flow">
  <div class="wrap xwide">
    <p class="eyebrow">2 · Information flow</p>
    <h2>How information moves</h2>
    <p class="lead">Left to right is time. Rows show where each step happens. Colored badges are AI requests — click a box to open its prompt.</p>
    <div class="legend">${legend}</div>
    <div class="flow-scroll">${flowSvg(data)}</div>
    <h3 class="sub">What is stored where</h3>
    <div class="table-wrap"><table class="plain"><thead><tr><th>Store</th><th>Where</th><th>What it holds</th></tr></thead><tbody>${stores}</tbody></table></div>
  </div>
</section>

<section class="sec" id="ai">
  <div class="wrap wide">
    <p class="eyebrow">3 · AI requests</p>
    <h2>Every request to an AI model</h2>
    <p class="lead">${totalCalls} requests across the product. Each card shows why it exists, where it sits in the process, which model it uses, tokens and cost, and the exact prompt as it is in the code. Cost is for one typical call; “measured” numbers come from real calls, “estimated” from the prompt size.</p>
    <div class="legend">${legend}</div>
    <div class="filters">${filters}</div>
    ${summaryTable(data)}
    <h3 class="sub">Open a request</h3>
    <div class="cards">${cards}</div>
    <div class="cards-actions"><button type="button" class="ghost" data-expand="all">Expand all</button><button type="button" class="ghost" data-expand="none">Collapse all</button></div>

    <h3 class="sub">Models and prices</h3>
    <div class="table-wrap"><table class="plain"><thead><tr><th>Model</th><th>API id</th><th class="r">$ / 1M tokens in</th><th class="r">$ / 1M tokens out</th><th>Used for</th></tr></thead><tbody>${models}</tbody></table></div>
    <p class="note">Prices are the code's own <code>MODEL_PRICING</code> (OpenAI list prices) plus list prices for embeddings and Claude Haiku. Output tokens cost 4–5× input tokens, so a short answer to a long document is cheaper than a long answer to a short prompt.</p>

    <h3 class="sub">Work that costs no AI</h3>
    <div class="frees">${free}</div>
  </div>
</section>

<section class="sec alt" id="costs">
  <div class="wrap wide">
    <p class="eyebrow">4 · Unit costs</p>
    <h2>What one action costs</h2>
    <p class="lead">Uploading is the most expensive thing a user does because the model reads every page. Everything after that — plans, quizzes, coaching — costs about a cent or two.</p>
    <div class="toolbar"><span>Bar scale</span><button type="button" class="seg on" data-scale="linear">Linear</button><button type="button" class="seg" data-scale="log">Log (see the small ones)</button></div>
    ${unitChart(data)}
    <ul class="insights">${data.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>

    <div class="two">
      <div class="panel">
        <h3>PDF upload calculator</h3>
        <label class="field">Pages <input type="number" id="pdf-pages" value="10" min="1" max="500"></label>
        <div class="big" id="pdf-cost">—</div>
        <p class="note" id="pdf-detail"></p>
      </div>
      <div class="panel">
        <h3>Measured: PDF → Markdown</h3>
        <div class="table-wrap"><table class="plain compact"><thead><tr><th>File</th><th class="r">Pages</th><th class="r">In</th><th class="r">Out</th><th class="r">Time</th><th class="r">Cost</th><th class="r">/ page</th></tr></thead><tbody>${pdfRows}</tbody></table></div>
        <p class="note">Real calls on ${esc(data.measured.date)}. About 3–4 seconds and half a cent per page.</p>
      </div>
    </div>

    <h3 class="sub">Saving to the cloud</h3>
    <div class="table-wrap"><table class="plain compact"><thead><tr><th>Document</th><th class="r">Original</th><th class="r">As stored (base64)</th><th class="r">Text</th><th class="r">Preview HTML</th><th class="r">Chunks</th><th class="r">Total in database</th></tr></thead><tbody>${storageRows}</tbody></table></div>
    <p class="note">${esc(data.infra.note2)} The original file is the biggest part of every document.</p>
  </div>
</section>

<section class="sec" id="operating">
  <div class="wrap wide">
    <p class="eyebrow">5 · Operating cost</p>
    <h2>What it costs to run</h2>
    <p class="lead">Change the number of users, what each kind of user does in a month, and the plan prices. Every figure below recomputes. <strong>Usage and prices here are illustrative assumptions</strong>, not measurements — the per-action costs behind them are the ones above.</p>
    <div id="op-calc" class="calc"></div>
  </div>
</section>

<section class="sec alt" id="money">
  <div class="wrap wide">
    <p class="eyebrow">6 · Lunas &amp; pricing</p>
    <h2>Subscription plus pay as you use</h2>
    <p class="lead">A <strong>luna</strong> is LUNA's cash coin. Plans include a monthly allowance, more can be bought in advance, and sellers earn lunas when others buy their agents, templates, resources and plans.</p>
    <div class="money-flow">
      <div class="mf-col"><h4>Where lunas come from</h4>
        <div class="mf live"><strong>Welcome grant</strong><p>1,000,000 lunas at sign-up</p><span class="status live">Live (local)</span></div>
        <div class="mf plan"><strong>Subscription</strong><p>A monthly allowance depending on the profile: student, teacher, parent</p><span class="status fallback">Planned</span></div>
        <div class="mf plan"><strong>Buy in advance</strong><p>Top up when the allowance runs out — pay as you use</p><span class="status fallback">Planned</span></div>
        <div class="mf plan"><strong>Earn from sales</strong><p>Buyers pay in lunas; the seller keeps them minus the platform fee</p><span class="status fallback">Planned</span></div>
      </div>
      <div class="mf-mid"><div class="wallet"><span class="coin">◐</span><strong>Lunas wallet</strong><small>today: 1 luna = 1 AI token</small></div></div>
      <div class="mf-col"><h4>What lunas pay for</h4>
        <div class="mf live"><strong>Running agents</strong><p>Quizzes, flashcards, summaries — charged by the tokens used</p><span class="status live">Live (local)</span></div>
        <div class="mf plan"><strong>Reading uploads</strong><p>PDFs, slides, images — the most expensive step, not charged yet</p><span class="status fallback">Planned</span></div>
        <div class="mf plan"><strong>Buying from the marketplace</strong><p>Agents, templates, resources, plans</p><span class="status fallback">Planned</span></div>
        <div class="mf plan"><strong>Cash out</strong><p>Turn earned lunas into money</p><span class="status fallback">Planned</span></div>
      </div>
    </div>
    <div id="money-calc" class="calc"></div>
  </div>
</section>

<section class="sec" id="perf">
  <div class="wrap wide">
    <p class="eyebrow">7 · Performance metrics</p>
    <h2>Turning results into decisions</h2>
    <p class="lead">Almost all performance tracking is plain rules over saved attempts — it costs no AI at all. The one AI step is the coach, which reads the numbers and says what to do next.</p>
    <div class="metrics">${perf}</div>
    <div class="panel inline"><strong>Cost of performance tracking</strong><p>Rule-based metrics: <b>$0</b> in AI fees (database reads and compute only). Coach reading: <b>${usd(data.unit.coach)}</b> per reading. Even a very active student asking for the coach daily costs ≈ ${usd(data.unit.coach * 30)} a month.</p></div>
  </div>
</section>

<section class="sec alt" id="status">
  <div class="wrap wide">
    <p class="eyebrow">8 · Status &amp; risks</p>
    <h2>What exists, what's next, what to watch</h2>
    <div class="two">
      <div class="panel good"><h3>Built</h3><ul>${built}</ul></div>
      <div class="panel next"><h3>Planned</h3><ul>${planned}</ul></div>
    </div>
    <h3 class="sub">Risks and open questions</h3>
    <div class="risks">${risks}</div>
    <p class="foot">This page is generated from the code by <code>docs/dashboard/build.mjs</code>. Every change produces a new dated file in <code>docs/dashboard/versions/</code>; nothing is overwritten. Prompts shown are extracted from the source at build time; token counts and prices are labelled “measured” or “estimated”.</p>
  </div>
</section>
</main>

<script id="luna-data" type="application/json">${json}</script>
<script>${client}</script>
</body>
</html>`;
}
