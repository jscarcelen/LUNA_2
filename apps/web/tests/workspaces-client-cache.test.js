import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKeyFor, clearWorkspacesCache, invalidateWorkspaces, loadWorkspaces, peekWorkspaces, storeWorkspaces } from "../lib/workspacesClientCache.js";

const reply = (workspaces, ok = true) => vi.fn(async () => ({ ok, json: async () => (ok ? { workspaces } : { error: "boom" }) }));

describe("workspaces client cache", () => {
  beforeEach(() => clearWorkspacesCache());

  it("keys by account so a shared computer never mixes two people", () => {
    expect(cacheKeyFor({ id: "a1" })).toBe("account:a1");
    expect(cacheKeyFor(null)).toBe("demo");
  });

  it("shares one request between concurrent callers", async () => {
    const fetcher = reply([{ id: "w1" }]);
    const [a, b] = await Promise.all([loadWorkspaces("k", { fetcher }), loadWorkspaces("k", { fetcher, force: true })]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("does not ask again inside the freshness window, but force and invalidate do", async () => {
    const fetcher = reply([{ id: "w1" }]);
    let t = 1000;
    const now = () => t;
    await loadWorkspaces("k", { fetcher, now });
    t += 5000;
    await loadWorkspaces("k", { fetcher, now });
    expect(fetcher).toHaveBeenCalledTimes(1);
    invalidateWorkspaces("k");
    await loadWorkspaces("k", { fetcher, now });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await loadWorkspaces("k", { fetcher, now, force: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
    t += 60000;
    await loadWorkspaces("k", { fetcher, now });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("keeps the stale tree for display after an invalidation and takes a mutation's answer", () => {
    storeWorkspaces("k", [{ id: "w1" }]);
    invalidateWorkspaces("k");
    expect(peekWorkspaces("k")).toEqual([{ id: "w1" }]);
    storeWorkspaces("k", [{ id: "w2" }]);
    expect(peekWorkspaces("k")).toEqual([{ id: "w2" }]);
  });

  it("rejects with the server message and lets the next call retry", async () => {
    await expect(loadWorkspaces("k", { fetcher: reply([], false) })).rejects.toThrow("boom");
    const fetcher = reply([{ id: "w1" }]);
    await expect(loadWorkspaces("k", { fetcher })).resolves.toEqual([{ id: "w1" }]);
  });
});
