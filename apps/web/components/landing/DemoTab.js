"use client";
import { useState } from "react";
import { BrowserFrame, PhoneFrame, Shot, SHOTS } from "./shots.js";
import { Reveal } from "./motion.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

// Text lives in lib/i18n/messages (landing.demo.<id>.*); this only says which steps exist, how many points and which screens.
const STEPS = [
  { id: "upload", points: 3, shots: ["workspaces"] },
  { id: "notes", points: 3, shots: ["reader", "reader-notes"] },
  { id: "plan", points: 3, shots: ["plans", "calendar"] },
  { id: "track", points: 3, shots: ["performance", "coach-read", "results"] },
  { id: "generate", points: 4, shots: ["agents", "agent-run", "quiz", "agent-answers"] },
  { id: "build", points: 3, shots: ["builder-prompt", "builder-inputs", "studio"] },
  { id: "chat", points: 3, shots: ["chat"] },
  { id: "templates", points: 3, shots: ["templates", "template-preview"] },
  { id: "market", points: 4, shots: ["marketplace"] }
];


export function DemoTab() {
  const t = useT();
  const [stepIndex, setStepIndex] = useState(0);
  const [shotIndex, setShotIndex] = useState(0);
  const step = STEPS[stepIndex];
  const shot = step.shots[Math.min(shotIndex, step.shots.length - 1)];
  const k = (field) => t(`landing.demo.${step.id}.${field}`);
  const pickStep = (i) => { setStepIndex(i); setShotIndex(0); };

  return (
    <>
      <section className="lp-demo-hero">
        <div className="lp-mesh" aria-hidden><i /><i /><i /></div>
        <div className="lp-wrap">
          <span className="lp-eyebrow">{t("landing.demo.eyebrow")}</span>
          <h1 className="lp-h1 lp-h1-sm">{t("landing.demo.h1a")}<span className="lp-grad">{t("landing.demo.h1b")}</span></h1>
          <p className="lp-lead">{t("landing.demo.leadA")}<a href="/app">{t("landing.demo.leadLink")}</a>{t("landing.demo.leadB")}</p>
        </div>
      </section>

      <section className="lp-section lp-demo">
        <div className="lp-wrap lp-tour">
          <div className="lp-steps" role="tablist" aria-label={t("landing.demo.stepsAria")} aria-orientation="vertical">
            {STEPS.map((s, i) => (
              <button key={s.id} type="button" role="tab" id={`tour-tab-${s.id}`} aria-selected={i === stepIndex} aria-controls="tour-panel" className={`lp-stepbtn${i === stepIndex ? " on" : ""}`} onClick={() => pickStep(i)}>
                <span className="lp-stepbtn-n">{i + 1}</span>
                <span className="lp-stepbtn-t">{t(`landing.demo.${s.id}.label`)}</span>
              </button>
            ))}
          </div>
          <div className="lp-tour-panel" id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${step.id}`}>
            <div className="lp-tour-stage">
              <BrowserFrame>
                <Shot key={shot} name={shot} className="lp-swap" sizes="(max-width: 900px) 94vw, 760px" />
              </BrowserFrame>
              {step.shots.length > 1 ? (
                <div className="lp-thumbs" role="group" aria-label={t("landing.demo.screensAria")}>
                  {step.shots.map((s, i) => (
                    <button key={s} type="button" className={i === shotIndex ? "on" : ""} onClick={() => setShotIndex(i)} aria-pressed={i === shotIndex}>{k(`s.${s}`)}</button>
                  ))}
                </div>
              ) : null}
              <p className="lp-shot-alt">{SHOTS[shot]?.alt}</p>
            </div>
            <div className="lp-tour-copy">
              <span className="lp-eyebrow">{t("landing.demo.stepOf", { n: stepIndex + 1, total: STEPS.length })}</span>
              <h2 className="lp-h3">{k("title")}</h2>
              <p>{k("text")}</p>
              <ul className="lp-list">{Array.from({ length: step.points }, (_, n) => <li key={n}>{k(`p${n + 1}`)}</li>)}</ul>
              <div className="lp-tour-nav">
                <button type="button" className="lp-btn lp-btn-ghost" disabled={stepIndex === 0} onClick={() => pickStep(stepIndex - 1)}>{t("landing.demo.back")}</button>
                <button type="button" className="lp-btn lp-btn-primary" disabled={stepIndex === STEPS.length - 1} onClick={() => pickStep(stepIndex + 1)}>{t("landing.demo.next")}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-tint">
        <div className="lp-wrap lp-phones">
          <Reveal className="lp-phones-copy">
            <span className="lp-eyebrow">{t("landing.demo.mobileEyebrow")}</span>
            <h2 className="lp-h2">{t("landing.demo.mobileTitle")}</h2>
            <p className="lp-sub">{t("landing.demo.mobileSub")}</p>
          </Reveal>
          <Reveal className="lp-phones-row" delay={120}>
            {["m-plans", "m-performance", "m-agents"].map((name) => (
              <PhoneFrame key={name}><Shot name={name} /></PhoneFrame>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-final lp-final-light">
            <h2>{t("landing.demo.finalTitle")}</h2>
            <p>{t("landing.demo.finalText")}</p>
            <div className="lp-cta">
              <a className="lp-btn lp-btn-primary lp-btn-lg" href="/app">{t("landing.demo.finalCta")} <span aria-hidden>↗</span></a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
