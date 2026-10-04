import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSession, resolveSessionSecret, SESSION_COOKIE } from "../../lib/accountsCore.js";
import { accountIdFor, currentOwnerUserId, isAccountRequest, isDemoSurface, ownerUserIdFor, runAsOwner, sessionCookieFor, sessionFromRequest } from "../../lib/session.js";

const DEMO = "11111111-1111-1111-1111-111111111111";
const request = (headers = {}) => new Request("http://localhost/api/workspaces-supabase", { headers });
const cookieFor = (accountId, secret = resolveSessionSecret()) => `${SESSION_COOKIE}=${encodeURIComponent(signSession(accountId, secret))}`;

let saved;
beforeEach(() => {
  saved = { ...process.env };
  delete process.env.LUNA_DEMO_USER_ID;
  delete process.env.LUNA_SESSION_SECRET;
  process.env.NODE_ENV = "test";
});
afterEach(() => {
  process.env = saved;
});

describe("ownerUserIdFor", () => {
  it("is the demo owner without a session, exactly as before", () => {
    expect(ownerUserIdFor(request())).toBe(DEMO);
    expect(isAccountRequest(request())).toBe(false);
  });
  it("honours LUNA_DEMO_USER_ID for the demo", () => {
    process.env.LUNA_DEMO_USER_ID = "22222222-2222-2222-2222-222222222222";
    expect(ownerUserIdFor(request())).toBe("22222222-2222-2222-2222-222222222222");
  });
  it("is the account id with a valid session cookie", () => {
    const req = request({ cookie: cookieFor("acc-42") });
    expect(ownerUserIdFor(req)).toBe("acc-42");
    expect(accountIdFor(req)).toBe("acc-42");
    expect(isAccountRequest(req)).toBe(true);
  });
  it("ignores a forged or expired cookie", () => {
    expect(ownerUserIdFor(request({ cookie: cookieFor("acc-42", "x".repeat(40)) }))).toBe(DEMO);
    expect(ownerUserIdFor(request({ cookie: `${SESSION_COOKIE}=garbage` }))).toBe(DEMO);
    const expired = signSession("acc-42", resolveSessionSecret(), { now: Date.now() - 30 * 24 * 3600 * 1000 });
    expect(ownerUserIdFor(request({ cookie: `${SESSION_COOKIE}=${expired}` }))).toBe(DEMO);
  });
  it("never reads an owner from anywhere but the cookie", () => {
    const req = new Request("http://localhost/api/x?ownerUserId=victim", { headers: { "x-owner-user-id": "victim" } });
    expect(ownerUserIdFor(req)).toBe(DEMO);
  });
  it("treats a logged-in browser on the demo page (/app) as the demo, so the demo never touches real data", () => {
    const headers = { cookie: cookieFor("acc-42"), referer: "http://localhost:3000/app" };
    expect(isDemoSurface(request(headers))).toBe(true);
    expect(ownerUserIdFor(request(headers))).toBe(DEMO);
    expect(ownerUserIdFor(request({ ...headers, referer: "http://localhost:3000/platform" }))).toBe("acc-42");
    expect(ownerUserIdFor(request({ ...headers, referer: "http://localhost:3000/application" }))).toBe("acc-42");
  });
});

describe("currentOwnerUserId (deep server code with no request in hand)", () => {
  it("is the demo owner outside a request", async () => {
    expect(await currentOwnerUserId()).toBe(DEMO);
  });
  it("is the pinned owner for everything a streamed response does later", async () => {
    const seen = [];
    await new Promise((done) => {
      runAsOwner("acc-42", () => {
        setTimeout(async () => { seen.push(await currentOwnerUserId()); done(); }, 5);
      });
    });
    expect(seen).toEqual(["acc-42"]);
    expect(await currentOwnerUserId()).toBe(DEMO);
  });
});

describe("production without a session secret", () => {
  it("never authenticates anyone and refuses to mint a cookie", () => {
    const token = signSession("acc-42", resolveSessionSecret());
    process.env.NODE_ENV = "production";
    expect(sessionFromRequest(request({ cookie: `${SESSION_COOKIE}=${token}` }))).toBeNull();
    expect(ownerUserIdFor(request({ cookie: `${SESSION_COOKIE}=${token}` }))).toBe(DEMO);
    expect(() => sessionCookieFor("acc-42", request())).toThrow(/LUNA_SESSION_SECRET/);
  });
  it("works with the secret set, and marks the cookie Secure", () => {
    process.env.NODE_ENV = "production";
    process.env.LUNA_SESSION_SECRET = "p".repeat(48);
    const cookie = sessionCookieFor("acc-42", request());
    expect(cookie).toContain("Secure");
    const value = decodeURIComponent(cookie.split(";")[0].split("=").slice(1).join("="));
    expect(sessionFromRequest(request({ cookie: `${SESSION_COOKIE}=${value}` }))?.accountId).toBe("acc-42");
  });
});
