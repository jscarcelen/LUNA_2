"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserFrame, Shot } from "./shots.js";

/**
 * A horizontal slider of real product screens: CSS scroll-snap (touch and trackpad swipe work
 * natively), arrow buttons, dots, and the arrow keys when the track has focus.
 */
export function ScreenSlider({ slides }) {
  const track = useRef(null);
  const [active, setActive] = useState(0);

  const goTo = useCallback((index) => {
    const el = track.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    const slide = el.children[clamped];
    if (slide) el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.clientWidth) / 2, behavior: "smooth" });
  }, [slides.length]);

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const centre = el.scrollLeft + el.clientWidth / 2;
        let best = 0; let bestDist = Infinity;
        Array.from(el.children).forEach((child, i) => {
          const d = Math.abs(child.offsetLeft + child.clientWidth / 2 - centre);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        setActive(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (raf) window.cancelAnimationFrame(raf); };
  }, []);

  const onKey = (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(active + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); goTo(active - 1); }
  };

  return (
    <div className="lp-slider" role="region" aria-roledescription="carousel" aria-label="Screens from the Luna app">
      <div className="lp-slider-track" ref={track} tabIndex={0} onKeyDown={onKey} aria-live="polite">
        {slides.map((slide, i) => (
          <figure className={`lp-slide${i === active ? " is-active" : ""}`} key={slide.shot} aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${slide.title}`}>
            <BrowserFrame><Shot name={slide.shot} sizes="(max-width: 900px) 86vw, 760px" /></BrowserFrame>
            <figcaption><strong>{slide.title}</strong><span>{slide.text}</span></figcaption>
          </figure>
        ))}
      </div>
      <div className="lp-slider-controls">
        <button type="button" className="lp-arrow" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous screen">‹</button>
        <div className="lp-dots" role="tablist" aria-label="Choose a screen">
          {slides.map((slide, i) => (
            <button key={slide.shot} type="button" role="tab" aria-selected={i === active} aria-label={slide.title} className={i === active ? "on" : ""} onClick={() => goTo(i)} />
          ))}
        </div>
        <button type="button" className="lp-arrow" onClick={() => goTo(active + 1)} disabled={active === slides.length - 1} aria-label="Next screen">›</button>
      </div>
    </div>
  );
}
