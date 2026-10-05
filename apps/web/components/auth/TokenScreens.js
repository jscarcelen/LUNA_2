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
