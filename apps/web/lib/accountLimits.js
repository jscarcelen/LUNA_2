/**
 * The in-memory brakes of the email / reset / settings routes, in one place so tests can clear them.
 * (Per server instance: a best-effort limit on serverless, never the only protection - tokens are 256 bits,
 * and notification emails are also limited by what is stored in the database.)
 */
import { createRateLimiter } from "./accountsCore.js";

const HOUR = 60 * 60 * 1000;
const QUARTER = 15 * 60 * 1000;

export const limits = {
  resetByEmail: createRateLimiter({ limit: 3, windowMs: HOUR }),
  resetByAddress: createRateLimiter({ limit: 10, windowMs: HOUR }),
  resetConfirmByAddress: createRateLimiter({ limit: 30, windowMs: QUARTER }),
  verifyByAddress: createRateLimiter({ limit: 30, windowMs: QUARTER }),
  resendByAccount: createRateLimiter({ limit: 3, windowMs: HOUR }),
  resendByAddress: createRateLimiter({ limit: 10, windowMs: HOUR }),
  settingsWrongGuesses: createRateLimiter({ limit: 5, windowMs: QUARTER }),
  /** Emails sent to other people, per sender. */
  notifyBySender: createRateLimiter({ limit: 20, windowMs: HOUR }),
  /** "X shared an agent/template/component with you" emails: 3 an hour per sharer and person. */
  shareCopyByPair: createRateLimiter({ limit: 3, windowMs: HOUR })
};

export function clearAccountLimits() {
  for (const limiter of Object.values(limits)) limiter.clear();
}
