"use client";
import { useState } from "react";
import { LunaLogo } from "../brand/LunaLogo.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * Pricing and Training are not live yet. They stay reachable but are visibly shaded, badged
 * "Upcoming", and say honestly what is planned. "Notify me" is local UI only: nothing is sent, stored
 * or collected by the app.
 */
function NotifyMe({ topic }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  return (
    <form className="lp-notify" onSubmit={(e) => { e.preventDefault(); if (email.trim()) setDone(true); }}>
      {done ? (
        <p role="status" className="lp-notify-done">{t("landing.soon.notifyDone", { topic: t(`landing.soon.topic.${topic}`) })}</p>
      ) : (
        <>
          <label className="lp-sr" htmlFor={`notify-${topic}`}>{t("landing.soon.email")}</label>
          <input id={`notify-${topic}`} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="lp-btn lp-btn-primary">{t("landing.soon.notify")}</button>
        </>
      )}
    </form>
  );
}

function SoonShell({ eyebrow, title, intro, expect, topic, ghost, onSignUp }) {
  const t = useT();
  return (
    <section className="lp-soon">
      <div className="lp-mesh lp-mesh-soft" aria-hidden><i /><i /><i /></div>
      <div className="lp-wrap lp-soon-wrap">
        <div className="lp-soon-ghost" aria-hidden>{ghost}</div>
        <div className="lp-soon-card" role="region" aria-label={t("landing.soon.aria", { title })}>
          <LunaLogo mark size={34} />
          <span className="lp-badge lp-badge-soon">{t("landing.soon.badge")}</span>
          <h1 className="lp-h2">{title}</h1>
          <p className="lp-sub">{intro}</p>
          <h2 className="lp-h5">{t("landing.soon.expect")}</h2>
          <ul className="lp-list">{expect.map((item) => <li key={item}>{item}</li>)}</ul>
          <NotifyMe topic={topic} />
          <p className="lp-fine">{t("landing.soon.fine", { eyebrow })}<button type="button" className="lp-link" onClick={onSignUp}>{t("landing.soon.createAccount")}</button>{t("landing.soon.fineEnd")}</p>
        </div>
      </div>
    </section>
  );
}

export function PricingTab({ onSignUp }) {
  const t = useT();
  return (
    <SoonShell
      onSignUp={onSignUp}
      topic="pricing"
      title={t("landing.pricing.title")}
      eyebrow={t("landing.pricing.eyebrow")}
      intro={t("landing.pricing.intro")}
      expect={[1, 2, 3, 4].map((n) => t(`landing.pricing.e${n}`))}
      ghost={(
        <div className="lp-ghost-grid">
          {["free", "student", "parent", "teacher"].map((name) => (
            <div className="lp-ghost-card" key={name}><strong>{t(`landing.pricing.tier.${name}`)}</strong><i /><i /><i /><b /></div>
          ))}
        </div>
      )}
    />
  );
}

export function TrainingTab({ onSignUp }) {
  const t = useT();
  const lessons = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => t(`landing.training.l${n}`));
  return (
    <SoonShell
      onSignUp={onSignUp}
      topic="training"
      title={t("landing.training.title")}
      eyebrow={t("landing.training.eyebrow")}
      intro={t("landing.training.intro")}
      expect={[1, 2, 3, 4].map((n) => t(`landing.training.e${n}`))}
      ghost={(
        <div className="lp-ghost-grid lp-ghost-grid-3">
          {lessons.map((name) => (
            <div className="lp-ghost-card" key={name}><span className="lp-ghost-play" /><strong>{name}</strong><i /><i /></div>
          ))}
        </div>
      )}
    />
  );
}
