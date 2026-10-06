# tools/promo-video

Renders the one-minute promo video shown on the landing page ("See Luna in 1 minute"), with no voice-over.
Everything is a pure function of time, so a re-render is repeatable.

- `index.html` + `timeline.js` + `style.css` — the whole film as `window.renderAt(t)`: nine scenes built from the real
  screenshots in `apps/web/public/landing/` (scene copy, transitions and timing live in `timeline.js`; open
  `node render.mjs --serve` and add `?t=12.5` to scrub). `timing.json` is read by both the picture and the music.
- `music.mjs` — synthesizes the original soundtrack (~108 BPM, pads + plucks + groove, risers on the scene changes,
  fade-out) into `out/luna-music.wav`. Royalty-free because it is generated here; swap in a licensed track by
  replacing that WAV before rendering.
- `render.mjs` — drives Chrome (puppeteer-core), screenshots every frame, encodes H.264 + AAC with `ffmpeg-static`.

```bash
cd tools/promo-video
npm install                      # once (node_modules is git-ignored)
node music.mjs                   # soundtrack -> out/luna-music.wav
node render.mjs --install        # render and copy luna-promo.mp4 + poster into apps/web/public/landing/
node render.mjs --frames 2,12,40 # only a few stills into out/preview/ (design checks)
```

Output: `apps/web/public/landing/luna-promo.mp4` (1920x1080, 30 fps, 58 s, about 9 MB) and `luna-promo-poster.jpg`.
Change the copy by editing `timeline.js`; if the app's screens change, retake them with
`apps/web/scripts/landing-capture` first.
