/**
 * The emails Luna sends, as plain data: { to, subject, text, html, links }.
 * Plain, accessible HTML (real text, one clear button, no remote images, no tracking pixels or tracked
 * links) with the text version beside it. Anything a person typed (a display name) is escaped and
 * stripped of line breaks.
 */

const ACCENT = "#0071e3";
const ROLE_WORD = { student: "student", teacher: "teacher", parent: "parent" };

export const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const oneLine = (value) => String(value ?? "").replace(/[\r\n\u2028\u2029\t]+/g, " ").replace(/\s+/g, " ").trim();
const nameOf = (person) => oneLine(person?.displayName || person?.display_name || person?.email || "Someone").slice(0, 80);

function layout({ preheader, heading, paragraphs, button, footer }) {
  const body = paragraphs.map((text) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#1d1d1f">${text}</p>`).join("");
  const action = button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 24px;border-radius:980px">${escapeHtml(button.label)}</a></p><p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#6e6e73">Or copy this address into your browser:<br><a href="${escapeHtml(button.url)}" style="color:${ACCENT};word-break:break-all">${escapeHtml(button.url)}</a></p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head><body style="margin:0;padding:0;background:#f5f5f7"><span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"><tr><td style="padding:32px 28px"><p style="margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${ACCENT}">Luna</p><h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#1d1d1f">${escapeHtml(heading)}</h1>${body}${action}<p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#6e6e73">${footer}</p></td></tr></table></td></tr></table></body></html>`;
}

function plain({ heading, paragraphs, button, footer }) {
  return [heading, "", ...paragraphs.flatMap((text) => [text, ""]), ...(button ? [`${button.label}: ${button.url}`, ""] : []), footer].join("\n");
}

function build({ to, subject, heading, paragraphs, htmlParagraphs, button, footer, links }) {
  return {
    to,
    subject: oneLine(subject),
    text: plain({ heading, paragraphs, button, footer }),
    html: layout({ preheader: paragraphs[0], heading, paragraphs: htmlParagraphs || paragraphs.map(escapeHtml), button, footer: escapeHtml(footer) }),
    links: links || (button ? [button.url] : [])
  };
}

const NOT_YOU = "If you did not expect this email, you can ignore it. Nothing happens unless you use the link.";

export function verifyEmailMail({ to, name, url }) {
  const hello = oneLine(name) ? `Hi ${oneLine(name)},` : "Hi,";
  return build({
    to,
    subject: "Confirm your email for Luna",
    heading: "Confirm your email",
    paragraphs: [`${hello} confirm that this is your email address to finish setting up your Luna account.`, "The link works once and expires in 48 hours."],
    button: { label: "Confirm my email", url },
    footer: `You can use Luna while you wait, but connecting with teachers, parents or students needs a confirmed email. ${NOT_YOU}`
  });
}

export function resetPasswordMail({ to, name, url }) {
  const hello = oneLine(name) ? `Hi ${oneLine(name)},` : "Hi,";
  return build({
    to,
    subject: "Reset your Luna password",
    heading: "Reset your password",
    paragraphs: [`${hello} someone asked to reset the password of the Luna account for this email.`, "Choose a new password with the button below. The link works once and expires in 1 hour."],
    button: { label: "Choose a new password", url },
    footer: `If you did not ask for this, ignore this email: your password stays as it is. ${NOT_YOU}`
  });
}

const whoLine = (sender) => `${nameOf(sender)} (${ROLE_WORD[sender?.role] || "Luna user"}, ${oneLine(sender?.email)})`;

/** A request arrived for someone who has a (verified) account. Only the sender's name, role and email are included. */
export function linkRequestMail({ to, sender, url }) {
  const who = whoLine(sender);
  return build({
    to,
    subject: `${nameOf(sender)} wants to connect with you on Luna`,
    heading: "You have a connection request",
    paragraphs: [`${who} asked to connect with you on Luna.`, "Nothing is shared until you accept. You can accept or decline in Luna."],
    button: { label: "Open connection requests", url },
    footer: "Log in to answer. If you do not know this person, decline the request."
  });
}

/** Their request to you was accepted. */
export function linkAcceptedMail({ to, accepter, url }) {
  const who = whoLine(accepter);
  return build({
    to,
    subject: `${nameOf(accepter)} accepted your connection on Luna`,
    heading: "Your connection was accepted",
    paragraphs: [`${who} accepted your request. You are now connected on Luna.`],
    button: { label: "Open Luna", url },
    footer: "You can end a connection at any time from the Connections page."
  });
}

/**
 * Someone shared something with you (a live share with permissions, or a copy of an agent / template /
 * component). Only the sharer's name, role and email and the item's name are included, nothing of its content.
 * @param {{ to: string, sharer: object, itemName: string, permission?: "view" | "edit", copyOf?: string, url: string }} args
 *   `permission` for a live share; `copyOf` ("agent", "template", "component") for a copy the recipient owns.
 */
export function shareMail({ to, sharer, itemName, permission, copyOf, url }) {
  const who = whoLine(sharer);
  const item = oneLine(itemName).slice(0, 120) || "an item";
  const first = copyOf
    ? `${who} shared the ${copyOf} “${item}” with you. You get your own copy to use and change; it does not change theirs.`
    : `${who} shared “${item}” with you${permission === "edit" ? " and you can edit it" : " (view only)"}.`;
  const second = copyOf
    ? "You will find it in your own library the next time you open Luna."
    : permission === "edit"
      ? "Because you can edit it, what you change is changed in the original, and everyone who has it sees your edits. You find it in your workspace under Shared with me."
      : "You find it in your workspace under Shared with me. You can read it, highlight it and take your own notes.";
  return build({
    to,
    subject: `${nameOf(sharer)} shared “${item}” with you on Luna`,
    heading: copyOf ? `A ${copyOf} was shared with you` : "Something was shared with you",
    paragraphs: [first, second],
    button: { label: "Open Luna", url },
    footer: "You only get emails like this from people you are connected to, at most one an hour per person. You can end a connection at any time from the Connections page."
  });
}

/** A request for an address with no account yet: minimal, honest, sent at most once a week per sender and address. */
export function invitationMail({ to, sender, url }) {
  const who = whoLine(sender);
  return build({
    to,
    subject: `${nameOf(sender)} invited you to connect on Luna`,
    heading: "You were invited to Luna",
    paragraphs: [`${who} entered your email address to connect with you on Luna, a study platform for teachers, parents and students.`, "If you create an account with this email address, the request will be waiting for you. Nothing is shared unless you accept."],
    button: { label: "Create an account", url },
    footer: "You are receiving this once because someone typed your address. If you do not know them, ignore this message: no account is created and we do not contact you again about this request. This email has no tracking."
  });
}
