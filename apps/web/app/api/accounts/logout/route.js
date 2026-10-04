/** POST /api/accounts/logout — clears the session cookie. */
import { json, rejectCrossSite } from "../../../../lib/accountsApi.js";
import { loggedOutCookie } from "../../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", loggedOutCookie(request));
  return response;
}
