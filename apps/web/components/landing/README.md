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
