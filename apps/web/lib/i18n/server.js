import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, detectLocale } from "./index.js";

/** The request's locale: `luna_lang` cookie, then Accept-Language, then English. Server components and route handlers. */
export async function getServerLocale() {
  const [jar, heads] = await Promise.all([cookies(), headers()]);
  return detectLocale({ cookie: jar.get(LOCALE_COOKIE)?.value, acceptLanguage: heads.get("accept-language") });
}

/** Same, from a plain Request (route handlers that only have the Request). */
export function localeFromRequest(request) {
  const raw = request?.headers?.get?.("cookie") || "";
  const match = raw.split(/;\s*/).find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return detectLocale({ cookie: match ? decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1)) : "", acceptLanguage: request?.headers?.get?.("accept-language") });
}
