# apps/web/scripts

Maintenance scripts for the public page and the brand. None of them run in production.

- `brand/build-brand.mjs` — writes the whole logo set from `components/brand/lunaBrand.js`:
  `public/brand/*` (SVG + PNG), the PWA icons in `public/`, `app/icon.svg`, `app/favicon.ico`.
  Run from the repo root: `node apps/web/scripts/brand/build-brand.mjs`.
- `landing-capture/` — captures real screenshots (and an optional walkthrough video) of the running app
  into `public/landing/`. `npm install` once inside the folder, start the app, then
  `LUNA_URL=http://localhost:3000 npm run capture` (`-- --only=home,plans`, `-- --no-video`).
  Read-only against the app; see the header of `capture.mjs`.
