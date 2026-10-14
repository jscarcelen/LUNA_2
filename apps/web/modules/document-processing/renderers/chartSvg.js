/**
 * Charts as data: a chart block keeps the numbers it plots ({ type, categories, series }) and is drawn as an SVG from them,
 * so the same numbers draw the same chart in the reader, the HTML/PDF exports and the editor where you change them.
 * Pure functions, no DOM: they run on the server (renderers) and in the browser (the chart editor).
 */

export const CHART_COLORS = ["#0071e3", "#7a1a14", "#2e9e5b", "#e8912d", "#8e44ad", "#00a3a3"];

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/[−–]/g, "-").replace(/,/g, ".").replace(/[%\s]/g, ""));
  return Number.isFinite(number) ? number : null;
};

/** Any chart object (from the model or the editor) as a clean { type, title, xLabel, yLabel, categories, series }. */
export function normalizeChart(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const categories = (Array.isArray(source.categories) ? source.categories : []).map((category) => String(category ?? ""));
  const series = (Array.isArray(source.series) ? source.series : []).slice(0, 8).map((entry, index) => {
    const values = (Array.isArray(entry?.values) ? entry.values : []).map(toNumber);
    while (values.length < categories.length) values.push(null);
    return { name: String(entry?.name || `Series ${index + 1}`), values: values.slice(0, Math.max(categories.length, values.length)) };
  });
  const width = Math.max(categories.length, ...series.map((entry) => entry.values.length), 0);
  while (categories.length < width) categories.push("");
  for (const entry of series) while (entry.values.length < width) entry.values.push(null);
  return {
    type: source.type === "line" ? "line" : "bar",
    title: String(source.title || ""),
    xLabel: String(source.xLabel || ""),
    yLabel: String(source.yLabel || ""),
    categories,
    series
  };
}

/** A chart as a plain table (header row + one row per category): for the Markdown and text renderers. */
export function chartToRows(chart) {
  const c = normalizeChart(chart);
  return [[c.xLabel || "", ...c.series.map((entry) => entry.name)], ...c.categories.map((category, row) => [category, ...c.series.map((entry) => (entry.values[row] === null ? "" : String(entry.values[row])))])];
}

function niceScale(min, max, count = 5) {
  if (min === max) { max = min + 1; if (min === 0) min = -1; }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) || 10 * magnitude;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = lo; value <= hi + step / 2; value += step) ticks.push(Math.round(value / step * 1e6) / 1e6 * step);
  return { lo, hi, ticks };
}

const fmt = (value) => (Math.abs(value) >= 1000 ? String(Math.round(value)) : String(Math.round(value * 100) / 100));

/** The chart as an <svg> string (width 100%, 720 × auto). */
export function chartToSvg(chart) {
  const c = normalizeChart(chart);
  const n = c.categories.length;
  if (!n || !c.series.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 80" width="100%" role="img" aria-label="Empty chart"><text x="360" y="44" text-anchor="middle" font-size="13" fill="#6e6e73">No numbers yet</text></svg>`;

  const all = c.series.flatMap((entry) => entry.values).filter((value) => value !== null);
  const { lo, hi, ticks } = niceScale(Math.min(0, ...all), Math.max(0, ...all));
  const rotate = n > 8 || Math.max(...c.categories.map((category) => category.length)) > 7;
  const longest = Math.max(...c.categories.map((category) => category.length), 1);
  const labelRoom = rotate ? Math.min(90, 14 + longest * 6.2) : 24;
  const W = 720, left = c.yLabel ? 62 : 48, right = 16, top = c.series.length > 1 || c.title ? 40 : 16, bottom = labelRoom + (c.xLabel ? 20 : 4), H = 330 + (rotate ? 0 : -20);
  const pw = W - left - right, ph = H - top - bottom;
  const y = (value) => top + ph - ((value - lo) / (hi - lo)) * ph;
  const group = pw / n;
  const parts = [];

  for (const tick of ticks) {
    parts.push(`<line x1="${left}" x2="${W - right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" stroke="${tick === 0 ? "#86868b" : "#e5e5ea"}" stroke-width="${tick === 0 ? 1.2 : 1}"/>`);
    parts.push(`<text x="${left - 8}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#6e6e73">${esc(fmt(tick))}</text>`);
  }
  if (c.type === "bar") {
    const bw = Math.max(1.5, (group * 0.78) / c.series.length);
    c.series.forEach((entry, s) => entry.values.forEach((value, i) => {
      if (value === null) return;
      const x = left + i * group + (group - bw * c.series.length) / 2 + s * bw;
      const y0 = y(0), y1 = y(value);
      parts.push(`<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${(bw - 0.6).toFixed(1)}" height="${Math.max(0.5, Math.abs(y1 - y0)).toFixed(1)}" fill="${CHART_COLORS[s % CHART_COLORS.length]}"><title>${esc(entry.name)} · ${esc(c.categories[i])}: ${esc(fmt(value))}</title></rect>`);
    }));
  } else {
    c.series.forEach((entry, s) => {
      const color = CHART_COLORS[s % CHART_COLORS.length];
      const points = entry.values.map((value, i) => (value === null ? null : [left + i * group + group / 2, y(value), value, i]));
      const path = points.filter(Boolean).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
      if (path) parts.push(`<polyline points="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`);
      for (const p of points.filter(Boolean)) parts.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${color}"><title>${esc(entry.name)} · ${esc(c.categories[p[3]])}: ${esc(fmt(p[2]))}</title></circle>`);
    });
  }
  const every = Math.max(1, Math.ceil(n / 60));
  c.categories.forEach((category, i) => {
    if (i % every) return;
    const x = left + i * group + group / 2, base = top + ph + 14;
    parts.push(rotate
      ? `<text transform="translate(${x.toFixed(1)} ${base}) rotate(-90)" text-anchor="end" dominant-baseline="middle" font-size="10" fill="#6e6e73">${esc(category)}</text>`
      : `<text x="${x.toFixed(1)}" y="${base}" text-anchor="middle" font-size="11" fill="#6e6e73">${esc(category)}</text>`);
  });
  if (c.yLabel) parts.push(`<text transform="translate(14 ${(top + ph / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="12" fill="#1d1d1f">${esc(c.yLabel)}</text>`);
  if (c.xLabel) parts.push(`<text x="${(left + pw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#1d1d1f">${esc(c.xLabel)}</text>`);
  let lx = left;
  if (c.series.length > 1) c.series.forEach((entry, s) => {
    parts.push(`<rect x="${lx}" y="12" width="12" height="12" rx="2" fill="${CHART_COLORS[s % CHART_COLORS.length]}"/><text x="${lx + 17}" y="22" font-size="12" fill="#1d1d1f">${esc(entry.name)}</text>`);
    lx += 30 + entry.name.length * 6.6;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(c.title || "Chart")}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${parts.join("")}</svg>`;
}

/** The HTML for a chart block: the SVG plus its numbers (data-chart), so a viewer can redraw it after the numbers change. */
export function chartToHtml(chart) {
  const c = normalizeChart(chart);
  return `<figure class="luna-chart" data-chart="${esc(JSON.stringify(c))}" title="Click the chart to change its numbers" style="margin:1em 0;cursor:pointer">${chartToSvg(c)}${c.title ? `<figcaption style="font-size:.85em;color:#6e6e73;text-align:center">${esc(c.title)}</figcaption>` : ""}</figure>`;
}
