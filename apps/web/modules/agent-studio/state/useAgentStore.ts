import { useCallback, useReducer } from "react";
import type { AgentSpec, SpecChange } from "../engine/types";

export type Step = 1 | 2 | 3 | 4 | 5;
export interface LastRun { inputValues: Record<string, unknown>; output: { items: unknown[] } | null; checks: { rule: string; ok: boolean; message: string }[]; model?: string }

interface State { spec: AgentSpec | null; savedId: string; step: Step; wizard: boolean; history: AgentSpec[]; lastRun: LastRun | null; lastChanges: SpecChange[]; dirty: boolean }
type Action =
  | { type: "open"; spec: AgentSpec; savedId: string; wizard: boolean }
  | { type: "close" }
  | { type: "update"; updater: (spec: AgentSpec) => AgentSpec; changes?: SpecChange[] }
  | { type: "undo" }
  | { type: "step"; step: Step }
  | { type: "wizard"; on: boolean }
  | { type: "run"; run: LastRun }
  | { type: "saved"; id: string };

const initial: State = { spec: null, savedId: "", step: 1, wizard: true, history: [], lastRun: null, lastChanges: [], dirty: false };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "open": return { ...initial, spec: action.spec, savedId: action.savedId, wizard: action.wizard, dirty: !action.savedId };
    case "close": return initial;
    case "update": { if (!state.spec) return state; return { ...state, spec: { ...action.updater(state.spec), updatedAt: new Date().toISOString() }, history: [...state.history.slice(-30), state.spec], lastChanges: action.changes || [], dirty: true }; }
    case "undo": { const previous = state.history.at(-1); return previous ? { ...state, spec: previous, history: state.history.slice(0, -1), lastChanges: [], dirty: true } : state; }
    case "step": return { ...state, step: action.step };
    case "wizard": return { ...state, wizard: action.on };
    case "run": return { ...state, lastRun: action.run };
    case "saved": return { ...state, savedId: action.id, dirty: false };
    default: return state;
  }
}

export function useAgentStore() {
  const [state, dispatch] = useReducer(reducer, initial);
  const update = useCallback((updater: (spec: AgentSpec) => AgentSpec, changes?: SpecChange[]) => dispatch({ type: "update", updater, changes }), []);
  return { state, dispatch, update };
}
export type AgentStore = ReturnType<typeof useAgentStore>;
