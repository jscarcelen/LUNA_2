"use client";
import { useState } from "react";
import { LunaLogo } from "../brand/LunaLogo.js";

/**
 * Pricing and Training are not live yet. They stay reachable but are visibly shaded, badged
 * "Upcoming", and say honestly what is planned. "Notify me" is local UI only: nothing is sent, stored
 * or collected by the app.
 */
function NotifyMe({ topic }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  return (
    <form className="lp-notify" onSubmit={(e) => { e.preventDefault(); if (email.trim()) setDone(true); }}>
      {done ? (
        <p role="status" className="lp-notify-done">Thanks. This button does not save anything yet: nothing was sent or stored. Create a free account to hear about {topic} in the app.</p>
      ) : (
        <>
          <label className="lp-sr" htmlFor={`notify-${topic}`}>Email address</label>
          <input id={`notify-${topic}`} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="lp-btn lp-btn-primary">Notify me</button>
        </>
      )}
    </form>
  );
}

function SoonShell({ eyebrow, title, intro, expect, topic, ghost, onSignUp }) {
  return (
    <section className="lp-soon">
      <div className="lp-mesh lp-mesh-soft" aria-hidden><i /><i /><i /></div>
      <div className="lp-wrap lp-soon-wrap">
        <div className="lp-soon-ghost" aria-hidden>{ghost}</div>
        <div className="lp-soon-card" role="region" aria-label={`${title} is upcoming`}>
          <LunaLogo mark size={34} />
          <span className="lp-badge lp-badge-soon">Upcoming</span>
          <h1 className="lp-h2">{title}</h1>
          <p className="lp-sub">{intro}</p>
          <h2 className="lp-h5">What to expect</h2>
          <ul className="lp-list">{expect.map((item) => <li key={item}>{item}</li>)}</ul>
          <NotifyMe topic={topic} />
          <p className="lp-fine">{eyebrow} Luna is in beta, so details may change. <button type="button" className="lp-link" onClick={onSignUp}>Create a free account</button> to try the product today.</p>
        </div>
      </div>
    </section>
  );
}

export function PricingTab({ onSignUp }) {
  return (
    <SoonShell
      onSignUp={onSignUp}
      topic="pricing"
      title="Pricing"
      eyebrow="Pricing is not published yet."
      intro="Luna is free to try while it is in beta. Plans and prices will be announced before anything changes."
      expect={[
        "A free way to start, so you can upload material and see your plan",
        "Plans for students, parents and teachers",
        "Lunas: one in-app currency for running agents and buying from the marketplace",
        "Creators earning lunas when others use their agents and templates"
      ]}
      ghost={(
        <div className="lp-ghost-grid">
          {["Free", "Student", "Parent", "Teacher"].map((name) => (
            <div className="lp-ghost-card" key={name}><strong>{name}</strong><i /><i /><i /><b /></div>
          ))}
        </div>
      )}
    />
  );
}

export function TrainingTab({ onSignUp }) {
  const lessons = ["Getting started with Luna", "Uploading and organising material", "Study plans and the master notes", "Running an agent", "Building your own agent", "Designing a template", "Reading your performance", "Using the marketplace"];
  return (
    <SoonShell
      onSignUp={onSignUp}
      topic="training"
      title="Training"
      eyebrow="The training library is being prepared."
      intro="Short, practical guides to get the most out of each part of Luna, for students, parents and teachers."
      expect={[
        "Bite-size lessons, a few minutes each",
        "Walkthroughs of Luna Study, Luna Create and the Marketplace",
        "Tips for teachers on assigning work and reading class performance",
        "Guidance for parents on supporting a child's plan"
      ]}
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
