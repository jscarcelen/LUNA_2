/* LUNA dashboard — interactivity. Inlined into every generated version (no external files). */
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("luna-data").textContent);
  var U = D.unit;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var n0 = function (v) { return Math.round(Number(v) || 0).toLocaleString("en-US"); };
  var usd = function (v) {
    v = Number(v) || 0;
    var s = v < 0 ? "-" : "";
    v = Math.abs(v);
    if (v === 0) return "$0";
    if (v < 0.0001) return s + "<$0.0001";
    if (v < 0.01) return s + "$" + v.toFixed(4);
    if (v < 1) return s + "$" + v.toFixed(3);
    if (v < 1000) return s + "$" + v.toFixed(2);
    return s + "$" + Math.round(v).toLocaleString("en-US");
  };
  var pct = function (v) { return (isFinite(v) ? v * 100 : 0).toFixed(0) + "%"; };

  /* ---------------------------------------------------------------- request catalog */
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    if (el && el.tagName === "DETAILS") {
      el.open = true;
      setTimeout(function () { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
    }
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();

  $$("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var stage = btn.getAttribute("data-filter");
      $$("[data-filter]").forEach(function (b) { b.classList.toggle("on", b === btn); });
      $$("details.req, table.sum tbody tr").forEach(function (el) {
        el.style.display = stage === "all" || el.getAttribute("data-stage") === stage ? "" : "none";
      });
    });
  });
  $$("[data-expand]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("data-expand") === "all";
      $$("details.req").forEach(function (d) { if (d.style.display !== "none") d.open = open; });
    });
  });
  document.addEventListener("click", function (event) {
    var btn = event.target.closest && event.target.closest("[data-copy]");
    if (!btn) return;
    var pre = btn.closest(".prompt").querySelector("pre");
    var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(pre.textContent).then(done, done); else done();
  });

  /* -------------------------------------------------------------------- unit-cost bars */
  var bars = $("#unit-bars");
  function setScale(mode) {
    var rows = $$(".bar-row", bars);
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r.getAttribute("data-usd")); }));
    var floor = 0.00005;
    rows.forEach(function (row) {
      var v = Number(row.getAttribute("data-usd"));
      var w;
      if (v <= 0) w = 0;
      else if (mode === "log") w = Math.max(1.5, (Math.log10(v / floor) / Math.log10(max / floor)) * 100);
      else w = Math.max(0.6, (v / max) * 100);
      $("i", row).style.width = w.toFixed(2) + "%";
    });
    $$("[data-scale]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-scale") === mode); });
  }
  $$("[data-scale]").forEach(function (b) { b.addEventListener("click", function () { setScale(b.getAttribute("data-scale")); }); });

  /* --------------------------------------------------------------------- PDF calculator */
  function pdfCalc() {
    var pages = Math.max(1, Number($("#pdf-pages").value) || 1);
    var read = pages * U.pdfPage;
    var embed = pages * U.chunksPerPage * U.embedChunk;
    var total = read + embed + U.concepts;
    $("#pdf-cost").textContent = usd(total);
    $("#pdf-detail").innerHTML = "Reading " + pages + " pages with GPT-4o: <b>" + usd(read) + "</b> · embeddings: " + usd(embed) + " · concept map: " + usd(U.concepts) + ". About " + Math.round(pages * 3.6) + " seconds. Storing it adds ≈ " + usd(U.storageDocMonth) + " per month.";
  }
  $("#pdf-pages").addEventListener("input", pdfCalc);
  pdfCalc();

  /* ----------------------------------------------------------------- shared assumptions */
  var T = D.business.defaults;
  var S = {
    lunaPriceM: T.lunaPriceUsd * 1e6,
    users: {}, tier: {}, usage: {},
    infra: { seats: D.infra.vercel.seats, seatPrice: D.infra.vercel.perSeatMonth, supabase: D.infra.supabase.month, other: D.infra.other.month },
    extraLunasUsd: 0,
    market: { gmv: 2000, fee: T.marketplace.platformFeePct, salePrice: T.marketplace.salePriceUsd, sales: 40 },
    margin: T.payAsYouGoMarkup
  };
  T.tiers.forEach(function (t) { S.tier[t.id] = { price: t.priceUsd, lunas: t.lunas, storageGb: t.storageGb }; });
  T.usage.forEach(function (u) { S.users[u.id] = u.users; S.usage[u.id] = JSON.parse(JSON.stringify(u)); });

  var USAGE_ROWS = [
    ["uploadsPdf", "PDF uploads"], ["pages", "Pages per PDF"], ["uploadsDocx", "Word uploads"],
    ["plans", "Study plans generated"], ["revises", "Re-plans"], ["agentRunsMini", "Agent runs · Mini"], ["agentRunsPro", "Agent runs · Pro"],
    ["resourceConcepts", "Resources tagged"], ["coach", "Coach readings"], ["templateDesigns", "AI template designs"], ["storageMb", "Stored (MB, total)"]
  ];

  function perUser(u) {
    var uploads = u.uploadsPdf * (u.pages * (U.pdfPage + U.chunksPerPage * U.embedChunk) + U.concepts) + u.uploadsDocx * U.docxUpload;
    var plans = u.plans * U.plan + u.revises * U.revise;
    var agents = u.agentRunsMini * U.agentMini + u.agentRunsPro * U.agentPro;
    var coach = u.resourceConcepts * U.resourceConcepts + u.coach * U.coach;
    var design = u.templateDesigns * U.design;
    var lunas = (u.agentRunsMini + u.agentRunsPro) * U.agentTokens;
    return { uploads: uploads, plans: plans, agents: agents, coach: coach, design: design, total: uploads + plans + agents + coach + design, lunas: lunas };
  }

  function compute() {
    var ids = T.usage.map(function (u) { return u.id; });
    var out = { rows: {}, ai: 0, users: 0, revenue: 0, cat: { uploads: 0, plans: 0, agents: 0, coach: 0, design: 0 }, gb: 0 };
    ids.forEach(function (id) {
      var p = perUser(S.usage[id]);
      var n = Number(S.users[id]) || 0;
      var price = Number(S.tier[id].price) || 0;
      out.rows[id] = { per: p, users: n, price: price, rev: n * price, ai: n * p.total, label: S.usage[id].label };
      out.ai += n * p.total; out.users += n; out.revenue += n * price;
      Object.keys(out.cat).forEach(function (k) { out.cat[k] += n * p[k]; });
      out.gb += (n * (Number(S.usage[id].storageMb) || 0)) / 1024;
    });
    var I = D.infra;
    out.storageCost = Math.max(0, out.gb - I.supabase.dbIncludedGb) * I.supabase.dbOverGb;
    out.fixed = S.infra.seats * S.infra.seatPrice + S.infra.supabase + S.infra.other;
    out.infra = out.fixed + out.storageCost;
    out.extra = out.users * (Number(S.extraLunasUsd) || 0);
    out.market = (Number(S.market.gmv) || 0) * ((Number(S.market.fee) || 0) / 100);
    out.revenueAll = out.revenue + out.extra + out.market;
    out.cost = out.ai + out.infra;
    out.profit = out.revenueAll - out.cost;
    return out;
  }

  /* --------------------------------------------------------------- operating-cost calculator */
  var CAT_LABEL = { uploads: "Reading uploads", plans: "Study plans", agents: "Agent runs", coach: "Tagging & coach", design: "Template design" };
  var CAT_COLOR = { uploads: "#0071e3", plans: "#2f9e5b", agents: "#8a4fd6", coach: "#e0730f", design: "#d8366f" };

  function numInput(key, value, extra) { return '<input type="number" data-key="' + key + '" value="' + value + '" min="0" step="' + (extra || "any") + '">'; }

  function renderOp() {
    var el = $("#op-calc");
    var ids = T.usage.map(function (u) { return u.id; });
    var head = '<tr><th></th>' + ids.map(function (id) { return "<th>" + esc(S.usage[id].label) + "</th>"; }).join("") + "</tr>";
    var rows = '<tr class="grp"><td>Users</td>' + ids.map(function (id) { return "<td>" + numInput("users." + id, S.users[id], 1) + "</td>"; }).join("") + "</tr>" +
      '<tr><td>Plan price · $ / month</td>' + ids.map(function (id) { return "<td>" + numInput("tier." + id + ".price", S.tier[id].price) + "</td>"; }).join("") + "</tr>" +
      '<tr><td>Lunas included / month</td>' + ids.map(function (id) { return "<td>" + numInput("tier." + id + ".lunas", S.tier[id].lunas, 1000) + "</td>"; }).join("") + "</tr>" +
      USAGE_ROWS.map(function (r) { return "<tr><td>" + r[1] + " / month</td>" + ids.map(function (id) { return "<td>" + numInput("usage." + id + "." + r[0], S.usage[id][r[0]]) + "</td>"; }).join("") + "</tr>"; }).join("");
    el.innerHTML =
      '<div class="calc-grid"><div class="panel"><h3>Users &amp; what they do</h3><div class="table-wrap"><table class="inputs">' + head + rows + "</table></div></div>" +
      '<div class="panel"><h3>Infrastructure &amp; extras</h3>' +
      '<label class="field">Vercel seats <input type="number" data-key="infra.seats" value="' + S.infra.seats + '"></label>' +
      '<label class="field">Vercel $ / seat / month <input type="number" data-key="infra.seatPrice" value="' + S.infra.seatPrice + '"></label>' +
      '<label class="field">Supabase plan $ / month <input type="number" data-key="infra.supabase" value="' + S.infra.supabase + '"></label>' +
      '<label class="field">Domain, monitoring, email $ / month <input type="number" data-key="infra.other" value="' + S.infra.other + '"></label>' +
      '<label class="field">Extra lunas bought · $ / user / month <input type="number" data-key="extraLunasUsd" value="' + S.extraLunasUsd + '" step="any"></label>' +
      '<label class="field">Marketplace sales · $ / month (all sellers) <input type="number" data-key="market.gmv" value="' + S.market.gmv + '"></label>' +
      '<label class="field">Platform fee on sales · % <input type="number" data-key="market.fee" value="' + S.market.fee + '"></label>' +
      '<p class="note">Database storage over ' + D.infra.supabase.dbIncludedGb + ' GB is billed at $' + D.infra.supabase.dbOverGb + ' / GB. Vercel and Supabase prices are public list prices; update them in <code>manifest.mjs</code>.</p></div></div>' +
      '<div id="op-out"></div>';
    $$("input[data-key]", el).forEach(function (inp) { inp.addEventListener("input", onInput); });
    renderOpOut();
  }

  function setPath(path, value) {
    var parts = path.split(".");
    var obj = S;
    for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value === "" ? 0 : Number(value);
  }
  function onInput(event) {
    var key = event.target.getAttribute("data-key");
    setPath(key, event.target.value);
    $$('input[data-key="' + key + '"]').forEach(function (other) { if (other !== event.target) other.value = event.target.value; });
    renderOpOut();
    renderMoneyOut();
  }

  function renderOpOut() {
    var c = compute();
    var cats = Object.keys(c.cat);
    var stack = cats.map(function (k) { return '<i style="width:' + (c.ai ? (c.cat[k] / c.ai) * 100 : 0).toFixed(2) + "%;background:" + CAT_COLOR[k] + '" title="' + CAT_LABEL[k] + '"></i>'; }).join("");
    var legend = cats.map(function (k) { return '<span class="legend-i"><i style="background:' + CAT_COLOR[k] + '"></i>' + CAT_LABEL[k] + " <b>" + usd(c.cat[k]) + "</b> (" + pct(c.ai ? c.cat[k] / c.ai : 0) + ")</span>"; }).join("");
    var perRows = Object.keys(c.rows).map(function (id) {
      var r = c.rows[id];
      var inc = Number(S.tier[id].lunas) || 0;
      var margin = r.price - r.per.total;
      return "<tr><td><strong>" + esc(r.label) + "</strong></td><td class='r'>" + n0(r.users) + "</td><td class='r'>" + usd(r.per.total) + "</td><td class='r'>" + usd(r.price) + "</td><td class='r " + (margin < 0 ? "neg" : "pos") + "'>" + usd(margin) + "</td><td class='r'>" + n0(r.per.lunas) + " / " + n0(inc) + "</td></tr>";
    }).join("");
    var marginPct = c.revenueAll ? c.profit / c.revenueAll : 0;
    $("#op-out").innerHTML =
      '<div class="tiles">' +
      tile("Revenue / month", usd(c.revenueAll), usd(c.revenue) + " subscriptions" + (c.extra ? " · " + usd(c.extra) + " lunas" : "") + (c.market ? " · " + usd(c.market) + " marketplace fees" : "")) +
      tile("AI cost / month", usd(c.ai), "OpenAI + embeddings, " + n0(c.users) + " users") +
      tile("Infrastructure / month", usd(c.infra), usd(c.fixed) + " fixed + " + usd(c.storageCost) + " storage (" + c.gb.toFixed(1) + " GB)") +
      tile("Profit / month", usd(c.profit), pct(marginPct) + " margin", c.profit < 0 ? "neg" : "pos") +
      tile("Cost per user", usd(c.users ? c.cost / c.users : 0), "AI + infrastructure, averaged") +
      tile("Break-even users", c.revenue && c.users ? n0(Math.ceil(c.infra / Math.max(0.0001, (c.revenueAll - c.ai) / c.users))) : "—", "where subscriptions cover infrastructure") +
      "</div>" +
      '<div class="panel"><h3>Where the AI money goes</h3><div class="stack">' + stack + '</div><div class="legend">' + legend + "</div></div>" +
      '<div class="panel"><h3>Per kind of user</h3><div class="table-wrap"><table class="plain compact"><thead><tr><th>Profile</th><th class="r">Users</th><th class="r">AI cost / user</th><th class="r">Plan price</th><th class="r">Margin / user</th><th class="r">Lunas used / included</th></tr></thead><tbody>' + perRows + "</tbody></table></div>" +
      '<p class="note">“Lunas used” follows today\'s rule: only agent runs spend lunas, 1 luna per token. AI cost per user is the real OpenAI bill including uploads, which are <b>not</b> charged in lunas yet.</p></div>';
  }
  function tile(label, value, sub, cls) { return '<div class="tile ' + (cls || "") + '"><span>' + esc(label) + "</span><strong>" + value + "</strong><small>" + sub + "</small></div>"; }

  /* --------------------------------------------------------------------- lunas calculator */
  function renderMoney() {
    $("#money-calc").innerHTML =
      '<div class="panel"><h3>What is a luna worth?</h3>' +
      '<label class="field">Price of 1,000,000 lunas · $ <input type="number" data-key="lunaPriceM" value="' + S.lunaPriceM + '" step="any"></label>' +
      '<p class="note">Assumption — the real price is a business decision. Today the app charges 1 luna per model token, whichever model runs.</p>' +
      '<div id="money-unit"></div></div>' +
      '<div class="two"><div class="panel"><h3>Marketplace example</h3>' +
      '<label class="field">Price of one sale · $ <input type="number" data-key="market.salePrice" value="' + S.market.salePrice + '" step="any"></label>' +
      '<label class="field">Sales in a month <input type="number" data-key="market.sales" value="' + S.market.sales + '"></label>' +
      '<label class="field">Platform fee · % <input type="number" data-key="market.fee" value="' + S.market.fee + '"></label>' +
      '<div id="money-market"></div></div>' +
      '<div class="panel"><h3>Do the plans cover their usage?</h3><div id="money-tiers"></div></div></div>';
    $$("#money-calc input[data-key]").forEach(function (inp) { inp.addEventListener("input", onInput); });
    renderMoneyOut();
  }

  function renderMoneyOut() {
    if (!$("#money-unit")) return;
    var perLuna = S.lunaPriceM / 1e6;
    var tokens = U.agentTokens;
    var models = [["Luna 3 Mini", "gpt-4o-mini", U.agentMini], ["Luna 3 Pro", "gpt-4o", U.agentPro], ["Luna 3 Max", "gpt-4.1", U.agentMax]];
    var rows = models.map(function (m) {
      var charged = tokens * perLuna;
      var margin = (charged - m[2]) / charged;
      return "<tr><td><strong>" + m[0] + "</strong><small class='brand'>" + m[1] + "</small></td><td class='r'>" + n0(tokens) + "</td><td class='r'>" + usd(m[2]) + "</td><td class='r'>" + usd(charged) + "</td><td class='r " + (margin < 0 ? "neg" : "pos") + "'>" + pct(margin) + "</td></tr>";
    }).join("");
    var pdfLunas = (10 * U.pdfPage) / perLuna;
    var pdfCharged = pdfLunas * perLuna;
    $("#money-unit").innerHTML =
      '<div class="table-wrap"><table class="plain compact"><thead><tr><th>10-question quiz</th><th class="r">Lunas charged</th><th class="r">OpenAI cost</th><th class="r">Revenue</th><th class="r">Gross margin</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="note">To make a 10-page PDF upload break even at this luna price you would charge ≈ <b>' + n0(pdfLunas) + " lunas</b> (" + n0(pdfLunas / 10) + " per page), i.e. " + usd(pdfCharged) + ". Today it is charged <b>0</b>.</p>";

    var m = S.market;
    var gross = m.salePrice * m.sales;
    var fee = gross * (m.fee / 100);
    var seller = gross - fee;
    $("#money-market").innerHTML =
      '<div class="tiles small">' + tile("Buyers pay", usd(gross), n0(gross / Math.max(perLuna, 1e-9)) + " lunas") + tile("Platform keeps", usd(fee), pct(m.fee / 100) + " fee") + tile("Seller earns", usd(seller), n0(seller / Math.max(perLuna, 1e-9)) + " lunas") + "</div>" +
      '<p class="note">The seller\'s earned lunas can pay for ≈ <b>' + n0(seller / Math.max(U.agentMini, 1e-9)) + "</b> more 10-question quizzes on Luna 3 Mini — or, once cash-out exists, be withdrawn.</p>";

    var tierRows = T.usage.map(function (u) {
      var id = u.id;
      var p = perUser(S.usage[id]);
      var included = Number(S.tier[id].lunas) || 0;
      var worth = included * perLuna;
      var price = Number(S.tier[id].price) || 0;
      var status = p.lunas <= included ? "ok" : "over";
      return "<tr><td><strong>" + esc(S.usage[id].label) + "</strong></td><td class='r'>" + usd(price) + "</td><td class='r'>" + n0(included) + "</td><td class='r'>" + usd(worth) + "</td><td class='r'>" + n0(p.lunas) + "</td><td class='r " + (status === "ok" ? "pos" : "neg") + "'>" + (status === "ok" ? "covered" : "needs " + n0(p.lunas - included) + " more") + "</td></tr>";
    }).join("");
    $("#money-tiers").innerHTML = '<div class="table-wrap"><table class="plain compact"><thead><tr><th>Profile</th><th class="r">Price</th><th class="r">Lunas included</th><th class="r">Worth</th><th class="r">Lunas used</th><th class="r">Verdict</th></tr></thead><tbody>' + tierRows + "</tbody></table></div><p class='note'>Compares each profile's included lunas with the agent runs it does in the operating-cost assumptions above. “Worth” is the included lunas at the luna price you set.</p>";
  }

  renderOp();
  renderMoney();

  /* ------------------------------------------------------------------ presentation mode */
  document.addEventListener("keydown", function (event) {
    if (event.target.tagName === "INPUT" || event.metaKey || event.ctrlKey) return;
    if (event.key === "p" || event.key === "P") document.body.classList.toggle("present");
    if (document.body.classList.contains("present") && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      var secs = $$("main > section");
      var y = window.scrollY + 40;
      var idx = 0;
      secs.forEach(function (s, i) { if (s.offsetTop <= y) idx = i; });
      var next = secs[Math.max(0, Math.min(secs.length - 1, idx + (event.key === "ArrowRight" ? 1 : -1)))];
      next.scrollIntoView({ behavior: "smooth" });
      event.preventDefault();
    }
  });
})();
