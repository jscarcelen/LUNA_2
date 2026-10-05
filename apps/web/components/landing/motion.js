"use client";
import { useEffect, useRef } from "react";

/**
 * Small, restrained motion helpers. Everything is a no-op under prefers-reduced-motion, and without
 * JavaScript the content is simply visible (the hidden state only exists once `.lp-js` is on the root).
 */

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fades + lifts its children in once, when they scroll into view. */
export function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") { node.classList.add("in"); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { node.classList.add("in"); io.disconnect(); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`lp-reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>{children}</Tag>;
}

/** Writes the scroll position into `--lp-y` on the element, for the hero's gentle parallax. */
export function useParallax(ref) {
  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = Math.min(window.scrollY, 900);
      node.style.setProperty("--lp-y", String(y));
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) window.cancelAnimationFrame(raf); };
  }, [ref]);
}
