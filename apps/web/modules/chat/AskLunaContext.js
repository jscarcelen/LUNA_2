"use client";

import { createContext, useContext } from "react";

/**
 * Where "Ask Luna" finds the workspace tree. AppShell provides it once, so a reader opened from any
 * page (plans, workspaces, activities, a run) can work out which documents to read without every
 * caller passing the workspace down.
 */
const AskLunaContext = createContext({ workspaces: [], selectedWorkspaceId: "", selectedSubjectId: "" });

export const AskLunaProvider = AskLunaContext.Provider;
export const useAskLunaWorkspace = () => useContext(AskLunaContext);
