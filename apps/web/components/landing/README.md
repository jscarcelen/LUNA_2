# components/landing

The public page, composed by `components/LandingPage.js` (tabs Home / Demo / Pricing / Training, tab kept in
the URL hash, real `AuthModal` for Log in / Sign up).

- `HomeTab.js`, `DemoTab.js`, `SoonTabs.js` — the tabs. Pricing and Training are deliberately shaded and
  badged "Upcoming" (nothing is submitted by "Notify me").
- `LandingNav.js` — bar with the tabs (and a "Soon" pill); on phones only logo, Try demo and Log in stay on the bar.
- `Slider.js` — scroll-snap carousel (touch, arrows, dots, keys). `motion.js` — scroll reveal + hero parallax,
  both off under `prefers-reduced-motion`.
- `shots.js` — the screenshot registry (`Shot`, `BrowserFrame`, `PhoneFrame`). Every image is a real capture of
  the app from `public/landing/` (see `scripts/landing-capture`); never draw fake product UI here.
- `landing.css` — all styles, prefixed `lp-`. Light only: no blur, no dark mode.
- Logo: `components/brand/LunaLogo.js`.

## Promo video and tour (2026-10-06)
- `PromoVideo.js` — "See Luna in 1 minute" under the hero: a native `<video preload="none">` with a poster and a
  "Play" pill; `public/landing/luna-promo.mp4` is rendered by `tools/promo-video` (see its README).
- The tour (`DemoTab.js`) now has nine steps (Upload, Master notes, Study plan, Performance, Agents, Build, Chatbot,
  Templates, Marketplace). New real captures: `builder-prompt`, `builder-inputs`, `agent-answers`, `quiz-answered`,
  `reader-notes` (taken with `scripts/landing-capture/capture.mjs --only=<name>`) and `coach-read` (a crop of the
  Home capture; retake with `--only=coach-read` once the OpenAI account has credits). Shots flagged `natural` in
  `shots.js` are not 16:10 and are shown whole instead of cropped.
- Honesty rules: the native mobile app is labelled "coming soon"; Lunas/marketplace payments, plans and top-ups are
  labelled "coming soon" while installing works today.
