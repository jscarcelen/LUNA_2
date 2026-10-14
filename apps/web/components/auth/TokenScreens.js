'use client';
import { useState } from 'react';
import { LunaLogo } from '../brand/LunaLogo';
import { accountsApi } from '../../modules/accounts/api';

// The same crisp, light look as the log in modal.
const T = { accent: '#0071e3', ink: '#1d1d1f', sub: '#6e6e73', line: '#e5e5ea', bg: '#f5f5f7', paper: '#ffffff', red: '#d70015', green: '#1a7f37' };
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: T.ink, background: '#fff' };
const labelStyle = { fontSize: 13, color: T.ink, fontWeight: 500, display: 'block', marginBottom: 6 };
const buttonStyle = (disabled) => ({ padding: '12px', borderRadius: 980, border: 'none', background: T.accent, color: '#fff', fontSize: 15, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, textAlign: 'center', textDecoration: 'none', display: 'block' });
const infoBox = { fontSize: 13.5, color: T.ink, lineHeight: 1.55, background: T.bg, borderRadius: 12, padding: '12px 14px' };

/** The shared frame of /verify-email and /reset-password (same card as /login). */
function Frame({ title, children }) {
  return (
    <main style={{ minHeight: '100vh', background: T.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, boxSizing: 'border-box' }}>
      <a href="/" style={{ position: 'fixed', top: 18, left: 22, fontSize: 14, fontWeight: 600, color: T.accent, textDecoration: 'none' }}>← LUNA</a>
      <div style={{ background: T.paper, borderRadius: 22, padding: 'clamp(22px, 6vw, 40px)', width: '100%', maxWidth: 440, boxShadow: '0 24px 72px rgba(0,0,0,0.12)', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ margin: '0 auto 12px', display: 'flex', justifyContent: 'center' }}><LunaLogo size={44} mark tile /></div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.ink, margin: 0 }}>{title}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}

const SetupBox = ({ migration }) => (
  <div role="alert" style={{ ...infoBox, background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.35)', overflowWrap: 'anywhere' }}>
    <strong>Accounts need one database step.</strong> Apply <code>{migration}</code> in Supabase, then reload this page.
  </div>
);

/**
 * /verify-email?token=… — the link in the confirmation email. The token is only used up when the person
 * presses the button, so a mail scanner that merely opens the link cannot burn it.
 * `state`: "ready" (token looks valid) | "invalid" | "setup".
 */
export function VerifyEmailScreen({ token, state, migration }) {
  const [phase, setPhase] = useState('idle'); // idle | busy | done | failed
  const [error, setError] = useState('');

  async function confirm() {
    setPhase('busy');
    const result = await accountsApi.verifyEmail(token);
    if (result.ok) {
      setPhase('done');
      return;
    }
    setError(result.error);
    setPhase('failed');
  }

  if (state === 'setup') return <Frame title="Confirm your email"><SetupBox migration={migration} /></Frame>;
  if (state === 'invalid' || phase === 'failed') {
    return (
      <Frame title="This link does not work">
        <div role="alert" style={infoBox}>{error || 'This link is invalid, has expired, or was already used.'} Log in and use “Resend email” in the banner at the top to get a new one.</div>
        <a href="/login" style={{ ...buttonStyle(false), marginTop: 16 }}>Log in</a>
      </Frame>
    );
  }
  if (phase === 'done') {
    return (
      <Frame title="Email confirmed">
        <div role="status" style={infoBox}>Thank you, your email is confirmed. You can now connect with teachers, parents and students, and share or assign work.</div>
        <a href="/platform" style={{ ...buttonStyle(false), marginTop: 16 }}>Open Luna</a>
      </Frame>
    );
  }
  return (
    <Frame title="Confirm your email">
      <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.55, margin: '0 0 16px', textAlign: 'center' }}>Press the button to confirm that this email address is yours.</p>
      <button type="button" onClick={confirm} disabled={phase === 'busy'} style={{ ...buttonStyle(phase === 'busy'), width: '100%' }}>{phase === 'busy' ? 'One moment…' : 'Confirm my email'}</button>
    </Frame>
  );
}

/** /reset-password?token=… — choose a new password (typed twice). On success this browser is logged in. */
export function ResetPasswordScreen({ token, state, migration }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(state === 'invalid');
  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const result = await accountsApi.confirmPasswordReset({ token, password, passwordConfirm: confirm });
    setBusy(false);
    if (result.ok) {
      window.location.assign('/platform');
      return;
    }
    if (result.data?.invalidLink) setInvalid(true);
    setError(result.error);
  }

  if (state === 'setup') return <Frame title="Choose a new password"><SetupBox migration={migration} /></Frame>;
  if (invalid) {
    return (
      <Frame title="This link does not work">
        <div role="alert" style={infoBox}>{error || 'This link is invalid, has expired (they last one hour), or was already used.'} Ask for a new one with “Forgot password?” on the log in page.</div>
        <a href="/login" style={{ ...buttonStyle(false), marginTop: 16 }}>Go to log in</a>
      </Frame>
    );
  }
  return (
    <Frame title="Choose a new password">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <div>
          <label htmlFor="luna-new-password" style={labelStyle}>New password</label>
          <input id="luna-new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="luna-new-password-confirm" style={labelStyle}>Repeat new password</label>
          <input id="luna-new-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type it again" aria-invalid={mismatch || undefined} aria-describedby={mismatch ? 'luna-reset-mismatch' : undefined} style={{ ...inputStyle, borderColor: mismatch ? T.red : T.line }} />
          {mismatch ? <div id="luna-reset-mismatch" role="alert" style={{ fontSize: 12, color: T.red, marginTop: 4 }}>The two passwords do not match.</div> : null}
        </div>
        {error && !mismatch ? <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div> : null}
        <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>Changing the password signs you out everywhere else.</div>
        <button type="submit" disabled={busy || mismatch} style={buttonStyle(busy || mismatch)}>{busy ? 'One moment…' : 'Save new password'}</button>
      </form>
    </Frame>
  );
}

/**
 * /guardian?token=… — the link in the email to a parent/guardian of a child under 14. Shows what LUNA collects and
 * lets them consent (creating the child's account and their own parent account) or refuse. Looking at the page does
 * not use the link up. `state`: "ready" | "invalid" | "setup".
 */
export function GuardianConsentScreen({ token, studentName = '', state, migration }) {
  const [form, setForm] = useState({ guardianName: '', guardianPassword: '', guardianPasswordConfirm: '', studentEmail: '', studentPassword: '', accept: false });
  const [phase, setPhase] = useState('idle'); // idle | busy | done | refused | failed
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  async function consent(event) {
    event.preventDefault();
    if (phase === 'busy') return;
    setError('');
    setPhase('busy');
    const response = await accountsApi.guardianConsent({ token, action: 'consent', ...form });
    if (response.ok) { setResult(response.data); setPhase('done'); return; }
    setError(response.error);
    setPhase(response.status === 410 || response.status === 404 ? 'failed' : 'idle');
  }

  async function refuse() {
    setPhase('busy');
    await accountsApi.guardianConsent({ token, action: 'refuse' });
    setPhase('refused');
  }

  if (state === 'setup') return <Frame title="Parent or guardian consent"><SetupBox migration={migration} /></Frame>;
  if (state === 'invalid' || phase === 'failed') {
    return (
      <Frame title="This link does not work">
        <div role="alert" style={infoBox}>{error || 'This link has expired (they last 48 hours), was already used, or is not valid. Ask your child to start again from the sign-up page.'}</div>
      </Frame>
    );
  }
  if (phase === 'refused') {
    return (
      <Frame title="Done: no account created">
        <div role="status" style={infoBox}>Thank you. Nothing was created, and what we held about the request has been deleted.</div>
      </Frame>
    );
  }
  if (phase === 'done') {
    return (
      <Frame title="Consent given">
        <div role="status" style={infoBox}>
          {studentName ? <><strong>{studentName}</strong>’s account is ready</> : 'The account is ready'}. They log in with <strong style={{ overflowWrap: 'anywhere' }}>{result?.studentEmail}</strong> and the password you chose.
          {result?.createdGuardian ? <> Your own parent account is <strong style={{ overflowWrap: 'anywhere' }}>{result?.guardianEmail}</strong>, with the password you just set.</> : <> Log in with your existing parent account to see their progress.</>}
          {' '}From “My students” you can see, export or delete their data at any time.
        </div>
        <a href="/login" style={{ ...buttonStyle(false), marginTop: 16 }}>Log in</a>
      </Frame>
    );
  }
  return (
    <Frame title="Parent or guardian consent">
      <form onSubmit={consent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <div style={infoBox}>
          <strong>{studentName || 'Your child'}</strong> asked to use LUNA, a study platform that uses AI to make quizzes and study plans from school material. Under 14, we need your consent.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>We keep their name, the material they upload, their answers and results, to run the platform.</li>
            <li>The text they write and the material they upload is processed by AI providers to generate content. It is not used for advertising, and we ask providers not to train on it.</li>
            <li>AI scores and “diagnoses” are guidance for study, never a final grade or decision.</li>
            <li>You get a parent account to see their progress, and you can export or delete all their data whenever you want.</li>
          </ul>
          <div style={{ marginTop: 8 }}>Read the <a href="/privacy" target="_blank" rel="noopener" style={{ color: T.accent }}>Privacy Policy</a>, the <a href="/terms" target="_blank" rel="noopener" style={{ color: T.accent }}>Terms</a> and the <a href="/ai" target="_blank" rel="noopener" style={{ color: T.accent }}>AI notice</a>.</div>
        </div>
        <div>
          <label htmlFor="g-sname" style={labelStyle}>Email your child will log in with</label>
          <input id="g-sname" type="email" value={form.studentEmail} onChange={set('studentEmail')} placeholder="child@example.com" style={inputStyle} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="g-spass" style={labelStyle}>Password for your child’s account</label>
          <input id="g-spass" type="password" value={form.studentPassword} onChange={set('studentPassword')} style={inputStyle} autoComplete="new-password" />
        </div>
        <div>
          <label htmlFor="g-name" style={labelStyle}>Your name</label>
          <input id="g-name" value={form.guardianName} onChange={set('guardianName')} style={inputStyle} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="g-pass" style={labelStyle}>Password for your parent account <span style={{ color: T.sub, fontWeight: 400 }}>(not needed if you already have one)</span></label>
          <input id="g-pass" type="password" value={form.guardianPassword} onChange={(event) => setForm((current) => ({ ...current, guardianPassword: event.target.value, guardianPasswordConfirm: event.target.value }))} style={inputStyle} autoComplete="new-password" />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: T.ink, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.accept} onChange={set('accept')} style={{ marginTop: 3 }} />
          <span>I am the parent or legal guardian of {studentName || 'this child'} and I consent to the processing described above.</span>
        </label>
        {error ? <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div> : null}
        <button type="submit" disabled={phase === 'busy'} style={buttonStyle(phase === 'busy')}>{phase === 'busy' ? 'One moment…' : 'I consent: create the account'}</button>
        <button type="button" onClick={refuse} disabled={phase === 'busy'} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', fontSize: 13 }}>No, I do not consent</button>
      </form>
    </Frame>
  );
}
