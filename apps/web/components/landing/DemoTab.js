"use client";
import { useState } from "react";
import { BrowserFrame, PhoneFrame, Shot, SHOTS } from "./shots.js";
import { Reveal } from "./motion.js";

const STEPS = [
  {
    id: "upload", label: "Upload", title: "Upload all your documents",
    text: "PDFs, Word files and notes go into subjects, topics and folders. Luna keeps the running text, headings, formulas and figures, so nothing about your material is lost on the way in.",
    points: ["Subject, topic and folder structure", "Material and generated resources side by side", "Search, filter and download in other formats"],
    shots: [{ shot: "workspaces", label: "Workspaces" }]
  },
  {
    id: "notes", label: "Master notes", title: "Luna consolidates them into master notes",
    text: "Open any document in the reader: one clean, readable version with the maths intact. Highlight what matters and keep your own notes next to it.",
    points: ["Formulas rendered properly", "Highlights and notes, autosaved", "Opens from workspaces and from plan steps"],
    shots: [{ shot: "reader", label: "Reader" }]
  },
  {
    id: "plan", label: "Study plan", title: "…creates the study plan",
    text: "A plan ties your material to goals, topics and exam dates, and schedules the reading and the activities that get you there. Doing an activity on Luna ticks the step off by itself.",
    points: ["Deadlines and what has to be achieved", "A calendar that spreads the load", "Plans can be revised from your performance"],
    shots: [{ shot: "plans", label: "Plans" }, { shot: "calendar", label: "Calendar" }]
  },
  {
    id: "track", label: "Performance", title: "Tracks and shares performance",
    text: "Every attempt is kept. The performance view shows mastery by topic, what to reinforce, and why answers go wrong, so the next step is clear. Parents and teachers can follow it too.",
    points: ["Topic and skill view of strengths and gaps", "Mistakes grouped by cause", "Results of each attempt, with the questions missed"],
    shots: [{ shot: "performance", label: "Performance" }, { shot: "results", label: "Results" }, { shot: "home", label: "Home" }]
  },
  {
    id: "generate", label: "Agents", title: "Generates material with agents",
    text: "Pick an agent, choose your material and a few options, then choose the format. Quizzes and flashcards are answered inside Luna; anything can also be exported.",
    points: ["Quiz, flashcards and summaries built in", "No prompt writing for the person running it", "Results flow back into performance"],
    shots: [{ shot: "agents", label: "Agents" }, { shot: "agent-run", label: "Run an agent" }, { shot: "quiz", label: "Quiz" }]
  },
  {
    id: "build", label: "Build", title: "Build your own agent",
    text: "Four short steps: what it does, what people can customise, what it reads, and which output blocks it may use. Luna handles the AI behind the scenes.",
    points: ["Plain-language description, no prompts exposed", "Typed controls for the runner", "Output blocks chosen visually"],
    shots: [{ shot: "studio", label: "Agent Studio" }, { shot: "chat", label: "Chatbot" }]
  },
  {
    id: "templates", label: "Templates", title: "Choose how it looks",
    text: "Templates decide how generated content is presented: an A4 exam with or without answers, a worksheet, a deck. The content stays the same, only the design changes.",
    points: ["One agent, many designs", "Preview as A4, Letter or slides", "Export to PDF, Word or HTML"],
    shots: [{ shot: "templates", label: "Gallery" }, { shot: "template-preview", label: "Preview" }]
  },
  {
    id: "market", label: "Marketplace", title: "Buy agents in the marketplace",
    text: "Not everything has to be built from scratch. Browse agents, templates, components, study resources and whole plans, and install them into your workspace. Sample listings are shown here.",
    points: ["Six shelves, each seller has a store", "Installs work today; payments are coming", "Sell your own agents and templates"],
    shots: [{ shot: "marketplace", label: "Marketplace" }]
  }
];

export function DemoTab() {
  const [stepIndex, setStepIndex] = useState(0);
  const [shotIndex, setShotIndex] = useState(0);
  const step = STEPS[stepIndex];
  const shot = step.shots[Math.min(shotIndex, step.shots.length - 1)];
  const pickStep = (i) => { setStepIndex(i); setShotIndex(0); };

  return (
    <>
      <section className="lp-demo-hero">
        <div className="lp-mesh" aria-hidden><i /><i /><i /></div>
        <div className="lp-wrap">
          <span className="lp-eyebrow">Guided tour</span>
          <h1 className="lp-h1 lp-h1-sm">Follow one study journey, <span className="lp-grad">step by step.</span></h1>
          <p className="lp-lead">Every picture below is the running app with demo data. Pick a step, or <a href="/app">open the live demo</a> and click around yourself.</p>
        </div>
      </section>

      <section className="lp-section lp-demo">
        <div className="lp-wrap lp-tour">
          <div className="lp-steps" role="tablist" aria-label="Journey steps" aria-orientation="vertical">
            {STEPS.map((s, i) => (
              <button key={s.id} type="button" role="tab" id={`tour-tab-${s.id}`} aria-selected={i === stepIndex} aria-controls="tour-panel" className={`lp-stepbtn${i === stepIndex ? " on" : ""}`} onClick={() => pickStep(i)}>
                <span className="lp-stepbtn-n">{i + 1}</span>
                <span className="lp-stepbtn-t">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="lp-tour-panel" id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${step.id}`}>
            <div className="lp-tour-stage">
              <BrowserFrame>
                <Shot key={shot.shot} name={shot.shot} className="lp-swap" sizes="(max-width: 900px) 94vw, 760px" />
              </BrowserFrame>
              {step.shots.length > 1 ? (
                <div className="lp-thumbs" role="group" aria-label="Screens in this step">
                  {step.shots.map((s, i) => (
                    <button key={s.shot} type="button" className={i === shotIndex ? "on" : ""} onClick={() => setShotIndex(i)} aria-pressed={i === shotIndex}>{s.label}</button>
                  ))}
                </div>
              ) : null}
              <p className="lp-shot-alt">{SHOTS[shot.shot]?.alt}</p>
            </div>
            <div className="lp-tour-copy">
              <span className="lp-eyebrow">Step {stepIndex + 1} of {STEPS.length}</span>
              <h2 className="lp-h3">{step.title}</h2>
              <p>{step.text}</p>
              <ul className="lp-list">{step.points.map((point) => <li key={point}>{point}</li>)}</ul>
              <div className="lp-tour-nav">
                <button type="button" className="lp-btn lp-btn-ghost" disabled={stepIndex === 0} onClick={() => pickStep(stepIndex - 1)}>Back</button>
                <button type="button" className="lp-btn lp-btn-primary" disabled={stepIndex === STEPS.length - 1} onClick={() => pickStep(stepIndex + 1)}>Next step</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-tint">
        <div className="lp-wrap lp-phones">
          <Reveal className="lp-phones-copy">
            <span className="lp-eyebrow">And on a phone</span>
            <h2 className="lp-h2">The same journey, in your pocket.</h2>
            <p className="lp-sub">Plans, performance and agents with a thumb-friendly tab bar. Add Luna to your home screen to open it like an app.</p>
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
            <h2>See it for yourself.</h2>
            <p>The live demo is the real app with a demo student. No account needed, nothing to install.</p>
            <div className="lp-cta">
              <a className="lp-btn lp-btn-primary lp-btn-lg" href="/app">Try the live demo <span aria-hidden>↗</span></a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
