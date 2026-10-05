/**
 * Outgoing email, small and pluggable. Server only (Node runtime).
 *
 * Provider order, decided by environment variables only:
 *   1. SMTP    LUNA_SMTP_URL (e.g. smtps://user:app-password@smtp.gmail.com:465) + LUNA_MAIL_FROM
 *              -> `nodemailer`, imported lazily, only on this path
 *   2. Resend  RESEND_API_KEY + LUNA_MAIL_FROM -> Resend's REST API through fetch (no SDK)
 *   3. none    development: the email (subject, link) is printed to the server console and returned as
 *              `devPreview`; production: nothing is sent, nothing leaks, `mailSetupNeeded: true`.
 *
 * `sendMail` never throws and its result never contains credentials or provider error bodies. A
 * verification / reset link is only ever returned to the browser (`devPreview`) outside production.
 */

const SEND_TIMEOUT_MS = 8000;

/** Strips line breaks (header injection) and trims. */
const oneLine = (value) => String(value ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").trim();

const isProduction = (env) => String(env?.NODE_ENV || "") === "production";

/**
 * Which provider will be used? Pure, so it is easy to test. Never returns the secrets themselves.
 * @returns {{ provider: "smtp" | "resend" | "none", from: string }}
 */
export function resolveMailProvider(env = process.env) {
  const from = oneLine(env.LUNA_MAIL_FROM);
  if (from && oneLine(env.LUNA_SMTP_URL)) return { provider: "smtp", from };
  if (from && oneLine(env.RESEND_API_KEY)) return { provider: "resend", from };
  return { provider: "none", from };
}

/** Is a real provider configured (so a link sent by email can actually arrive)? */
export function isMailConfigured(env = process.env) {
  return resolveMailProvider(env).provider !== "none";
}

/** Removes every configured secret from a piece of text before it is logged or returned. */
export function redactSecrets(text, env = process.env) {
  let out = String(text ?? "");
  const secrets = new Set();
  const smtp = oneLine(env.LUNA_SMTP_URL);
  if (smtp) {
    secrets.add(smtp);
    try {
      const url = new URL(smtp);
      if (url.password) {
        secrets.add(url.password);
        try { secrets.add(decodeURIComponent(url.password)); } catch { /* keep the raw form */ }
      }
      if (url.username) {
        secrets.add(url.username);
        try { secrets.add(decodeURIComponent(url.username)); } catch { /* keep the raw form */ }
      }
    } catch { /* not a URL: the whole string is already a secret */ }
  }
  if (oneLine(env.RESEND_API_KEY)) secrets.add(oneLine(env.RESEND_API_KEY));
  for (const secret of [...secrets].filter((value) => value.length >= 3).sort((a, b) => b.length - a.length)) out = out.split(secret).join("[redacted]");
  return out;
}

/**
 * The public address links in emails point to: `LUNA_PUBLIC_URL` when set (recommended in production, so a
 * forged Host header can never end up in a reset link), otherwise the request's own origin.
 */
export function publicBaseUrl(request, env = process.env) {
  const configured = oneLine(env.LUNA_PUBLIC_URL).replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    } catch { /* fall through */ }
  }
  const header = (name) => (typeof request?.headers?.get === "function" ? request.headers.get(name) : request?.headers?.[name]) || "";
  const host = oneLine(header("x-forwarded-host") || header("host")).split(",")[0].trim();
  const proto = oneLine(header("x-forwarded-proto")).split(",")[0].trim();
  if (host && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return `${proto === "http" || proto === "https" ? proto : (isProduction(env) ? "https" : "http")}://${host}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

async function sendWithResend(message, from, env, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${oneLine(env.RESEND_API_KEY)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: controller.signal
    });
    if (!response.ok) return { delivered: false, provider: "resend", error: `Resend refused the message (HTTP ${response.status}).` };
    return { delivered: true, provider: "resend" };
  } catch (error) {
    return { delivered: false, provider: "resend", error: error?.name === "AbortError" ? "Resend did not answer in time." : "Could not reach Resend." };
  } finally {
    clearTimeout(timer);
  }
}

function smtpUrlWithTimeouts(raw) {
  const url = new URL(raw);
  for (const [key, value] of [["connectionTimeout", "8000"], ["greetingTimeout", "8000"], ["socketTimeout", "12000"]]) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  return url.toString();
}

async function defaultTransportFactory(smtpUrl) {
  const { default: nodemailer } = await import("nodemailer");
  return nodemailer.createTransport(smtpUrlWithTimeouts(smtpUrl));
}

async function sendWithSmtp(message, from, env, transportFactory) {
  try {
    const transport = await transportFactory(oneLine(env.LUNA_SMTP_URL));
    await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    return { delivered: true, provider: "smtp" };
  } catch (error) {
    // Only the error's code is kept: its text can quote the connection URL.
    const code = /^[A-Z_]{3,30}$/.test(String(error?.code || "")) ? ` (${error.code})` : "";
    return { delivered: false, provider: "smtp", error: `The SMTP server did not accept the message${code}. Check LUNA_SMTP_URL and LUNA_MAIL_FROM.` };
  }
}

/**
 * Sends one email.
 * @param {{ to: string, subject: string, text: string, html: string, links?: string[] }} message
 * @param {{ env?: object, fetchImpl?: Function, transportFactory?: Function, logger?: { info: Function, warn: Function, error: Function } }} [options]
 * @returns {Promise<{ delivered: boolean, provider: "smtp"|"resend"|"none", mailSetupNeeded?: boolean, devPreview?: object, error?: string }>}
 */
export async function sendMail(message, { env = process.env, fetchImpl = globalThis.fetch, transportFactory = defaultTransportFactory, logger = console } = {}) {
  const clean = { ...message, to: oneLine(message.to), subject: oneLine(message.subject) };
  if (!clean.to || !clean.to.includes("@")) return { delivered: false, provider: "none", error: "No recipient." };
  const { provider, from } = resolveMailProvider(env);

  if (provider === "none") {
    if (isProduction(env)) {
      // No token or link is logged or returned in production: the deployment simply cannot send email yet.
      logger.warn("[mail] no email provider is configured (LUNA_SMTP_URL or RESEND_API_KEY, plus LUNA_MAIL_FROM); the message was not sent.");
      return { delivered: false, provider: "none", mailSetupNeeded: true };
    }
    const links = (clean.links || []).map(oneLine);
    logger.info(`[mail:dev] to=${clean.to} subject="${clean.subject}"${links.length ? `\n${links.map((link) => `  link: ${link}`).join("\n")}` : ""}`);
    return { delivered: false, provider: "none", mailSetupNeeded: true, devPreview: { to: clean.to, subject: clean.subject, links, text: clean.text } };
  }

  const result = provider === "smtp"
    ? await sendWithSmtp(clean, from, env, transportFactory)
    : await sendWithResend(clean, from, env, fetchImpl);
  if (!result.delivered) logger.warn(`[mail] ${redactSecrets(result.error || "send failed", env)}`);
  return result.error ? { ...result, error: redactSecrets(result.error, env) } : result;
}
