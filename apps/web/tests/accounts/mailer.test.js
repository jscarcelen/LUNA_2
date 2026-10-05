import { describe, expect, it, vi } from "vitest";
import { isMailConfigured, publicBaseUrl, redactSecrets, resolveMailProvider, sendMail } from "../../lib/mailer.js";
import { escapeHtml, invitationMail, linkAcceptedMail, linkRequestMail, resetPasswordMail, verifyEmailMail } from "../../lib/mailTemplates.js";

const SMTP = "smtps://luna.bot%40gmail.com:s3cr3t-app-pw@smtp.gmail.com:465";
const message = { to: "maria@home.com", subject: "Hello", text: "plain", html: "<p>html</p>", links: ["https://luna.test/verify-email?token=TOKEN123"] };
const quietLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const allOutput = (logger) => JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);

describe("provider selection", () => {
  it("uses SMTP when LUNA_SMTP_URL is set, even if Resend is configured too", () => {
    expect(resolveMailProvider({ LUNA_SMTP_URL: SMTP, RESEND_API_KEY: "re_x", LUNA_MAIL_FROM: "Luna <a@b.co>" })).toEqual({ provider: "smtp", from: "Luna <a@b.co>" });
  });
  it("uses Resend when only RESEND_API_KEY is set", () => {
    expect(resolveMailProvider({ RESEND_API_KEY: "re_x", LUNA_MAIL_FROM: "Luna <a@b.co>" }).provider).toBe("resend");
  });
  it("is none without a sender address, or without any provider", () => {
    expect(resolveMailProvider({ LUNA_SMTP_URL: SMTP }).provider).toBe("none");
    expect(resolveMailProvider({ RESEND_API_KEY: "re_x" }).provider).toBe("none");
    expect(resolveMailProvider({ LUNA_MAIL_FROM: "a@b.co" }).provider).toBe("none");
    expect(resolveMailProvider({}).provider).toBe("none");
    expect(isMailConfigured({})).toBe(false);
    expect(isMailConfigured({ RESEND_API_KEY: "re_x", LUNA_MAIL_FROM: "a@b.co" })).toBe(true);
  });
  it("falls through to Resend when SMTP has no sender but Resend is complete", () => {
    expect(resolveMailProvider({ LUNA_SMTP_URL: SMTP, RESEND_API_KEY: "re_x", LUNA_MAIL_FROM: "" }).provider).toBe("none");
  });
});

describe("sending", () => {
  it("SMTP: hands the message to the transport with the configured sender, importing nothing else", async () => {
    const sendMailFn = vi.fn(async () => ({}));
    const transportFactory = vi.fn(async () => ({ sendMail: sendMailFn }));
    const fetchImpl = vi.fn();
    const result = await sendMail(message, { env: { LUNA_SMTP_URL: SMTP, LUNA_MAIL_FROM: "Luna <a@b.co>", RESEND_API_KEY: "re_x" }, transportFactory, fetchImpl, logger: quietLogger() });
    expect(result).toEqual({ delivered: true, provider: "smtp" });
    expect(transportFactory).toHaveBeenCalledWith(SMTP);
    expect(sendMailFn).toHaveBeenCalledWith({ from: "Luna <a@b.co>", to: "maria@home.com", subject: "Hello", text: "plain", html: "<p>html</p>" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Resend: posts to the REST API with a bearer key, no SDK", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const result = await sendMail(message, { env: { RESEND_API_KEY: "re_secret", LUNA_MAIL_FROM: "Luna <a@b.co>" }, fetchImpl, transportFactory: vi.fn(), logger: quietLogger() });
    expect(result).toEqual({ delivered: true, provider: "resend" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_secret");
    expect(JSON.parse(init.body)).toMatchObject({ from: "Luna <a@b.co>", to: ["maria@home.com"], subject: "Hello", html: "<p>html</p>", text: "plain" });
  });

  it("strips line breaks from the subject and recipient (header injection)", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    await sendMail({ ...message, subject: "Hi\r\nBcc: evil@x.com", to: "a@b.co\nBcc: evil@x.com" }, { env: { RESEND_API_KEY: "k", LUNA_MAIL_FROM: "a@b.co" }, fetchImpl, logger: quietLogger() });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.subject).not.toMatch(/[\r\n]/);
    expect(body.to[0]).not.toMatch(/[\r\n]/);
  });

  it("without a provider in development: logs subject and link, returns a devPreview", async () => {
    const logger = quietLogger();
    const result = await sendMail(message, { env: { NODE_ENV: "development" }, logger });
    expect(result.delivered).toBe(false);
    expect(result.devPreview).toMatchObject({ to: "maria@home.com", subject: "Hello", links: ["https://luna.test/verify-email?token=TOKEN123"] });
    expect(logger.info.mock.calls[0][0]).toContain("TOKEN123");
  });

  it("without a provider in production: no devPreview, no token in the result or the logs, mailSetupNeeded", async () => {
    const logger = quietLogger();
    const result = await sendMail(message, { env: { NODE_ENV: "production" }, logger });
    expect(result).toEqual({ delivered: false, provider: "none", mailSetupNeeded: true });
    expect(JSON.stringify(result)).not.toContain("TOKEN123");
    expect(allOutput(logger)).not.toContain("TOKEN123");
    expect(allOutput(logger)).not.toContain("maria@home.com");
  });

  it("never puts SMTP credentials in the result or the logs, even when the server error quotes them", async () => {
    const logger = quietLogger();
    const transportFactory = async () => ({ sendMail: async () => { throw Object.assign(new Error(`Invalid login for ${SMTP}: 535 s3cr3t-app-pw rejected`), { code: "EAUTH" }); } });
    const result = await sendMail(message, { env: { LUNA_SMTP_URL: SMTP, LUNA_MAIL_FROM: "Luna <a@b.co>" }, transportFactory, logger });
    expect(result.delivered).toBe(false);
    for (const text of [JSON.stringify(result), allOutput(logger)]) {
      expect(text).not.toContain("s3cr3t-app-pw");
      expect(text).not.toContain("luna.bot");
      expect(text).not.toContain("smtp.gmail.com");
    }
    expect(result.error).toContain("EAUTH");
  });

  it("never puts the Resend key in the result or the logs", async () => {
    const logger = quietLogger();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "bad key re_secret" }));
    const result = await sendMail(message, { env: { RESEND_API_KEY: "re_secret", LUNA_MAIL_FROM: "a@b.co" }, fetchImpl, logger });
    expect(result).toMatchObject({ delivered: false, provider: "resend" });
    expect(JSON.stringify(result) + allOutput(logger)).not.toContain("re_secret");
    const thrown = await sendMail(message, { env: { RESEND_API_KEY: "re_secret", LUNA_MAIL_FROM: "a@b.co" }, fetchImpl: async () => { throw new Error("connect failed for re_secret"); }, logger });
    expect(JSON.stringify(thrown) + allOutput(logger)).not.toContain("re_secret");
  });

  it("redacts every secret from any text", () => {
    const env = { LUNA_SMTP_URL: SMTP, RESEND_API_KEY: "re_secret" };
    expect(redactSecrets(`${SMTP} / s3cr3t-app-pw / luna.bot@gmail.com / re_secret`, env)).toBe("[redacted] / [redacted] / [redacted] / [redacted]");
  });

  it("does not load nodemailer unless the SMTP path is used", async () => {
    const result = await sendMail(message, { env: { RESEND_API_KEY: "k", LUNA_MAIL_FROM: "a@b.co" }, fetchImpl: async () => ({ ok: true }), logger: quietLogger() });
    expect(result.delivered).toBe(true); // would have thrown on a top-level import of a missing package
  });

  it("refuses to send without a recipient", async () => {
    expect((await sendMail({ ...message, to: "" }, { env: {}, logger: quietLogger() })).delivered).toBe(false);
  });
});

describe("public address for links", () => {
  const request = (headers) => new Request("http://internal:3000/api/x", { headers });
  it("prefers LUNA_PUBLIC_URL", () => {
    expect(publicBaseUrl(request({ host: "evil.test" }), { LUNA_PUBLIC_URL: "https://luna.example.com/" })).toBe("https://luna.example.com");
  });
  it("falls back to the request's own host", () => {
    expect(publicBaseUrl(request({ host: "luna.test", "x-forwarded-proto": "https" }), {})).toBe("https://luna.test");
    expect(publicBaseUrl(request({ host: "localhost:3000" }), { NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
  it("ignores an invalid LUNA_PUBLIC_URL and a malformed host", () => {
    expect(publicBaseUrl(request({ host: "luna.test" }), { LUNA_PUBLIC_URL: "javascript:alert(1)" })).toBe("http://luna.test");
    expect(publicBaseUrl(request({ "x-forwarded-host": "a.test/evil" }), {})).toBe("http://internal:3000");
  });
});

describe("the emails", () => {
  const sender = { displayName: "Prof. <b>Rivera</b>\nBcc: x", role: "teacher", email: "rivera@school.edu" };
  const url = "https://luna.test/platform?page=connections";

  it("have an HTML and a text body, the accent colour, no remote images and one link", () => {
    for (const mail of [verifyEmailMail({ to: "a@b.co", name: "Maria", url }), resetPasswordMail({ to: "a@b.co", name: "Maria", url }), linkRequestMail({ to: "a@b.co", sender, url }), linkAcceptedMail({ to: "a@b.co", accepter: sender, url }), invitationMail({ to: "a@b.co", sender, url })]) {
      expect(mail.text).toContain(url);
      expect(mail.html).toContain("#0071e3");
      expect(mail.html).not.toMatch(/<img|src=|url\(/i);
      expect(mail.html).toMatch(/<html lang="en">/);
      expect(mail.links).toEqual([url]);
      expect(mail.subject).not.toMatch(/[\r\n]/);
    }
  });

  it("escape what a person typed and keep it on one line", () => {
    const mail = linkRequestMail({ to: "a@b.co", sender, url });
    expect(mail.html).not.toContain("<b>Rivera</b>");
    expect(mail.html).toContain("&lt;b&gt;");
    expect(mail.subject).not.toMatch(/\n/);
    expect(escapeHtml(`"<&>'`)).toBe("&quot;&lt;&amp;&gt;&#39;");
  });

  it("request and invitation emails carry only the sender's name, role and email", () => {
    const mail = linkRequestMail({ to: "a@b.co", sender: { ...sender, displayName: "Prof. Rivera", phone: "+14155552671", password_hash: "x" }, url });
    expect(mail.text).toContain("Prof. Rivera (teacher, rivera@school.edu)");
    expect(mail.text + mail.html).not.toMatch(/\+14155552671|password/);
    const invite = invitationMail({ to: "a@b.co", sender: { displayName: "Prof. Rivera", role: "teacher", email: "rivera@school.edu" }, url: "https://luna.test/login?mode=signup" });
    expect(invite.subject).toBe("Prof. Rivera invited you to connect on Luna");
    expect(invite.text).toMatch(/no tracking/i);
    expect(invite.text).toMatch(/ignore/i);
  });
});
