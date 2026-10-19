"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "./credits";
import { formatNumber } from "../../lib/i18n/index.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * "This run will use about N tokens" — fetched from /estimate whenever the config changes.
 * Pass the same config object the Generate button will send.
 */
/** @returns {{ estimate: { totalTokens: number, inputTokens: number, outputTokens: number, costUsd: number, model: string, documentCount: number, truncated: boolean } | null, loading: boolean }} */
export function useRunEstimate(config, enabled = true) {
  /** @type {[any, Function]} */
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(config || {});
  const timer = useRef(null);
  useEffect(() => {
    if (!enabled || !config) { setEstimate(null); return undefined; }
    window.clearTimeout(timer.current);
    const controller = new AbortController();
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/ai-tools/agent-builder/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: key === "{}" ? "{}" : JSON.stringify({ config }), signal: controller.signal });
        const data = await response.json();
        if (!controller.signal.aborted) setEstimate(data?.error ? null : data);
      } catch {
        if (!controller.signal.aborted) setEstimate(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 500);
    return () => { controller.abort(); window.clearTimeout(timer.current); };
  }, [key, enabled]);
  return { estimate, loading };
}

export function RunEstimateLine({ estimate, loading, balance }) {
  const t = useT();
  const n = (value) => formatNumber(value, t.locale);
  if (loading && !estimate) return <p className="m-0 text-[11px] text-soft-ink">{t("misc.est.estimating")}</p>;
  if (!estimate) return null;
  const tooExpensive = typeof balance === "number" && estimate.totalTokens > balance;
  return (
    <p className={`m-0 text-[11px] ${tooExpensive ? "font-semibold text-[var(--color-danger)]" : "text-soft-ink"}`} title={t("misc.est.tip", { input: n(estimate.inputTokens), output: n(estimate.outputTokens), model: estimate.model })}>
      {t("misc.est.cost")} <strong className="text-ink">{t("misc.est.approx", { n: n(estimate.totalTokens) })}</strong> ({formatUsd(estimate.costUsd)})
      {estimate.documentCount ? ` · ${t.plural("misc.est.reads", estimate.documentCount)}${estimate.truncated ? ` ${t("misc.est.largest")}` : ` ${t("misc.est.full")}`}` : ""}
      {tooExpensive ? ` ${t("misc.est.notEnough")}` : ""}
    </p>
  );
}
