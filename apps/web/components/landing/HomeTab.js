"use client";
import { useRef } from "react";
import { LunaLogo } from "../brand/LunaLogo.js";
import { BrowserFrame, PhoneFrame, Shot } from "./shots.js";
import { ScreenSlider } from "./Slider.js";
import { Reveal, useParallax } from "./motion.js";
import { PromoVideo } from "./PromoVideo.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const SLIDE_SHOTS = ["home", "workspaces", "reader", "reader-notes", "plans", "calendar", "quiz", "quiz-answered", "performance", "coach-read", "agents", "builder-prompt", "template-preview", "marketplace"];

const FLOW = [
  { n: 1, shot: "workspaces", pos: "left top" },
  { n: 2, shot: "calendar", pos: "left 30%" },
  { n: 3, shot: "results", pos: "right top" },
  { n: 4, shot: "builder-prompt", pos: "left top" }
];

const PROFILES = ["student", "parent", "teacher"];

function Icon({ name }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    student: <><path d="M3 9l9-4 9 4-9 4-9-4z" /><path d="M7 11v4.5c0 1 2.2 2.5 5 2.5s5-1.500 5-2.500V11" /></>,
    parent: <><circle cx="9" cy="8" r="3" /><path d="M3.500 19c0-3 2.500-5 5.500-5s5.500 2 5.500 5" /><circle cx="17.500" cy="10" r="2" /><path d="M16 15c2.500 0 4.500 1.500 4.500 4" /></>,
    teacher: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" {...p} aria-hidden>{paths[name]}</svg>;
}

export function HomeTab({ onSignUp }) {
  const t = useT();
  const slides = SLIDE_SHOTS.map((shot) => ({ shot, title: t(`landing.slide.${shot}.title`), text: t(`landing.slide.${shot}.text`) }));
  const hero = useRef(null);
  useParallax(hero);
  return (
    <>
      {/* ------------------------------------------------------------------ hero */}
      <section className="lp-hero" ref={hero}>
        <div className="lp-mesh" aria-hidden><i /><i /><i /></div>
        <div className="lp-wrap lp-hero-copy">
          <span className="lp-badge"><LunaLogo mark size={14} /> {t("landing.home.badge")}</span>
          <h1 className="lp-h1">{t("landing.home.h1a")}<br />{t("landing.home.h1b")}<span className="lp-grad">{t("landing.home.h1c")}</span></h1>
          <p className="lp-lead">{t("landing.home.lead")}</p>
          <div className="lp-cta">
            <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={onSignUp}>{t("landing.home.cta")}</button>
            <a className="lp-btn lp-btn-glass lp-btn-lg" href="/app">{t("landing.home.demo")} <span aria-hidden>↗</span></a>
          </div>
        </div>
        <div className="lp-hero-stage">
          <PhoneFrame className="lp-hero-phone lp-hero-phone-l"><Shot name="m-plans" eager /></PhoneFrame>
          <div className="lp-hero-main">
            <BrowserFrame><Shot name="home" eager sizes="(max-width: 900px) 94vw, 1000px" /></BrowserFrame>
          </div>
          <PhoneFrame className="lp-hero-phone lp-hero-phone-r"><Shot name="m-performance" eager /></PhoneFrame>
        </div>
      </section>

      {/* ------------------------------------------------------------------ promo video */}
      <PromoVideo />

      {/* ------------------------------------------------------------------ slider */}
      <section className="lp-section lp-tint">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">{t("landing.home.inside")}</span>
            <h2 className="lp-h2">{t("landing.home.insideTitle")}</h2>
            <p className="lp-sub">{t("landing.home.insideSub")}</p>
          </Reveal>
        </div>
        <Reveal><ScreenSlider slides={slides} /></Reveal>
      </section>

      {/* ------------------------------------------------------------------ pillars */}
      <section className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">{t("landing.home.partsEyebrow")}</span>
            <h2 className="lp-h2">{t("landing.home.partsTitle")}</h2>
            <p className="lp-sub">{t("landing.home.partsSub")}</p>
          </Reveal>

          <Reveal className="lp-pillar lp-pillar-blue">
            <div className="lp-pillar-text">
              <span className="lp-tag">{t("landing.pillar.study.tag")}</span>
              <h3 className="lp-h3">{t("landing.pillar.study.title")}</h3>
              <ul className="lp-list">
                <li>{t("landing.pillar.study.l1")}</li>
                <li>{t("landing.pillar.study.l2")}</li>
                <li>{t("landing.pillar.study.l3")}</li>
                <li>{t("landing.pillar.study.l4")}</li>
              </ul>
            </div>
            <div className="lp-pillar-art">
              <BrowserFrame><Shot name="plans" sizes="(max-width: 900px) 90vw, 640px" /></BrowserFrame>
              <BrowserFrame className="lp-float-b"><Shot name="reader" sizes="(max-width: 900px) 60vw, 380px" /></BrowserFrame>
            </div>
          </Reveal>

          <Reveal className="lp-pillar lp-pillar-teal lp-flip">
            <div className="lp-pillar-text">
              <span className="lp-tag">{t("landing.pillar.create.tag")}</span>
              <h3 className="lp-h3">{t("landing.pillar.create.title")}</h3>
              <ul className="lp-list">
                <li>{t("landing.pillar.create.l1")}</li>
                <li>{t("landing.pillar.create.l2")}</li>
                <li>{t("landing.pillar.create.l3")}</li>
                <li>{t("landing.pillar.create.l4")}</li>
              </ul>
            </div>
            <div className="lp-pillar-art">
              <BrowserFrame><Shot name="studio" sizes="(max-width: 900px) 90vw, 640px" /></BrowserFrame>
              <BrowserFrame className="lp-float-b"><Shot name="template-preview" sizes="(max-width: 900px) 60vw, 380px" /></BrowserFrame>
            </div>
          </Reveal>

          <Reveal className="lp-pillar lp-pillar-green">
            <div className="lp-pillar-text">
              <span className="lp-tag">{t("landing.pillar.market.tag")}</span>
              <h3 className="lp-h3">{t("landing.pillar.market.title")}</h3>
              <ul className="lp-list">
                <li>{t("landing.pillar.market.l1")}</li>
                <li>{t("landing.pillar.market.l2")}</li>
                <li>{t("landing.pillar.market.l3")}</li>
              </ul>
            </div>
            <div className="lp-pillar-art">
              <BrowserFrame><Shot name="marketplace" sizes="(max-width: 900px) 90vw, 640px" /></BrowserFrame>
              <BrowserFrame className="lp-float-b"><Shot name="agents" sizes="(max-width: 900px) 60vw, 380px" /></BrowserFrame>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ how it works */}
      <section className="lp-section lp-tint">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">{t("landing.home.howEyebrow")}</span>
            <h2 className="lp-h2">{t("landing.home.howTitle")}</h2>
          </Reveal>
          <ol className="lp-flow">
            {FLOW.map((step, i) => (
              <Reveal as="li" className="lp-step" key={step.n} delay={i * 90}>
                <div className="lp-step-img"><Shot name={step.shot} fit={step.pos} sizes="(max-width: 900px) 90vw, 300px" /></div>
                <span className="lp-step-n">{step.n}</span>
                <h3 className="lp-h4">{t(`landing.flow.${step.n}.title`)}</h3>
                <p>{t(`landing.flow.${step.n}.text`)}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ phone */}
      <section className="lp-section">
        <div className="lp-wrap lp-phones">
          <Reveal className="lp-phones-copy">
            <span className="lp-eyebrow">{t("landing.home.phoneEyebrow")}</span>
            <h2 className="lp-h2">{t("landing.home.phoneTitle")}</h2>
            <p className="lp-sub">{t("landing.home.phoneSub")}</p>
          </Reveal>
          <Reveal className="lp-phones-row" delay={120}>
            {["m-home", "m-workspaces", "m-agents"].map((name) => (
              <PhoneFrame key={name}><Shot name={name} /></PhoneFrame>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ profiles */}
      <section className="lp-section lp-tint">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">{t("landing.home.rolesEyebrow")}</span>
            <h2 className="lp-h2">{t("landing.home.rolesTitle")}</h2>
            <p className="lp-sub">{t("landing.home.rolesSub")}</p>
          </Reveal>
          <div className="lp-profiles">
            {PROFILES.map((key, i) => (
              <Reveal className="lp-profile" key={key} delay={i * 90}>
                <span className="lp-profile-icon"><Icon name={key} /></span>
                <h3 className="lp-h4">{t(`landing.profile.${key}.title`)}</h3>
                <p>{t(`landing.profile.${key}.text`)}</p>
                <ul>{[1, 2, 3].map((n) => <li key={n}>{t(`landing.profile.${key}.p${n}`)}</li>)}</ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ final cta */}
      <section className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-final">
            <div className="lp-mesh lp-mesh-dark" aria-hidden><i /><i /><i /></div>
            <LunaLogo variant="white" size={40} />
            <h2>{t("landing.home.finalTitle")}</h2>
            <p>{t("landing.home.finalText")}</p>
            <div className="lp-cta">
              <button type="button" className="lp-btn lp-btn-white lp-btn-lg" onClick={onSignUp}>{t("landing.home.finalCta")}</button>
              <a className="lp-btn lp-btn-outline-white lp-btn-lg" href="/app">{t("landing.home.demo")} <span aria-hidden>↗</span></a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
