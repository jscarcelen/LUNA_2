/**
 * GET /api/cron/privacy — the daily privacy job (see vercel.json "crons"): erases accounts whose 30-day deletion
 * grace period is over and drops expired guardian-consent requests. Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * anything else is refused (and with no CRON_SECRET configured the route stays closed).
 */
import { timingSafeEqual } from "node:crypto";
import { handleInactiveAccounts, purgeDue } from "../../../../lib/accountData.js";
import { json, rejectUnconfigured } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorised(request) {
  const secret = String(process.env.CRON_SECRET || "");
  if (!secret) return false;
  const given = String(request.headers.get("authorization") || "");
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request) {
  if (!authorised(request)) return json({ error: "Not allowed." }, 401);
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const inactive = await handleInactiveAccounts();
    return json({ ok: true, erased: await purgeDue(), inactiveWarned: inactive.warned, inactiveScheduled: inactive.scheduled });
  } catch (error) {
    console.error("[api/cron/privacy]", error);
    return json({ error: "The privacy job failed." }, 500);
  }
}
