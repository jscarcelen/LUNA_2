"use client";
import { useRef, useState } from "react";
import { Reveal } from "./motion.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * "See Luna in 1 minute": the promo video (tools/promo-video renders it). The file is only fetched when the
 * visitor presses play (preload none, a poster in the meantime), so the page stays light.
 */
export function PromoVideo() {
  const t = useT();
  const video = useRef(null);
  const [started, setStarted] = useState(false);
  function play() {
    const element = video.current;
    if (!element) return;
    setStarted(true);
    element.controls = true;
    element.play().catch(() => { /* the browser asked for another tap: the native controls are on */ });
  }
  return (
    <section className="lp-section lp-video-section" aria-labelledby="lp-video-title">
      <div className="lp-wrap">
        <Reveal className="lp-head">
          <span className="lp-eyebrow">{t("landing.promo.watch")}</span>
          <h2 className="lp-h2" id="lp-video-title">{t("landing.promo.title")}</h2>
          <p className="lp-sub">{t("landing.promo.sub")}</p>
        </Reveal>
        <Reveal className="lp-video" delay={80}>
          <video
            ref={video}
            className="lp-video-el"
            src="/landing/luna-promo.mp4"
            poster="/landing/luna-promo-poster.jpg"
            preload="none"
            playsInline
            aria-label={t("landing.promo.videoAria")}
            onPlay={() => setStarted(true)}
            onEnded={() => setStarted(false)}
          />
          {!started ? (
            <button type="button" className="lp-video-play" onClick={play} aria-label={t("landing.promo.playAria")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
              <span>{t("landing.promo.play")}</span>
            </button>
          ) : null}
        </Reveal>
        <p className="lp-caption lp-video-caption">{t("landing.promo.caption")}</p>
      </div>
    </section>
  );
}
