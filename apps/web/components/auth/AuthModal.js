'use client';
import { LunaLogo } from '../brand/LunaLogo';
import { useState } from 'react';
import { accountsApi } from '../../modules/accounts/api';
import { ACCOUNTS_MIGRATION } from '../../modules/accounts/SetupNotice';
import { PHONE_HELP, normalizePhone } from '../../lib/phone.js';

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
  const [form, setForm] = useState({ email: '', password: '', passwordConfirm: '', phone: '', name: '' });
  const [invites, setInvites] = useState({});
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [setupMigration, setSetupMigration] = useState('');
  const [busy, setBusy] = useState(false);
  // 'form' = log in / sign up; 'forgot' = ask for a reset link; 'done' = account created, check your email.
  const [view, setView] = useState('form');
  const [notice, setNotice] = useState(null);
  const isSignUp = mode === 'signup';
  const setField = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  };
  const under13 = role === 'student' && Number(age) > 0 && Number(age) < 13;
  // The mismatch message appears as soon as both fields have something, and the form cannot be sent until they match.
  const mismatch = isSignUp && form.passwordConfirm.length > 0 && form.password !== form.passwordConfirm;
  const passwordConfirmError = fieldErrors.passwordConfirm || (mismatch ? 'The two passwords do not match.' : '');

  function showFailure(result) {
    if (result.setupNeeded) setSetupMigration(result.migration || ACCOUNTS_MIGRATION);
    const field = result.data?.field;
    if (field && ['phone', 'password', 'passwordConfirm'].includes(field)) setFieldErrors((current) => ({ ...current, [field]: result.error }));
    else setError(result.error);
  }

  async function submit(event) {
    event?.preventDefault();
    if (busy) return;
    setError('');
    setFieldErrors({});
    setSetupMigration('');
    if (isSignUp) {
      const problems = {};
      if (form.password !== form.passwordConfirm) problems.passwordConfirm = 'The two passwords do not match.';
      const phone = normalizePhone(form.phone);
      if (!phone.ok) problems.phone = phone.error;
      if (Object.keys(problems).length) {
        setFieldErrors(problems);
        return;
      }
    }
    setBusy(true);
    const result = isSignUp
      ? await accountsApi.signup({
          displayName: form.name,
          email: form.email,
          password: form.password,
          passwordConfirm: form.passwordConfirm,
          phone: form.phone,
          role,
          age: role === 'student' && age ? Number(age) : undefined,
          invites: (INVITE_FIELDS[role] || []).flatMap((field) => parseEmailList(invites[field.key]).map((email) => ({ email, relation: field.relation }))),
        })
      : await accountsApi.login({ email: form.email, password: form.password });
    setBusy(false);
    if (result.ok) {
      if (isSignUp && result.data?.confirmation) {
        setNotice({ confirmation: result.data.confirmation, queued: Number(result.data.invitesQueued || 0) });
        setView('done');
        return;
      }
      window.location.assign(next);
      return;
    }
    showFailure(result);
  }

  async function sendReset(event) {
    event?.preventDefault();
    if (busy) return;
    setError('');
    setNotice(null);
    setBusy(true);
    const result = await accountsApi.requestPasswordReset(form.email);
    setBusy(false);
    if (result.ok) {
      setNotice({ sent: true, message: result.data?.message, devPreview: result.data?.devPreview });
      return;
    }
    if (result.setupNeeded) setSetupMigration(result.migration || ACCOUNTS_MIGRATION);
    setError(result.data?.mailSetupNeeded ? 'Email is not set up yet, so reset emails cannot be sent. Ask the person who runs this Luna to configure email.' : result.error);
  }

  async function resendConfirmation() {
    if (busy) return;
    setBusy(true);
    const result = await accountsApi.resendVerification();
    setBusy(false);
    setNotice((current) => ({ ...current, confirmation: result.ok ? (result.data?.confirmation || { delivered: true }) : { delivered: false, mailFailed: true }, resent: result.ok, resendError: result.ok ? '' : result.error }));
  }

  const goTo = (name) => { setError(''); setFieldErrors({}); setNotice(null); setView(name); };
  const errorProps = (id, text) => (text ? { 'aria-invalid': true, 'aria-describedby': id } : {});

  const heading = view === 'forgot' ? 'Reset your password' : view === 'done' ? 'Check your email' : isSignUp ? (step === 1 ? 'Choose your profile' : 'Create your account') : 'Welcome back';
  const confirmation = notice?.confirmation;
  const infoBox = { fontSize: 13.5, color: T.ink, lineHeight: 1.55, background: T.bg, borderRadius: 12, padding: '12px 14px' };
  const linkButton = { background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, overflowY: 'auto' }}
      onClick={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div role="dialog" aria-modal="true" aria-label={heading} style={{ background: T.paper, borderRadius: 22, padding: 'clamp(22px, 6vw, 40px)', width: '100%', maxWidth: 440, boxShadow: '0 24px 72px rgba(0,0,0,0.2)', position: 'relative', margin: 'auto', boxSizing: 'border-box' }}>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, background: T.bg, border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: T.sub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ margin: '0 auto 12px', display: 'flex', justifyContent: 'center' }}><LunaLogo size={44} mark tile /></div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: T.ink, margin: 0 }}>{heading}</h2>
          {view === 'form' && isSignUp && step === 1 && <p style={{ fontSize: 13, color: T.sub, margin: '6px 0 0' }}>Pick the profile that fits you best</p>}
        </div>

        {setupMigration ? (
          <div role="alert" style={{ fontSize: 12.5, color: T.ink, background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.35)', borderRadius: 12, padding: '10px 12px', lineHeight: 1.5, marginBottom: 14, overflowWrap: 'anywhere' }}>
            <strong>Accounts need one database step.</strong> Apply <code>{setupMigration}</code> in Supabase, then try again. The demo (<a href="/app" style={{ color: T.accent }}>/app</a>) works without it.
          </div>
        ) : null}

        {view === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {confirmation?.mailSetupNeeded ? (
              <div role="status" style={infoBox}>
                Your account is ready. <strong>Email is not set up yet</strong> on this Luna, so we could not send the confirmation link. You can use your workspace now; connecting with other people needs a confirmed email.
              </div>
            ) : confirmation?.delivered ? (
              <div role="status" style={infoBox}>
                We sent a confirmation link to <strong style={{ overflowWrap: 'anywhere' }}>{form.email}</strong>. It works once and expires in 48 hours. Until you confirm, you can use your own workspace but not connect, share or assign.
              </div>
            ) : (
              <div role="status" style={infoBox}>
                Your account is ready, but the confirmation email could not be sent. Use “Send it again” in a moment.
              </div>
            )}
            {confirmation?.devPreview?.links?.length ? (
              <div style={{ fontSize: 12, color: T.sub, overflowWrap: 'anywhere' }}>Development only, the link is also in the server console: <a href={confirmation.devPreview.links[0]} style={{ color: T.accent }}>confirm email</a></div>
            ) : null}
            {notice?.queued ? <div style={{ fontSize: 12.5, color: T.sub }}>The {notice.queued} connection request{notice.queued === 1 ? '' : 's'} you added will be sent once your email is confirmed.</div> : null}
            {notice?.resent ? <div role="status" style={{ fontSize: 12.5, color: T.sub }}>Sent again.</div> : null}
            {notice?.resendError ? <div role="alert" style={{ fontSize: 13, color: T.red }}>{notice.resendError}</div> : null}
            <button type="button" onClick={() => window.location.assign(next)} style={primaryButton(false)}>Go to Luna</button>
            <button type="button" onClick={resendConfirmation} disabled={busy} style={{ ...linkButton, cursor: busy ? 'default' : 'pointer' }}>Send it again</button>
          </div>
        )}

        {view === 'forgot' && (
          <form onSubmit={sendReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
            {notice?.sent ? (
              <>
                <div role="status" style={infoBox}>{notice.message || 'If that email has an account, we sent a link to reset the password.'}</div>
                {notice.devPreview?.links?.length ? <div style={{ fontSize: 12, color: T.sub, overflowWrap: 'anywhere' }}>Development only, the link is also in the server console: <a href={notice.devPreview.links[0]} style={{ color: T.accent }}>reset password</a></div> : null}
              </>
            ) : (
              <>
                <p style={{ fontSize: 13.5, color: T.sub, margin: 0, lineHeight: 1.5 }}>Enter your email and we will send you a link to choose a new password.</p>
                <div>
                  <label htmlFor="luna-reset-email" style={labelStyle}>Email</label>
                  <input id="luna-reset-email" type="email" autoComplete="email" value={form.email} onChange={setField('email')} placeholder="you@example.com" style={inputStyle} />
                </div>
                {error ? <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div> : null}
                <button type="submit" disabled={busy} style={primaryButton(busy)}>{busy ? 'One moment…' : 'Send reset link'}</button>
              </>
            )}
            <button type="button" onClick={() => goTo('form')} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', fontSize: 13 }}>← Back to log in</button>
          </form>
        )}

        {view === 'form' && isSignUp && step === 1 && (
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

        {view === 'form' && (!isSignUp || step === 2) && (
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
            {isSignUp && (
              <div>
                <label htmlFor="luna-phone" style={labelStyle}>Phone number</label>
                <input id="luna-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={setField('phone')} placeholder="+1 415 555 2671" style={{ ...inputStyle, borderColor: fieldErrors.phone ? T.red : T.line }} {...errorProps('luna-phone-msg', fieldErrors.phone)} />
                <div id="luna-phone-msg" role={fieldErrors.phone ? 'alert' : undefined} style={{ fontSize: 11.5, marginTop: 4, color: fieldErrors.phone ? T.red : T.sub, lineHeight: 1.45 }}>
                  {fieldErrors.phone || `${PHONE_HELP} One phone per account. We do not verify it by SMS yet (not verified yet).`}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="luna-password" style={labelStyle}>Password</label>
              <input id="luna-password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={form.password} onChange={setField('password')} placeholder={isSignUp ? 'At least 8 characters' : '••••••••'} style={inputStyle} {...errorProps('luna-password-msg', fieldErrors.password)} />
              {fieldErrors.password ? <div id="luna-password-msg" role="alert" style={{ fontSize: 12, color: T.red, marginTop: 4 }}>{fieldErrors.password}</div> : null}
            </div>
            {isSignUp && (
              <div>
                <label htmlFor="luna-password-confirm" style={labelStyle}>Repeat password</label>
                <input id="luna-password-confirm" type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={setField('passwordConfirm')} placeholder="Type it again" style={{ ...inputStyle, borderColor: passwordConfirmError ? T.red : T.line }} {...errorProps('luna-password-confirm-msg', passwordConfirmError)} />
                {passwordConfirmError ? <div id="luna-password-confirm-msg" role="alert" style={{ fontSize: 12, color: T.red, marginTop: 4 }}>{passwordConfirmError}</div> : null}
              </div>
            )}
            {!isSignUp && (
              <div style={{ textAlign: 'right', marginTop: -6 }}>
                <button type="button" onClick={() => goTo('forgot')} style={linkButton}>Forgot password?</button>
              </div>
            )}

            {isSignUp && (INVITE_FIELDS[role] || []).map((field) => (
              <div key={field.key}>
                <label htmlFor={`luna-invite-${field.key}`} style={labelStyle}>{field.label} <span style={{ color: T.sub, fontWeight: 400 }}>(optional)</span></label>
                <textarea id={`luna-invite-${field.key}`} rows={2} value={invites[field.key] || ''} onChange={(event) => setInvites((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="name@example.com, another@example.com" style={{ ...inputStyle, resize: 'vertical' }} />
                <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>{field.hint}</div>
              </div>
            ))}
            {isSignUp && (INVITE_FIELDS[role] || []).length > 0 && (
              <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, background: T.bg, borderRadius: 10, padding: '10px 12px' }}>
                We send each of them a connection request once you have confirmed your email. A connection only becomes active when <strong>both</strong> accounts agree. If someone has no LUNA account yet, the request waits and appears for them as soon as they sign up with that email.
              </div>
            )}

            {error ? <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div> : null}

            {isSignUp && (
              <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
                We will email you a link to confirm your address. By creating an account you agree to the Terms of Service and Privacy Policy.
              </div>
            )}
            <button type="submit" disabled={busy || mismatch} style={primaryButton(busy || mismatch)}>
              {busy ? 'One moment…' : isSignUp ? 'Create account' : 'Log in'}
            </button>
            {isSignUp && (
              <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', fontSize: 13 }}>← Change profile</button>
            )}
            <div style={{ textAlign: 'center', fontSize: 13, color: T.sub }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button type="button" onClick={() => { setError(''); setFieldErrors({}); setStep(1); onToggle?.(); }} style={{ ...linkButton, fontSize: 13 }}>
                {isSignUp ? 'Log in' : 'Sign up'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
