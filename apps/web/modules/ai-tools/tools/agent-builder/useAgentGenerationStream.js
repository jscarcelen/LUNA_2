"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const GENERATION_STEPS = [
  { id: "scope", label: "Reading your knowledge", detail: "Loading the selected documents" },
  { id: "chunk", label: "Splitting into passages", detail: "Preparing the material for retrieval" },
  { id: "retrieve", label: "Selecting relevant passages", detail: "Ranking the best evidence for this run" },
  { id: "generate", label: "Writing the output", detail: "The agent is composing each item" },
  { id: "validate", label: "Checking the result", detail: "Structure, counts, duplicates" }
];

function initialStepState() {
  return Object.fromEntries(GENERATION_STEPS.map((step) => [step.id, { status: "pending", meta: {} }]));
}

/**
 * Consumes /api/ai-tools/agent-builder/stream and exposes a live step-by-step state.
 * Falls back to the non-streaming endpoint if the stream cannot be read (older browsers, proxies).
 */
export function useAgentGenerationStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [steps, setSteps] = useState(initialStepState);
  const [tokenChars, setTokenChars] = useState(0);
  const [tokenTail, setTokenTail] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!isGenerating) return undefined;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const reset = useCallback(() => {
    setSteps(initialStepState());
    setTokenChars(0);
    setTokenTail("");
    setElapsedMs(0);
    setError("");
  }, []);

  const applyEvent = useCallback((event) => {
    if (!event || !event.step) return;
    if (event.step === "generate" && event.status === "token") {
      setTokenChars(event.chars || 0);
      setTokenTail((previous) => `${previous}${event.delta || ""}`.slice(-160));
      return;
    }
    if (event.step === "error") {
      setError(event.error || "Agent generation failed");
      setSteps((previous) => {
        const next = { ...previous };
        for (const id of Object.keys(next)) {
          if (next[id].status === "active") next[id] = { ...next[id], status: "error" };
        }
        return next;
      });
      return;
    }
    if (event.step === "done") {
      setResult(event.result || null);
      setSteps((previous) => Object.fromEntries(Object.entries(previous).map(([id, state]) => [id, { ...state, status: "done" }])));
      return;
    }
    setSteps((previous) => ({
      ...previous,
      [event.step]: {
        status: event.status === "start" ? "active" : "done",
        meta: { ...(previous[event.step]?.meta || {}), ...event }
      }
    }));
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const generate = useCallback(async (config) => {
    reset();
    setResult(null);
    setIsGenerating(true);
    startedAtRef.current = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai-tools/agent-builder/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`Agent generation failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult = null;
      let streamError = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event = null;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.step === "done") finalResult = event.result || null;
          if (event.step === "error") streamError = event.error || "Agent generation failed";
          applyEvent(event);
        }
      }

      if (streamError) throw new Error(streamError);
      if (!finalResult) throw new Error("The generation ended without a result.");
      return finalResult;
    } catch (caught) {
      const message = caught?.name === "AbortError" ? "Generation cancelled." : String(caught?.message || caught);
      setError(message);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [applyEvent, reset]);

  return { generate, cancel, isGenerating, steps, tokenChars, tokenTail, elapsedMs, error, result };
}
