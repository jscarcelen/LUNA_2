"use client";
import { useRef } from "react";
import { LunaLogo } from "../brand/LunaLogo.js";
import { BrowserFrame, PhoneFrame, Shot } from "./shots.js";
import { ScreenSlider } from "./Slider.js";
import { Reveal, useParallax } from "./motion.js";

const SLIDES = [
  { shot: "home", title: "Your week at a glance", text: "Plans, what is due next and Luna's read of what to work on." },
  { shot: "workspaces", title: "All your material, organised", text: "Subjects, topics and folders for every document and everything generated from it." },
  { shot: "reader", title: "Notes you can read and mark up", text: "Headings, formulas and figures kept intact, with highlights and notes alongside." },
  { shot: "plans", title: "A study plan with deadlines", text: "What has to be achieved, by when, and the activities that get you there." },
  { shot: "calendar", title: "Work spread over the calendar", text: "Every step lands on a day before the exam, colour-coded by plan." },
  { shot: "quiz", title: "Practise inside Luna", text: "Answer quizzes and flashcards on the platform so every attempt is tracked." },
  { shot: "performance", title: "See why answers go wrong", text: "Mastery by topic, and whether mistakes come from knowledge, reasoning or attention." },
  { shot: "agents", title: "Generators for every kind of material", text: "Quiz, flashcards and summaries built in, plus agents you made or installed." },
  { shot: "studio", title: "Build your own agent", text: "Describe it, choose what it reads, what the runner picks and which output blocks it may use." },
  { shot: "template-preview", title: "Choose how it looks", text: "The same content as an A4 exam, a worksheet or a deck: you pick the design." },
  { shot: "marketplace", title: "Browse agents, templates and plans", text: "The marketplace shelves (sample listings shown)." }
];

const FLOW = [
  { n: 1, title: "Upload", text: "Drop in your PDFs, Word files and notes. Luna reads the text, headings, formulas and figures.", shot: "workspaces", pos: "left top" },
  { n: 2, title: "Get a plan", text: "Luna consolidates the material into master notes and builds a study plan with deadlines.", shot: "calendar", pos: "left 30%" },
  { n: 3, title: "Practise and track", text: "Do quizzes and flashcards on Luna. Every answer feeds your performance view.", shot: "results", pos: "right top" },
  { n: 4, title: "Expand your generators", text: "Build an agent in Agent Studio or install one from the Marketplace, and plug in the templates you like.", shot: "studio", pos: "left top" }
];

const PROFILES = [
  { key: "student", title: "Students", text: "Upload your material, follow a plan, practise on Luna and see exactly which topics and skills to reinforce.", points: ["Master notes you can mark up", "A plan that fits your exam date", "Mistakes explained, not just counted"] },
  { key: "parent", title: "Parents", text: "Follow how your child is doing, how efficiently they study and where you can help. Link accounts to send them work.", points: ["Progress in plain language", "Topics you can support at home", "Linking and assigning are in beta"] },
  { key: "teacher", title: "Teachers", text: "Create material from your documents, assign it to students and read performance per student, topic and class.", points: ["Generate from your own resources", "Assign work to linked students", "Spot who needs which resource"] }
];

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
  const hero = useRef(null);
  useParallax(hero);
  return (
    <>
      {/* ------------------------------------------------------------------ hero */}
      <section className="lp-hero" ref={hero}>
        <div className="lp-mesh" aria-hidden><i /><i /><i /></div>
        <div className="lp-wrap lp-hero-copy">
          <span className="lp-badge"><LunaLogo mark size={14} /> Now in beta · free to try</span>
          <h1 className="lp-h1">Upload everything.<br />Luna turns it into <span className="lp-grad">a plan that works.</span></h1>
          <p className="lp-lead">A study helper for students, parents and teachers. Luna reads your documents, consolidates them into master notes, builds your study plan, tracks how you are really doing, and generates the practice material you need.</p>
          <div className="lp-cta">
            <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={onSignUp}>Get started free</button>
            <a className="lp-btn lp-btn-glass lp-btn-lg" href="/app">Try the live demo <span aria-hidden>↗</span></a>
          </div>
        </div>
        <div className="lp-hero-stage">
          <PhoneFrame className="lp-hero-phone lp-hero-phone-l"><Shot name="m-plans" eager /></PhoneFrame>
          <div className="lp-hero-main">
            <BrowserFrame><Shot name="home" eager sizes="(max-width: 900px) 94vw, 1000px" /></BrowserFrame>
          </div>
          <PhoneFrame className="lp-hero-phone lp-hero-phone-r"><Shot name="m-performance" eager /></PhoneFrame>
        </div>
        <p className="lp-caption">Real screens from the running app, with demo data.</p>
      </section>

      {/* ------------------------------------------------------------------ slider */}
      <section className="lp-section lp-tint">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">Inside Luna</span>
            <h2 className="lp-h2">Everything in one place, as it really looks.</h2>
            <p className="lp-sub">Swipe through the product: from the first upload to the performance view.</p>
          </Reveal>
        </div>
        <Reveal><ScreenSlider slides={SLIDES} /></Reveal>
      </section>

      {/* ------------------------------------------------------------------ pillars */}
      <section className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-eyebrow">Three parts, one environment</span>
            <h2 className="lp-h2">Study. Create. Expand.</h2>
            <p className="lp-sub">Luna Study is where you learn. Luna Create is where you build the generators. The Marketplace is where you get more.</p>
          </Reveal>

          <Reveal className="lp-pillar lp-pillar-blue">
            <div className="lp-pillar-text">
              <span className="lp-tag">Luna Study</span>
              <h3 className="lp-h3">Upload once. Study with a plan.</h3>
              <ul className="lp-list">
                <li>Upload documents into subjects, topics and folders. Text, headings, formulas and figures are kept.</li>
                <li>Read the consolidated master notes, highlight and add your own notes.</li>
                <li>Follow a study plan tied to your goals and exam dates; doing an activity ticks it off.</li>
                <li>See what to reinforce, and why mistakes happen: topic knowledge, reasoning or attention.</li>
              </ul>
            </div>
            <div className="lp-pillar-art">
              <BrowserFrame><Shot name="plans" sizes="(max-width: 900px) 90vw, 640px" /></BrowserFrame>
              <BrowserFrame className="lp-float-b"><Shot name="reader" sizes="(max-width: 900px) 60vw, 380px" /></BrowserFrame>
            </div>
          </Reveal>

          <Reveal className="lp-pillar lp-pillar-teal lp-flip">
            <div className="lp-pillar-text">
              <span className="lp-tag">Luna Create</span>
              <h3 className="lp-h3">Make the generators you need.</h3>
              <ul className="lp-list">
                <li>Agent Studio: say what the agent does, what it reads, what the person running it chooses.</li>
                <li>Pick which output blocks it may use; the agent decides the order.</li>
                <li>Template Studio: the same content as an exam, a worksheet or flashcards, in the style you choose.</li>
                <li>Answer inside Luna, or export to PDF, Word or HTML.</li>
              </ul>
            </div>
            <div className="lp-pillar-art">
              <BrowserFrame><Shot name="studio" sizes="(max-width: 900px) 90vw, 640px" /></BrowserFrame>
              <BrowserFrame className="lp-float-b"><Shot name="template-preview" sizes="(max-width: 900px) 60vw, 380px" /></BrowserFrame>
            </div>
          </Reveal>

          <Reveal className="lp-pillar lp-pillar-green">
            <div className="lp-pillar-text">
              <span className="lp-tag">Luna Marketplace</span>
              <h3 className="lp-h3">Skip the setup, or sell yours.</h3>
              <ul className="lp-list">
                <li>Browse agents, templates, components, study resources and whole study plans.</li>
                <li>Install what you like into your workspace and run it on your own material.</li>
                <li>Package your own agents and templates for others. Browsing and installing work today; payments are on the way.</li>
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
            <span className="lp-eyebrow">How it works</span>
            <h2 className="lp-h2">From a pile of documents to a system that adapts.</h2>
          </Reveal>
          <ol className="lp-flow">
            {FLOW.map((step, i) => (
              <Reveal as="li" className="lp-step" key={step.n} delay={i * 90}>
                <div className="lp-step-img"><Shot name={step.shot} fit={step.pos} sizes="(max-width: 900px) 90vw, 300px" /></div>
                <span className="lp-step-n">{step.n}</span>
                <h3 className="lp-h4">{step.title}</h3>
                <p>{step.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ phone */}
      <section className="lp-section">
        <div className="lp-wrap lp-phones">
          <Reveal className="lp-phones-copy">
            <span className="lp-eyebrow">On your phone</span>
            <h2 className="lp-h2">Add Luna to your home screen.</h2>
            <p className="lp-sub">Luna installs like an app and opens full screen, with a tab bar under your thumb. Plans, practice and performance, wherever you study.</p>
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
            <span className="lp-eyebrow">One environment, three views</span>
            <h2 className="lp-h2">Each person sees what matters to them.</h2>
          </Reveal>
          <div className="lp-profiles">
            {PROFILES.map((profile, i) => (
              <Reveal className="lp-profile" key={profile.key} delay={i * 90}>
                <span className="lp-profile-icon"><Icon name={profile.key} /></span>
                <h3 className="lp-h4">{profile.title}</h3>
                <p>{profile.text}</p>
                <ul>{profile.points.map((point) => <li key={point}>{point}</li>)}</ul>
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
            <h2>Start with your own material.</h2>
            <p>Create a free account, upload a document and see the plan Luna builds. Luna is in beta: it is improving every week.</p>
            <div className="lp-cta">
              <button type="button" className="lp-btn lp-btn-white lp-btn-lg" onClick={onSignUp}>Create your free account</button>
              <a className="lp-btn lp-btn-outline-white lp-btn-lg" href="/app">Try the live demo <span aria-hidden>↗</span></a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
