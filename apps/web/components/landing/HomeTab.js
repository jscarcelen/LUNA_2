"use client";
import { useRef } from "react";
import { LunaLogo } from "../brand/LunaLogo.js";
import { BrowserFrame, PhoneFrame, Shot } from "./shots.js";
import { ScreenSlider } from "./Slider.js";
import { Reveal, useParallax } from "./motion.js";
import { PromoVideo } from "./PromoVideo.js";

const SLIDES = [
  { shot: "home", title: "Your week at a glance", text: "Plans, what is due next and Luna's read of what to work on." },
  { shot: "workspaces", title: "All your material, organised", text: "Your own structure of subjects and folders, for every document and everything generated from it." },
  { shot: "reader", title: "Notes you can read and mark up", text: "Headings, formulas and figures kept intact, with highlights and notes alongside." },
  { shot: "reader-notes", title: "Select, colour, note", text: "Select a sentence, paint it a colour and add a note that stays with the text." },
  { shot: "plans", title: "A study plan with deadlines", text: "What has to be achieved, by when, and the activities that get you there." },
  { shot: "calendar", title: "Work spread over the calendar", text: "Every step lands on a day before the exam, colour-coded by plan." },
  { shot: "quiz", title: "Practise inside Luna", text: "Answer quizzes and flashcards on the platform so every attempt is tracked." },
  { shot: "quiz-answered", title: "Every answer, traced to your documents", text: "After you check, Luna shows where each answer sits in your own material." },
  { shot: "performance", title: "See why answers go wrong", text: "Mastery by topic, and whether mistakes come from knowledge, reasoning or attention." },
  { shot: "coach-read", title: "Luna's read of your results", text: "A plain diagnosis of what is really going wrong and the five things to do next, each one a click away." },
  { shot: "agents", title: "Agents for every kind of material", text: "Quiz, flashcards and summaries built in, plus agents you made or installed." },
  { shot: "builder-prompt", title: "Build your own agent", text: "Say what it does, choose what it reads, set the questions the runner answers and pick the output blocks it may use." },
  { shot: "template-preview", title: "Choose how it looks", text: "The same content as an A4 exam, a worksheet or a deck: you pick the design." },
  { shot: "marketplace", title: "Browse agents, templates and plans", text: "The marketplace shelves (sample listings shown)." }
];

const FLOW = [
  { n: 1, title: "Upload", text: "Drop in your PDFs, Word files and notes. Luna reads the text, headings, formulas and figures.", shot: "workspaces", pos: "left top" },
  { n: 2, title: "Get a plan", text: "Luna consolidates the material into master notes and builds a study plan with deadlines.", shot: "calendar", pos: "left 30%" },
  { n: 3, title: "Practise and track", text: "Do quizzes and flashcards on Luna. Every answer feeds your performance view.", shot: "results", pos: "right top" },
  { n: 4, title: "Expand with your own agents", text: "Build an agent in Agent Studio or buy one in the Marketplace, and plug in the templates you like.", shot: "builder-prompt", pos: "left top" }
];

const PROFILES = [
  { key: "student", title: "Students", text: "Upload your material, follow a plan, practise on Luna and see exactly what to reinforce. Receive work and exam dates from teachers and parents, and share resources with classmates.", points: ["Master notes you can mark up", "A plan that fits your exam date", "Mistakes explained, not just counted"] },
  { key: "parent", title: "Parents", text: "Follow how your child is doing, how efficiently they study and where you can help, with full transparency on performance. Send them work and resources.", points: ["Progress in plain language", "Topics you can support at home", "Linking and sending work are in beta"] },
  { key: "teacher", title: "Teachers", text: "Create material from your documents, assign it with deadlines, send exam dates and organise students in groups. Read performance per student, topic and class.", points: ["Generate from your own resources", "Assign work and exam dates to students or whole groups", "Spot who needs which resource"] }
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

      {/* ------------------------------------------------------------------ promo video */}
      <PromoVideo />

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
            <p className="lp-sub">Luna Study is where you learn. Luna Create is where you build your own resource-generating agents. The Marketplace is where you buy and sell more.</p>
          </Reveal>

          <Reveal className="lp-pillar lp-pillar-blue">
            <div className="lp-pillar-text">
              <span className="lp-tag">Luna Study</span>
              <h3 className="lp-h3">Upload once. Study with a plan.</h3>
              <ul className="lp-list">
                <li>Upload documents and organise them in folders your way. Text, headings, formulas and figures are kept.</li>
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
              <h3 className="lp-h3">Build the agents you need.</h3>
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
              <h3 className="lp-h3">Buy to skip the setup. Sell what you build.</h3>
              <ul className="lp-list">
                <li>Browse agents, templates, components, study resources and whole study plans.</li>
                <li>Everything is bought and sold in Lunas, the same credit that pays for AI usage.</li>
                <li>Package your own agents and templates for others. Browsing and installing work today; plans, payments and top-ups are coming soon.</li>
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
            <span className="lp-eyebrow">On your phone · app coming soon</span>
            <h2 className="lp-h2">Luna on your phone.</h2>
            <p className="lp-sub">A native app is coming soon. Until then, open Luna in your phone's browser and add it to your home screen: it opens full screen, with a tab bar under your thumb for plans, practice and performance.</p>
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
            <span className="lp-eyebrow">One environment, three roles</span>
            <h2 className="lp-h2">Everyone has a purpose. Everyone is connected.</h2>
            <p className="lp-sub">Teachers send exam dates and assignments, parents follow performance, students share resources — and every role sees what matters to it.</p>
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
