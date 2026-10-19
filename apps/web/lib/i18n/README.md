# lib/i18n: English / Spanish, no dependencies

**How the language is chosen.** The `luna_lang` cookie (1 year, set by the "EN | ES" switch) wins; without it the browser's
`Accept-Language` is used (`es*` -> Spanish); otherwise English. `app/layout.js` reads it on the server (`server.js`), sets
`<html lang>` and mounts `LocaleProvider` with that locale, so server and browser render the same language. The legal pages
(`/terms`, `/privacy`, `/ai`) use `?lang=es|en` first, then the same cookie. It is stored in a cookie only (no migration), so it is per browser, not per account.

**The switch.** `LanguageSwitch` ("EN | ES") is in the top bar (desktop and phone), the landing header, the sign-up/login dialog,
the token screens and Account settings.

## Using it
- Client component: `const t = useT();` then `t("home.hiName", { name })`, `t.plural("auth.done.queued", n)`; `useLocale()` gives `{ locale, setLocale, formatDate }`.
- Pure helper (no hooks): take an optional last parameter `t = tEn` and let components pass theirs, e.g. `navFor(role, account, t)`, `dueLabel(date, t)`, `greeting(name, t)`. Without `t` the output is the exact English that shipped.
- `friendlyMessage` defaults to `tActive` (the client's current locale); only use that in event handlers, never in anything server-rendered.
- Dates and numbers: `formatDate`, `formatNumber`, `t.locale`, `LOCALE_TAG`; never hard-code `en-US`.

## Messages
`messages/en/<area>.js` and `messages/es/<area>.js` (areas: landing, auth, nav, shell, help, home, common, plans, practice, progress, courses, people, dialogs, misc).
`messages/en.js` / `es.js` just spread them. Keys are flat and dotted; `{name}` placeholders; plurals are `key.one` / `key.other` (`{count}`).
A key missing in Spanish falls back to English; one missing in both renders the key. Never put HTML in a message: split text around `<strong>` / `<a>` into several keys.

**Adding a language string:** add the key to `en/<area>.js` (the English text) and `es/<area>.js`; `tests/i18n` fails if the key sets or `{placeholders}` differ,
and `tests/i18n/keys-used.test.js` fails if the code uses a literal key that English does not have.

## AI-generated content
The coach request carries `language` (`en|es`) and its prompt has a `<language>` block. Agent runners with a "Language" question start on
"Spanish" when the UI is Spanish (`RunAgentPage.js`); quizzes/summaries otherwise follow the material ("Same as material"). Plan generation follows the material's language.

## Not translated (still English)
Server/API error text, AI-written text, stored data (folder names, plan notes), email templates, the admin feedback board, Template Studio (`components/views.js`), skill taxonomy names.
