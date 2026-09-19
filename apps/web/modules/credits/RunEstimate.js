"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "./credits";

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
  if (loading && !estimate) return <p className="m-0 text-[11px] text-soft-ink">Estimating cost…</p>;
  if (!estimate) return null;
  const tooExpensive = typeof balance === "number" && estimate.totalTokens > balance;
  return (
    <p className={`m-0 text-[11px] ${tooExpensive ? "font-semibold text-[var(--color-danger)]" : "text-soft-ink"}`} title={`≈ ${estimate.inputTokens.toLocaleString("en-US")} in + ${estimate.outputTokens.toLocaleString("en-US")} out · ${estimate.model}`}>
      Estimated cost: <strong className="text-ink">≈ {estimate.totalTokens.toLocaleString("en-US")} lunas</strong> ({formatUsd(estimate.costUsd)})
      {estimate.documentCount ? ` · reads ${estimate.documentCount} document${estimate.documentCount === 1 ? "" : "s"}${estimate.truncated ? " (largest parts only)" : " in full"}` : ""}
      {tooExpensive ? " — not enough lunas" : ""}
    </p>
  );
}
