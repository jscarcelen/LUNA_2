/**
 * Who may spend the AI budget. Every route that calls a model provider (OpenAI, Anthropic, Mathpix) asks this
 * first, because those routes are otherwise open to anyone on the internet: without it an anonymous script could
 * run up the provider bill or use Luna as a free proxy to the model.
 *
 *   const blocked = await denyAnonymousAi(request);
 *   if (blocked) return blocked;
 *
 * A logged-in account always passes (a session from before a password change does not). The public demo
 * (`/app`, no account) passes only when `LUNA_DEMO_AI=on`, and always in local development.
 */
import { NextResponse } from "next/server";
import { accountIdForFresh } from "./session.js";

export function demoAiAllowed(env = process.env) {
  if (String(env.LUNA_DEMO_AI || "").trim().toLowerCase() === "on") return true;
  return env.NODE_ENV !== "production";
}

/** @returns {Promise<Response | null>} a 401 to send back, or null when the request may use the AI. */
export async function denyAnonymousAi(request, { env = process.env } = {}) {
  if (await accountIdForFresh(request)) return null;
  if (demoAiAllowed(env)) return null;
  return NextResponse.json({ error: "Log in to use Luna's AI.", loginRequired: true }, { status: 401 });
}
