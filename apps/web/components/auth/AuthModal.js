'use client';
import { LunaLogo } from '../brand/LunaLogo';
import { useState } from 'react';
import { accountsApi } from '../../modules/accounts/api';
import { ACCOUNTS_MIGRATION } from '../../modules/accounts/SetupNotice';

// ─── Design tokens (the same crisp, light language as the landing page) ─────────
const T = {
  accent: '#0071e3',
  ink: '#1d1d1f',
  sub: '#6e6e73',
  line: '#e5e5ea',
  bg: '#f5f5f7',
  paper: '#ffffff',
  amber: '#b25e00',
  red: '#d70015',
};

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid #e5e5ea', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit', color: '#1d1d1f',
  background: '#fff',
};
const labelStyle = { fontSize: 13, color: T.ink, fontWeight: 500, display: 'block', marginBottom: 6 };
const primaryButton = (disabled) => ({
  marginTop: 2, padding: '12px', borderRadius: 980, border: 'none',
  background: T.accent, color: '#fff', fontSize: 15, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
});

const PROFILES = [
  { id: 'student', emoji: '🎓', title: 'Student', desc: 'Generate and track your own study material' },
  { id: 'parent', emoji: '👨‍👩‍👧', title: 'Parent', desc: 'Follow your children’s progress and send them work' },
  { id: 'teacher', emoji: '🏫', title: 'Teacher', desc: 'Manage a class, build curriculum, assign work to students' },
];

// Who each profile can ask to connect with at sign-up. `relation` is the role of the person asked.
const INVITE_FIELDS = {
  teacher: [{ key: 'students', relation: 'student', label: 'Your students’ emails', hint: 'Optional. One per line or separated by commas.' }],
  parent: [{ key: 'children', relation: 'student', label: 'Your children’s emails', hint: 'Optional. One per line or separated by commas.' }],
  student: [
    { key: 'parents', relation: 'parent', label: 'Parent emails', hint: 'Optional.' },
    { key: 'teachers', relation: 'teacher', label: 'Teacher emails', hint: 'Optional.' },
  ],
};

/** "a@b.com, c@d.com\ne@f.com" -> ['a@b.com', 'c@d.com', 'e@f.com'] */
export function parseEmailList(text) {
  return [...new Set(String(text || '').split(/[\s,;]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Log in / sign up with email and password. Used by the landing page and the /login page.
 * On success the browser goes to `next` (the real platform, /platform, by default).
 */
export function AuthModal({ mode, onClose, onToggle, next = '/platform' }) {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('student');
  const [age, setAge] = useState('');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [invites, setInvites] = useState({});
  const [error, setError] = useState('');
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === 'signup';
  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const under13 = role === 'student' && Number(age) > 0 && Number(age) < 13;

  async function submit(event) {
    event?.preventDefault();
    if (busy) return;
    setError('');
    setSetupNeeded(false);
    setBusy(true);
    const result = isSignUp
      ? await accountsApi.signup({
          displayName: form.name,
          email: form.email,
          password: form.password,
          role,
          age: role === 'student' && age ? Number(age) : undefined,
          invites: (INVITE_FIELDS[role] || []).flatMap((field) => parseEmailList(invites[field.key]).map((email) => ({ email, relation: field.relation }))),
        })
      : await accountsApi.login({ email: form.email, password: form.password });
    setBusy(false);
    if (result.ok) {
      window.location.assign(next);
      return;
    }
    if (result.setupNeeded) setSetupNeeded(true);
    setError(result.error);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}
      onClick={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div role="dialog" aria-modal="true" aria-label={isSignUp ? 'Create your account' : 'Log in'} style={{ background: T.paper, borderRadius: 22, padding: 40, width: '100%', maxWidth: 440, boxShadow: '0 24px 72px rgba(0,0,0,0.2)', position: 'relative', margin: 'auto' }}>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, background: T.bg, border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: T.sub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ margin: '0 auto 12px', display: 'flex', justifyContent: 'center' }}><LunaLogo size={44} mark tile /></div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.ink, margin: 0 }}>
            {isSignUp ? (step === 1 ? 'Choose your profile' : 'Create your account') : 'Welcome back'}
          </h2>
          {isSignUp && step === 1 && <p style={{ fontSize: 13, color: T.sub, margin: '6px 0 0' }}>Pick the profile that fits you best</p>}
        </div>

        {isSignUp && step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {PROFILES.map((profile) => (
              <button type="button" key={profile.id} onClick={() => setRole(profile.id)} aria-pressed={role === profile.id} style={{
                padding: '14px 16px', borderRadius: 14, border: '2px solid ' + (role === profile.id ? T.accent : T.line),
                background: role === profile.id ? T.accent + '08' : T.paper,
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all 0.18s', textAlign: 'left',
              }}>
                <span style={{ fontSize: 24 }}>{profile.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{profile.title}</div>
                  <div style={{ fontSize: 12, color: T.sub }}>{profile.desc}</div>
                </div>
              </button>
            ))}
            {role === 'student' && (
              <div style={{ padding: 14, background: T.bg, borderRadius: 12, marginTop: 4 }}>
                <label htmlFor="luna-age" style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>Your age</label>
                <input id="luna-age" type="number" min="5" max="99" placeholder="e.g. 12" value={age} onChange={(event) => setAge(event.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
                {under13 && (
                  <div style={{ fontSize: 12, color: T.amber, marginTop: 6 }}>⚠️ Under 13 requires a parent account to be linked after sign-up. Add your parent’s email on the next step and they will need to accept.</div>
                )}
              </div>
            )}
            <button type="button" onClick={() => setStep(2)} style={{ ...primaryButton(false), marginTop: 6 }}>Continue →</button>
          </div>
        )}

        {(!isSignUp || step === 2) && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
            {isSignUp && (
              <div>
                <label htmlFor="luna-name" style={labelStyle}>Full name</label>
                <input id="luna-name" autoComplete="name" value={form.name} onChange={setField('name')} placeholder="Your name" style={inputStyle} />
              </div>
            )}
            <div>
              <label htmlFor="luna-email" style={labelStyle}>Email</label>
              <input id="luna-email" type="email" autoComplete="email" value={form.email} onChange={setField('email')} placeholder="you@example.com" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="luna-password" style={labelStyle}>Password</label>
              <input id="luna-password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={form.password} onChange={setField('password')} placeholder={isSignUp ? 'At least 8 characters' : '••••••••'} style={inputStyle} />
            </div>

            {isSignUp && (INVITE_FIELDS[role] || []).map((field) => (
              <div key={field.key}>
                <label htmlFor={`luna-invite-${field.key}`} style={labelStyle}>{field.label} <span style={{ color: T.sub, fontWeight: 400 }}>(optional)</span></label>
                <textarea id={`luna-invite-${field.key}`} rows={2} value={invites[field.key] || ''} onChange={(event) => setInvites((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="name@example.com, another@example.com" style={{ ...inputStyle, resize: 'vertical' }} />
                <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{field.hint}</div>
              </div>
            ))}
            {isSignUp && (INVITE_FIELDS[role] || []).length > 0 && (
              <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, background: T.bg, borderRadius: 10, padding: '10px 12px' }}>
                We send each of them a connection request. A connection only becomes active once <strong>both</strong> accounts agree. If someone has no LUNA account yet, the request waits and appears for them as soon as they sign up with that email.
              </div>
            )}

            {setupNeeded ? (
              <div role="alert" style={{ fontSize: 12.5, color: T.ink, background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.35)', borderRadius: 12, padding: '10px 12px', lineHeight: 1.5 }}>
                <strong>Accounts need one database step.</strong> Apply <code>{ACCOUNTS_MIGRATION}</code> in Supabase, then try again. The demo (<a href="/app" style={{ color: T.accent }}>/app</a>) works without it.
              </div>
            ) : error ? (
              <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div>
            ) : null}

            {isSignUp && (
              <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
                By creating an account you agree to the Terms of Service and Privacy Policy.
              </div>
            )}
            <button type="submit" disabled={busy} style={primaryButton(busy)}>
              {busy ? 'One moment…' : isSignUp ? 'Create account' : 'Log in'}
            </button>
            {isSignUp && (
              <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', fontSize: 13 }}>← Change profile</button>
            )}
            <div style={{ textAlign: 'center', fontSize: 13, color: T.sub }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button type="button" onClick={() => { setError(''); setStep(1); onToggle?.(); }} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                {isSignUp ? 'Log in' : 'Sign up'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
