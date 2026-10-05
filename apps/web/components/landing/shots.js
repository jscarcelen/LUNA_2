import { LunaLogo } from "../brand/LunaLogo.js";

/**
 * The real screenshots of the running app (captured by scripts/landing-capture/capture.mjs into
 * public/landing/). Nothing on the landing page is drawn to look like the product: if a picture shows
 * the app, it is a photograph of the app.
 */
const D = { w: 1440, h: 900 };
const P = { w: 390, h: 844 };

export const SHOTS = {
  home: { ...D, alt: "Luna home: study plans, next steps from Luna and your top actions" },
  workspaces: { ...D, alt: "Workspaces: folders and every uploaded document and generated resource" },
  reader: { ...D, alt: "Luna reader: a document with headings, formulas and highlighted notes" },
  plans: { ...D, alt: "Study plans: what is due next and every plan's progress" },
  calendar: { ...D, alt: "Study plan calendar with the work spread over the weeks before the exam" },
  activities: { ...D, alt: "Activities: quizzes, exams and flashcards to do on Luna" },
  results: { ...D, alt: "Results of an activity: attempts, score and the mistakes to review" },
  quiz: { ...D, alt: "An interactive quiz answered inside Luna" },
  performance: { w: 1440, h: 1290, alt: "Performance: mastery, topics to improve and why answers are wrong" },
  agents: { ...D, alt: "AI agents: the quiz generator, flashcards and your own agents, each with a Run button" },
  "agent-run": { ...D, alt: "Running the quiz generator: choose material, answer a few questions, pick the format" },
  studio: { ...D, alt: "Agent Studio, step 4: pick the output blocks the agent may use" },
  templates: { ...D, alt: "Template Studio gallery with the first page of each template" },
  "template-preview": { ...D, alt: "A4 preview of an exam template, student view" },
  marketplace: { ...D, alt: "Marketplace shelves for agents, templates, components, resources and study plans (sample listings)" },
  chat: { ...D, alt: "The Luna chatbot: ask about your material, run agents, write documents" },
  "m-home": { ...P, alt: "Luna on a phone: home", phone: true },
  "m-workspaces": { ...P, alt: "Luna on a phone: workspaces", phone: true },
  "m-plans": { ...P, alt: "Luna on a phone: study plans", phone: true },
  "m-performance": { ...P, alt: "Luna on a phone: performance", phone: true },
  "m-agents": { ...P, alt: "Luna on a phone: AI agents", phone: true }
};

/** A real screenshot, responsive and lazy. `eager` for the hero image. */
export function Shot({ name, eager = false, sizes = "(max-width: 900px) 94vw, 1000px", className = "", style, fit }) {
  const s = SHOTS[name];
  if (!s) return null;
  const set = s.phone
    ? { src: `/landing/${name}-780.webp`, srcSet: `/landing/${name}-780.webp 780w` }
    : { src: `/landing/${name}-1000.webp`, srcSet: `/landing/${name}-1000.webp 1000w, /landing/${name}-2000.webp 2000w` };
  return (
    <img
      className={`lp-shot ${className}`}
      style={{ ...(fit ? { objectFit: "cover", objectPosition: fit } : null), ...style }}
      src={set.src}
      srcSet={set.srcSet}
      sizes={s.phone ? "260px" : sizes}
      width={s.w}
      height={s.h}
      alt={s.alt}
      loading={eager ? "eager" : "lazy"}
      decoding={eager ? "sync" : "async"}
      fetchPriority={eager ? "high" : "auto"}
    />
  );
}

/** A browser window around a real screenshot (CSS only). */
export function BrowserFrame({ children, className = "", title = "LUNA" }) {
  return (
    <div className={`lp-frame ${className}`}>
      <div className="lp-frame-bar" aria-hidden>
        <span /><span /><span />
        <div className="lp-frame-title"><LunaLogo mark size={12} />{title}</div>
      </div>
      <div className="lp-frame-body">{children}</div>
    </div>
  );
}

/** A phone around a real phone-size screenshot (CSS only). */
export function PhoneFrame({ children, className = "", style }) {
  return (
    <div className={`lp-phone ${className}`} style={style}>
      <div className="lp-phone-screen">{children}</div>
    </div>
  );
}
