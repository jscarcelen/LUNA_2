'use client';
import { useState, useEffect } from 'react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  accent:  '#0071e3',
  ink:     '#1d1d1f',
  sub:     '#6e6e73',
  line:    '#e5e5ea',
  bg:      '#f5f5f7',
  paper:   '#ffffff',
  green:   '#34c759',
  amber:   '#ff9f0a',
  red:     '#ff3b30',
};

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid #e5e5ea', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', color: '#1d1d1f',
  background: '#fff',
};

// ─── Primitives ────────────────────────────────────────────────────────────────
function Btn({ children, primary, ghost, sm, onClick, href, style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: sm ? '7px 16px' : '11px 22px',
    borderRadius: 980,
    fontSize: sm ? 13 : 15,
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
    transition: 'all 0.18s ease',
    ...style,
  };
  const s = primary
    ? { ...base, background: T.accent, color: '#fff' }
    : ghost
    ? { ...base, background: 'transparent', color: T.accent, border: '1.5px solid ' + T.accent }
    : { ...base, background: T.bg, color: T.ink };
  if (href) return <a href={href} style={s}>{children}</a>;
  return <button onClick={onClick} style={s}>{children}</button>;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function LandingNav({ tab, setTab, onSignIn, onSignUp }) {
  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'demo', label: 'Demo' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'training', label: 'Training' },
  ];
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 52, display: 'flex', alignItems: 'center',
      padding: '0 24px',
      background: 'rgba(255,255,255,0.94)',
      borderBottom: '1px solid ' + T.line,
    }}>
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginRight: 32, flexShrink: 0 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L13 5.5V10.5L8 14L3 10.5V5.5L8 2Z" fill="white" fillOpacity="0.9"/>
            <circle cx="8" cy="8" r="2" fill="white"/>
          </svg>
        </span>
        <span style={{ fontSize: 17, fontWeight: 600, color: T.ink, letterSpacing: '-0.3px' }}>LUNA</span>
      </a>
      <div style={{ display: 'flex', gap: 2, flex: 1, alignItems: 'center' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: tab === t.id ? T.bg : 'transparent',
            color: tab === t.id ? T.ink : T.sub,
            fontSize: 14, fontWeight: tab === t.id ? 500 : 400,
            cursor: 'pointer', transition: 'all 0.18s',
          }}>{t.label}</button>
        ))}
        <a href="/app" style={{
          padding: '6px 14px', borderRadius: 6,
          color: T.sub, fontSize: 14, textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>Try Demo ↗</a>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Btn sm ghost onClick={onSignIn}>Sign in</Btn>
        <Btn sm primary onClick={onSignUp}>Get started</Btn>
      </div>
    </nav>
  );
}

// ─── Platform mockup (animated) ────────────────────────────────────────────────
function WorkspaceScreen() {
  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>My Workspace</span>
        <span style={{ fontSize: 11, padding: '4px 10px', background: T.accent + '20', color: T.accent, borderRadius: 980, fontWeight: 500 }}>Upload +</span>
      </div>
      {[
        { name: 'Maths — Chapter 5', type: 'PDF', bg: '#ff3b3010' },
        { name: 'Biology Notes', type: 'DOCX', bg: '#34c75910' },
        { name: 'History Essay', type: 'PDF', bg: '#ff9f0a10' },
      ].map((f, i) => (
        <div key={i} style={{ padding: '8px 10px', borderRadius: 10, background: f.bg, border: '1px solid ' + T.line, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: T.sub, fontWeight: 600 }}>{f.type}</span>
          <span style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{f.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.accent }}>Run agent →</span>
        </div>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, padding: 8, background: T.bg, borderRadius: 10, border: '1px solid ' + T.line }}>
          <div style={{ fontSize: 10, color: T.sub }}>Generated</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.accent }}>12</div>
        </div>
        <div style={{ flex: 1, padding: 8, background: T.bg, borderRadius: 10, border: '1px solid ' + T.line }}>
          <div style={{ fontSize: 10, color: T.sub }}>Activities</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.green }}>5</div>
        </div>
        <div style={{ flex: 1, padding: 8, background: T.bg, borderRadius: 10, border: '1px solid ' + T.line }}>
          <div style={{ fontSize: 10, color: T.sub }}>Lunas</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.amber }}>460🌙</div>
        </div>
      </div>
    </div>
  );
}

function AgentScreen() {
  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: T.sub }}>Step 2 of 3</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Quiz Generator</span>
      </div>
      <div style={{ background: T.bg, borderRadius: 10, padding: 10, fontSize: 12, color: T.sub }}>
        {'Based on '}
        <b style={{ color: T.ink }}>Maths — Chapter 5</b>
      </div>
      {['10 questions', 'Multiple choice', 'Medium difficulty'].map((opt, i) => (
        <div key={i} style={{ padding: '7px 10px', borderRadius: 8, border: '2px solid ' + (i === 0 ? T.accent : T.line), display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid ' + (i === 0 ? T.accent : T.line), background: i === 0 ? T.accent : 'transparent', flexShrink: 0 }} />
          <span style={{ color: T.ink }}>{opt}</span>
        </div>
      ))}
      <div style={{ marginTop: 'auto', padding: '10px 14px', background: T.accent, color: '#fff', borderRadius: 980, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
        Generate — ~40 🌙 lunas
      </div>
    </div>
  );
}

function DashboardScreen() {
  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Performance</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: 'Mastery', val: '74%', color: T.accent },
          { label: 'Streak', val: '7d', color: T.amber },
          { label: 'Done', val: '23', color: T.green },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: 8, background: T.bg, borderRadius: 10, border: '1px solid ' + T.line, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: T.sub }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: T.bg, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { subject: 'Maths', pct: 74 },
          { subject: 'Biology', pct: 58 },
          { subject: 'History', pct: 81 },
        ].map((r, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: T.ink }}>{r.subject}</span>
              <span style={{ color: T.sub }}>{r.pct + '%'}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: T.line }}>
              <div style={{ height: '100%', width: r.pct + '%', borderRadius: 2, background: T.accent }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlatformMockup() {
  const [screen, setScreen] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setScreen(s => (s + 1) % 3), 3200);
    return () => clearInterval(t);
  }, []);

  const navIcons = ['⊞', '★', '✦', '◎', '⊕'];
  const activeNav = [0, 2, 3][screen];

  return (
    <div style={{
      width: '100%', maxWidth: 720,
      background: T.paper, borderRadius: 16,
      border: '1px solid ' + T.line,
      boxShadow: '0 24px 64px rgba(0,0,0,0.13)',
      overflow: 'hidden', aspectRatio: '16/10',
      position: 'relative',
    }}>
      {/* Window chrome */}
      <div style={{ height: 36, background: T.bg, borderBottom: '1px solid ' + T.line, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        <span style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <span style={{ padding: '3px 18px', background: T.paper, borderRadius: 6, fontSize: 11, color: T.sub, border: '1px solid ' + T.line }}>
            luna2-share-web.vercel.app/app
          </span>
        </span>
      </div>

      {/* Layout */}
      <div style={{ display: 'flex', height: 'calc(100% - 36px)' }}>
        {/* Sidebar */}
        <div style={{ width: 52, background: T.bg, borderRight: '1px solid ' + T.line, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 6 }}>
          {navIcons.map((icon, i) => (
            <div key={i} style={{
              width: 34, height: 34, borderRadius: 8,
              background: i === activeNav ? T.accent : 'transparent',
              color: i === activeNav ? '#fff' : T.sub,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, transition: 'all 0.4s',
            }}>{icon}</div>
          ))}
        </div>

        {/* Screen switcher */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {[<WorkspaceScreen key="ws" />, <AgentScreen key="ag" />, <DashboardScreen key="db" />].map((s, i) => (
            <div key={i} style={{
              position: 'absolute', inset: 0,
              opacity: screen === i ? 1 : 0,
              transform: 'translateY(' + (screen === i ? 0 : -6) + 'px)',
              transition: 'opacity 0.5s, transform 0.5s',
              pointerEvents: screen === i ? 'auto' : 'none',
            }}>{s}</div>
          ))}
        </div>
      </div>

      {/* Screen indicator dots */}
      <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
        {['Workspace', 'AI Agent', 'Dashboard'].map((label, i) => (
          <button key={i} onClick={() => setScreen(i)} style={{
            width: screen === i ? 20 : 6, height: 6, borderRadius: 3,
            background: screen === i ? T.accent : T.line,
            border: 'none', cursor: 'pointer', padding: 0,
            transition: 'all 0.3s',
          }} title={label} />
        ))}
      </div>
    </div>
  );
}

// ─── Home section ──────────────────────────────────────────────────────────────
function HomeSection({ onSignUp }) {
  return (
    <div>
      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '80px 24px 56px', maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: T.accent + '14', borderRadius: 980, marginBottom: 24 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent }} />
          <span style={{ fontSize: 13, color: T.accent, fontWeight: 500 }}>Now in beta — join free</span>
        </div>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 62px)', fontWeight: 700, color: T.ink, lineHeight: 1.08, letterSpacing: '-2.5px', margin: '0 0 20px' }}>
          The digital environment<br />that grows with every learner.
        </h1>
        <p style={{ fontSize: 18, color: T.sub, lineHeight: 1.65, margin: '0 auto 36px', maxWidth: 520 }}>
          AI-powered study content, personalised templates, and deep insights — for students, parents, and teachers. From age 5 to adult.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn primary onClick={onSignUp} style={{ fontSize: 16, padding: '12px 26px' }}>Get started free</Btn>
          <Btn ghost href="/app" style={{ fontSize: 16, padding: '12px 26px' }}>Explore the platform ↗</Btn>
        </div>
      </section>

      {/* Mockup */}
      <section style={{ padding: '0 24px 72px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 880 }}>
          <PlatformMockup />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 14 }}>
            {['Workspace', 'AI Agent run', 'Performance dashboard'].map((l, i) => (
              <span key={i} style={{ fontSize: 12, color: T.sub }}>{l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 3 profiles */}
      <section style={{ background: T.bg, padding: '64px 24px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: '-1.5px', margin: '0 0 8px' }}>One platform, three views</h2>
          <p style={{ textAlign: 'center', color: T.sub, fontSize: 16, margin: '0 0 48px' }}>Each profile sees what matters most to them.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {[
              { emoji: '🎓', title: 'Student', badge: '13+', badgeColor: T.accent, desc: 'Generate your own study material, track every mistake, collaborate with friends, and earn lunas in the marketplace.' },
              { emoji: '👨‍👩‍👧', title: 'Parent', badge: '< 13 kids', badgeColor: T.green, desc: 'Create content for your child, monitor performance, link up to 10 kids, and assign study plans and activities.' },
              { emoji: '🏫', title: 'Teacher', badge: 'Any class', badgeColor: T.amber, desc: 'Manage your whole class, generate curriculum per student or group, track errors and link parent accounts.' },
            ].map(p => (
              <div key={p.title} style={{ background: T.paper, borderRadius: 18, padding: 30, border: '1px solid ' + T.line, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 38, marginBottom: 14 }}>{p.emoji}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>{p.title}</span>
                  <span style={{ fontSize: 12, color: p.badgeColor, fontWeight: 500, background: p.badgeColor + '18', padding: '2px 8px', borderRadius: 980 }}>{p.badge}</span>
                </div>
                <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.65, margin: 0 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 features */}
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: '-1.5px', margin: '0 0 48px' }}>Everything a learner needs</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 40 }}>
            {[
              { icon: '🤖', title: 'AI Agents', desc: 'Build or buy quiz generators, flashcard makers, summarisers. Agents produce clean JSON — no formatting baked in.' },
              { icon: '🎨', title: 'Template Studio', desc: 'Design how your content looks — A4 exams, slide decks, worksheets — without touching a single agent setting.' },
              { icon: '🏪', title: 'Marketplace', desc: 'Buy and sell agents, templates, components, study plans, and resources. All transactions in lunas.' },
              { icon: '📊', title: 'Insights', desc: 'Mastery maps, error taxonomies, retention tracking — per student, per class, per child.' },
              { icon: '📅', title: 'Study Plans', desc: 'Set a deadline. Luna schedules the work, runs the agents, and files everything as activities with due dates.' },
              { icon: '🌙', title: 'Lunas', desc: 'One currency for the whole platform — earn by selling, spend on content, gift or transfer between accounts.' },
            ].map(f => (
              <div key={f.title}>
                <div style={{ fontSize: 30, marginBottom: 12 }}>{f.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{f.title}</div>
                <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ background: T.ink, padding: '68px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: '-1.5px', margin: '0 0 12px' }}>Ready to start?</h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 16, margin: '0 0 28px' }}>Free access to the marketplace and performance dashboard. No credit card needed.</p>
        <Btn primary onClick={onSignUp} style={{ fontSize: 16, padding: '13px 30px' }}>Create your free account</Btn>
      </section>
    </div>
  );
}

// ─── Demo section ──────────────────────────────────────────────────────────────
function DemoSection() {
  const [activeProfile, setActiveProfile] = useState('student');

  const profiles = {
    student: {
      emoji: '🎓', label: 'Student',
      steps: [
        { icon: '📂', title: 'Upload your materials', desc: 'Drag PDFs, Word docs, or photos of notes into your workspace. Luna processes and indexes them for every agent.' },
        { icon: '🤖', title: 'Run an AI agent', desc: 'Pick a quiz generator, flashcard maker, or summary agent. Set difficulty, length, and format — no prompting required.' },
        { icon: '✏️', title: 'Do it on Luna', desc: 'Answer the quiz interactively. Every answer is tracked: right, wrong, how confident you were, and how long it took.' },
        { icon: '📊', title: 'See your mastery', desc: 'Your dashboard shows which topics you hold, which you\'re losing, and exactly what to tackle next.' },
      ],
    },
    teacher: {
      emoji: '🏫', label: 'Teacher',
      steps: [
        { icon: '🗂️', title: 'Build your class', desc: 'Add students, group by level or class, and link parent accounts for visibility without giving editing access.' },
        { icon: '📝', title: 'Generate curriculum', desc: 'Create agents that produce personalised quizzes, worksheets, and summaries — per student or per group.' },
        { icon: '📊', title: 'Track the class', desc: 'Class × topic heatmap, error distribution, who needs attention and why. No leaderboards — only progress.' },
        { icon: '🔗', title: 'Share with parents', desc: 'Parents get a read-only performance dashboard for their child. You stay in control of what they see.' },
      ],
    },
    parent: {
      emoji: '👨‍👩‍👧', label: 'Parent',
      steps: [
        { icon: '👶', title: 'Link your child', desc: 'Connect your account to your child\'s profile. Children under 13 require a parent link at sign-up.' },
        { icon: '🎯', title: 'Create content for them', desc: 'Generate quizzes, worksheets, and study plans. Push them directly to your child\'s activity queue.' },
        { icon: '👁️', title: 'Monitor performance', desc: 'Mastery by subject, error patterns, streaks, and what still needs work — in plain language, not jargon.' },
        { icon: '📅', title: 'Set study plans', desc: 'Define an exam date and the topics to cover. Luna schedules the sessions and runs the agents.' },
      ],
    },
  };

  const p = profiles[activeProfile];

  return (
    <div>
      {/* Marketplace overview */}
      <section style={{ background: T.bg, padding: '64px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: '-1.5px', margin: '0 0 8px' }}>Start with the marketplace — free</h2>
          <p style={{ color: T.sub, fontSize: 16, maxWidth: 520, margin: '0 auto 44px' }}>
            Any user with a free account can browse and use all five marketplace shelves.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { icon: '🤖', label: 'AI Agents', desc: 'Quiz generators, summarisers, flashcard makers…' },
              { icon: '🎨', label: 'Templates', desc: 'Exam layouts, worksheets, flashcard designs…' },
              { icon: '🧩', label: 'Components', desc: 'Premium design blocks for Template Studio' },
              { icon: '📚', label: 'Study Resources', desc: 'Ready-made quizzes, notes, practice sets' },
              { icon: '📅', label: 'Study Plans', desc: 'Full revision schedules with activities included' },
            ].map(m => (
              <div key={m.label} style={{ background: T.paper, borderRadius: 14, padding: 20, border: '1px solid ' + T.line, textAlign: 'left' }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{m.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Profile walkthroughs */}
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: '-1.5px', margin: '0 0 36px' }}>See it through each profile</h2>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 52 }}>
            {Object.entries(profiles).map(([key, v]) => (
              <button key={key} onClick={() => setActiveProfile(key)} style={{
                padding: '8px 20px', borderRadius: 980, border: 'none',
                background: activeProfile === key ? T.accent : T.bg,
                color: activeProfile === key ? '#fff' : T.ink,
                fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
              }}>
                {v.emoji + ' ' + v.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 28 }}>
            {p.steps.map((step, i) => (
              <div key={i}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: T.accent + '14', color: T.accent, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  {step.icon}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{i + 1 + '. ' + step.title}</div>
                <p style={{ fontSize: 13, color: T.sub, lineHeight: 1.65, margin: 0 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live demo CTA */}
      <section style={{ padding: '40px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 540, margin: '0 auto', padding: 36, background: T.bg, borderRadius: 20, border: '1px solid ' + T.line }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👀</div>
          <h3 style={{ fontSize: 22, fontWeight: 700, color: T.ink, margin: '0 0 10px' }}>See the real platform</h3>
          <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.65, margin: '0 0 22px' }}>The demo app runs the full platform — no account needed. Explore agents, templates, and dashboards directly.</p>
          <Btn primary href="/app" style={{ fontSize: 15 }}>Open demo app ↗</Btn>
        </div>
      </section>
    </div>
  );
}

// ─── Pricing section ───────────────────────────────────────────────────────────
const FEATURES = [
  { label: 'Marketplace access', free: true, student: true, parent: true, teacher: true },
  { label: 'Performance dashboard (read-only)', free: true, student: true, parent: true, teacher: true },
  { label: 'Generate content with AI agents', free: false, student: true, parent: true, teacher: true },
  { label: 'Upload documents', free: false, student: true, parent: true, teacher: true },
  { label: 'Create & sell AI agents / templates', free: false, student: true, parent: true, teacher: true },
  { label: 'Template Studio', free: false, student: true, parent: true, teacher: true },
  { label: 'Study Plans (auto-scheduled)', free: false, student: true, parent: true, teacher: true },
  { label: 'Link relatives (performance view)', free: false, student: 'Up to 5', parent: true, teacher: true },
  { label: 'Manage child / student profiles', free: false, student: false, parent: 'Up to 10', teacher: 'Up to 100+' },
  { label: 'Assign activities to children', free: false, student: false, parent: true, teacher: true },
  { label: 'Class analytics & heatmaps', free: false, student: false, parent: false, teacher: true },
  { label: 'Link parent ↔ student accounts', free: false, student: false, parent: false, teacher: true },
  { label: 'Monthly lunas', free: '—', student: '500 🌙', parent: '1,000 🌙', teacher: '3,000 🌙' },
  { label: 'Document storage', free: '—', student: '2 GB', parent: '5 GB', teacher: '20 GB' },
];

function Tick({ val }) {
  if (val === true) return <span style={{ color: T.green, fontSize: 15 }}>✓</span>;
  if (val === false) return <span style={{ color: T.line, fontSize: 15 }}>—</span>;
  return <span style={{ fontSize: 12, color: T.ink }}>{val}</span>;
}

function PricingSection({ onSignUp }) {
  const plans = [
    { id: 'free', label: 'Free', price: '€0', period: '', color: T.sub, note: 'Forever free', cta: 'Get started' },
    { id: 'student', label: 'Student', price: '€9', period: '/mo', color: T.accent, note: 'Best for learners 13+', cta: 'Start learning', popular: true },
    { id: 'parent', label: 'Parent', price: '€9', period: '/mo', color: T.green, note: '+ €3 per child · max 10', cta: 'Manage my kids' },
    { id: 'teacher', label: 'Teacher', price: '€29', period: '/mo', color: T.amber, note: 'For full class management', cta: 'Manage my class' },
  ];

  return (
    <div>
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontWeight: 700, color: T.ink, letterSpacing: '-1.5px', margin: '0 0 8px' }}>Simple, honest pricing</h2>
            <p style={{ color: T.sub, fontSize: 16, margin: 0 }}>Pay in lunas. Top up any time. No hidden fees.</p>
          </div>

          {/* Plan cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 56 }}>
            {plans.map(plan => (
              <div key={plan.id} style={{
                background: T.paper, borderRadius: 20, padding: 28,
                border: plan.popular ? '2px solid ' + T.accent : '1px solid ' + T.line,
                boxShadow: plan.popular ? '0 8px 32px ' + T.accent + '22' : '0 2px 12px rgba(0,0,0,0.04)',
                position: 'relative',
              }}>
                {plan.popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: T.accent, color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 14px', borderRadius: 980, whiteSpace: 'nowrap' }}>
                    Most popular
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 600, color: plan.color, marginBottom: 8 }}>{plan.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 4 }}>
                  <span style={{ fontSize: 38, fontWeight: 700, color: T.ink, letterSpacing: '-2px' }}>{plan.price}</span>
                  <span style={{ fontSize: 14, color: T.sub }}>{plan.period}</span>
                </div>
                <div style={{ fontSize: 12, color: T.sub, marginBottom: 22 }}>{plan.note}</div>
                <button onClick={onSignUp} style={{
                  width: '100%', padding: '10px', borderRadius: 980, border: 'none',
                  background: plan.popular ? T.accent : T.bg,
                  color: plan.popular ? '#fff' : T.ink,
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'opacity 0.18s',
                }}>{plan.cta}</button>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid ' + T.line }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: T.sub, fontWeight: 500, width: '40%' }}>Feature</th>
                  {plans.map(p => (
                    <th key={p.id} style={{ textAlign: 'center', padding: '10px 12px', color: p.color, fontWeight: 600 }}>{p.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid ' + T.line, background: i % 2 === 0 ? 'transparent' : T.bg }}>
                    <td style={{ padding: '10px 12px', color: T.ink }}>{f.label}</td>
                    {['free', 'student', 'parent', 'teacher'].map(k => (
                      <td key={k} style={{ textAlign: 'center', padding: '10px 12px' }}>
                        <Tick val={f[k]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lunas explainer */}
          <div style={{ marginTop: 40, padding: 28, background: T.bg, borderRadius: 16, border: '1px solid ' + T.line }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, marginBottom: 8 }}>🌙 What are lunas?</div>
            <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.75, margin: 0 }}>
              Lunas are the currency of the platform. Every subscription includes a monthly allowance.
              Use them to run AI agents, buy marketplace items, tip creators, send resources to friends,
              or top up a child's account. Buy more any time — and earn them by selling your own
              agents, templates, and resources in the marketplace.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Training section ──────────────────────────────────────────────────────────
function TrainingSection() {
  const courses = [
    { title: 'Getting started with LUNA', duration: '2 min', category: 'Foundations', icon: '🚀', desc: 'A quick tour — profiles, workspace, navigation, and your first resource.' },
    { title: 'Generating study content with AI Agents', duration: '3 min', category: 'Agents', icon: '🤖', desc: 'Run your first quiz generator: choose material, set options, generate, and do it on Luna.' },
    { title: 'Creating your own AI Agent', duration: '3 min', category: 'Agents', icon: '⚙️', desc: 'Open Agent Studio, define a recipe, set the output fields, and publish to your profile.' },
    { title: 'Templates vs. Agents — why they\'re separate', duration: '2 min', category: 'Concepts', icon: '🧩', desc: 'Agents own content. Templates own presentation. Here\'s why that matters and how to use both together.' },
    { title: 'Designing a template in Template Studio', duration: '3 min', category: 'Templates', icon: '🎨', desc: 'Drag blocks, add AI fields, set repetition, preview at any size, and export to PDF or Word.' },
    { title: 'Using the Marketplace', duration: '2 min', category: 'Marketplace', icon: '🏪', desc: 'Browse, install, and use agents and templates from the community. Set up your own seller store.' },
    { title: 'Performance Tracking & Insights', duration: '3 min', category: 'Insights', icon: '📊', desc: 'Read your mastery map, understand the error taxonomy, and act on what Luna recommends.' },
    { title: 'Study Plans & Activities', duration: '2 min', category: 'Plans', icon: '📅', desc: 'Set a deadline, define goals. Luna plans the sessions, runs the agents, and files everything as activities.' },
    { title: 'Lunas — earning, spending & transferring', duration: '1 min', category: 'Foundations', icon: '🌙', desc: 'How the currency works: subscriptions, top-ups, gifts, transfers, and marketplace payouts.' },
  ];

  const categories = ['All', ...new Set(courses.map(c => c.category))];
  const [active, setActive] = useState('All');
  const filtered = active === 'All' ? courses : courses.filter(c => c.category === active);

  return (
    <section style={{ padding: '64px 24px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 36, fontWeight: 700, color: T.ink, letterSpacing: '-1.5px', margin: '0 0 8px' }}>Training library</h2>
          <p style={{ color: T.sub, fontSize: 16, margin: 0 }}>Short courses to get the most from every feature. 1–3 minutes each.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 40 }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActive(cat)} style={{
              padding: '6px 16px', borderRadius: 980, border: 'none',
              background: active === cat ? T.accent : T.bg,
              color: active === cat ? '#fff' : T.ink,
              fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.18s',
            }}>{cat}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 16 }}>
          {filtered.map((course, i) => (
            <div key={i} style={{
              background: T.paper, borderRadius: 16, padding: 24,
              border: '1px solid ' + T.line, cursor: 'pointer',
              transition: 'box-shadow 0.18s, transform 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>{course.icon}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, background: T.bg, color: T.sub, padding: '3px 8px', borderRadius: 980 }}>{course.category}</span>
                  <span style={{ fontSize: 11, background: T.accent + '14', color: T.accent, padding: '3px 8px', borderRadius: 980 }}>{course.duration}</span>
                </div>
              </div>
              <div style={{ height: 80, background: T.bg, borderRadius: 10, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 14, marginLeft: 2 }}>▶</span>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 6, lineHeight: 1.3 }}>{course.title}</div>
              <p style={{ fontSize: 13, color: T.sub, lineHeight: 1.65, margin: 0 }}>{course.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Auth modal ────────────────────────────────────────────────────────────────
function AuthModal({ mode, onClose, onToggle }) {
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState('student');
  const [studentAge, setStudentAge] = useState('');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const isSignUp = mode === 'signup';
  const setField = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.42)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: T.paper, borderRadius: 22, padding: 40,
        width: '100%', maxWidth: 420,
        boxShadow: '0 24px 72px rgba(0,0,0,0.2)',
        position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: T.bg, border: 'none', borderRadius: '50%',
          width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: T.sub,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: T.accent, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L13 5.5V10.5L8 14L3 10.5V5.5L8 2Z" fill="white" fillOpacity="0.9"/>
              <circle cx="8" cy="8" r="2" fill="white"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.ink, margin: 0 }}>
            {isSignUp ? (step === 1 ? 'Choose your profile' : 'Create your account') : 'Welcome back'}
          </h2>
          {isSignUp && step === 1 && <p style={{ fontSize: 13, color: T.sub, margin: '6px 0 0' }}>Pick the profile that fits you best</p>}
        </div>

        {isSignUp && step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {[
              { id: 'student', emoji: '🎓', title: 'Student (13+)', desc: 'Generate and track your own study material' },
              { id: 'parent', emoji: '👨‍👩‍👧', title: 'Parent', desc: 'Create content for your child, monitor their performance' },
              { id: 'teacher', emoji: '🏫', title: 'Teacher', desc: 'Manage a class, build curriculum, link parent accounts' },
            ].map(t => (
              <button key={t.id} onClick={() => setAccountType(t.id)} style={{
                padding: '14px 16px', borderRadius: 14, border: '2px solid ' + (accountType === t.id ? T.accent : T.line),
                background: accountType === t.id ? T.accent + '08' : T.paper,
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                transition: 'all 0.18s', textAlign: 'left',
              }}>
                <span style={{ fontSize: 24 }}>{t.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: T.sub }}>{t.desc}</div>
                </div>
              </button>
            ))}
            {accountType === 'student' && (
              <div style={{ padding: 14, background: T.bg, borderRadius: 12, marginTop: 4 }}>
                <label style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>Child's age</label>
                <input
                  type="number" min="5" max="25"
                  placeholder="e.g. 12"
                  value={studentAge}
                  onChange={e => setStudentAge(e.target.value)}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
                {studentAge && parseInt(studentAge, 10) < 13 && (
                  <div style={{ fontSize: 12, color: T.amber, marginTop: 6 }}>⚠️ Under 13 requires a parent account to be linked after sign-up.</div>
                )}
              </div>
            )}
            <button onClick={() => setStep(2)} style={{
              marginTop: 6, padding: '12px', borderRadius: 980, border: 'none',
              background: T.accent, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>Continue →</button>
          </div>
        )}

        {(!isSignUp || step === 2) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSignUp && (
              <div>
                <label style={{ fontSize: 13, color: T.ink, fontWeight: 500, display: 'block', marginBottom: 6 }}>Full name</label>
                <input value={form.name} onChange={setField('name')} placeholder="Your name" style={inputStyle} />
              </div>
            )}
            <div>
              <label style={{ fontSize: 13, color: T.ink, fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" value={form.email} onChange={setField('email')} placeholder="you@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: T.ink, fontWeight: 500, display: 'block', marginBottom: 6 }}>Password</label>
              <input type="password" value={form.password} onChange={setField('password')} placeholder="••••••••" style={inputStyle} />
            </div>
            {isSignUp && (
              <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
                By creating an account you agree to the Terms of Service and Privacy Policy.
              </div>
            )}
            <button style={{
              marginTop: 2, padding: '12px', borderRadius: 980, border: 'none',
              background: T.accent, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>
              {isSignUp ? 'Create account' : 'Sign in'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 13, color: T.sub }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button onClick={onToggle} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────────
export function LandingPage() {
  const [tab, setTab] = useState('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');

  const openSignUp = () => { setAuthMode('signup'); setAuthOpen(true); };
  const openSignIn = () => { setAuthMode('signin'); setAuthOpen(true); };

  return (
    <>
      <LandingNav tab={tab} setTab={setTab} onSignIn={openSignIn} onSignUp={openSignUp} />
      <main style={{ paddingTop: 52, minHeight: '100vh', background: T.paper, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        {tab === 'home' && <HomeSection onSignUp={openSignUp} />}
        {tab === 'demo' && <DemoSection />}
        {tab === 'pricing' && <PricingSection onSignUp={openSignUp} />}
        {tab === 'training' && <TrainingSection />}
      </main>
      {authOpen && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthOpen(false)}
          onToggle={() => setAuthMode(m => m === 'signin' ? 'signup' : 'signin')}
        />
      )}
    </>
  );
}
