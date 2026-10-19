'use client';
import { useState } from 'react';
import { LunaLogo } from '../brand/LunaLogo';
import { accountsApi } from '../../modules/accounts/api';
import { LanguageSwitch } from '../../lib/i18n/LanguageSwitch.js';
import { useT } from '../../lib/i18n/LocaleProvider.js';

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
      <div style={{ position: 'fixed', top: 14, right: 16 }}><LanguageSwitch /></div>
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

/** Splits a message at its `{x}` placeholder so a styled node can sit inside translated text. */
const around = (template, node) => {
  const [before, after = ''] = String(template).split('{x}');
  return <>{before}{node}{after}</>;
};

function SetupBox({ migration }) {
  const t = useT();
  return (
    <div role="alert" style={{ ...infoBox, background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.35)', overflowWrap: 'anywhere' }}>
      <strong>{t('misc.tok.setupTitle')}</strong> {around(t('misc.tok.setupBody'), <code>{migration}</code>)}
    </div>
  );
}

/**
 * /verify-email?token=… — the link in the confirmation email. The token is only used up when the person
 * presses the button, so a mail scanner that merely opens the link cannot burn it.
 * `state`: "ready" (token looks valid) | "invalid" | "setup".
 */
export function VerifyEmailScreen({ token, state, migration }) {
  const t = useT();
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

  if (state === 'setup') return <Frame title={t("misc.tok.confirmEmail")}><SetupBox migration={migration} /></Frame>;
  if (state === 'invalid' || phase === 'failed') {
    return (
      <Frame title={t("misc.tok.badLink")}>
        <div role="alert" style={infoBox}>{error || t('misc.tok.verifyInvalid')} {t('misc.tok.verifyHint')}</div>
        <a href="/login" style={{ ...buttonStyle(false), marginTop: 16 }}>{t('misc.tok.login')}</a>
      </Frame>
    );
  }
  if (phase === 'done') {
    return (
      <Frame title={t("misc.tok.emailConfirmed")}>
        <div role="status" style={infoBox}>{t('misc.tok.confirmedBody')}</div>
        <a href="/platform" style={{ ...buttonStyle(false), marginTop: 16 }}>{t('misc.tok.openLuna')}</a>
      </Frame>
    );
  }
  return (
    <Frame title={t("misc.tok.confirmEmail")}>
      <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.55, margin: '0 0 16px', textAlign: 'center' }}>{t('misc.tok.pressButton')}</p>
      <button type="button" onClick={confirm} disabled={phase === 'busy'} style={{ ...buttonStyle(phase === 'busy'), width: '100%' }}>{phase === 'busy' ? t('misc.tok.busy') : t('misc.tok.confirmBtn')}</button>
    </Frame>
  );
}

/** /reset-password?token=… — choose a new password (typed twice). On success this browser is logged in. */
export function ResetPasswordScreen({ token, state, migration }) {
  const t = useT();
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
      setError(t('misc.tok.mismatch'));
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

  if (state === 'setup') return <Frame title={t("misc.tok.chooseNew")}><SetupBox migration={migration} /></Frame>;
  if (invalid) {
    return (
      <Frame title={t("misc.tok.badLink")}>
        <div role="alert" style={infoBox}>{error || t('misc.tok.resetInvalid')} {t('misc.tok.resetHint')}</div>
        <a href="/login" style={{ ...buttonStyle(false), marginTop: 16 }}>{t('misc.tok.goLogin')}</a>
      </Frame>
    );
  }
  return (
    <Frame title={t("misc.tok.chooseNew")}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <div>
          <label htmlFor="luna-new-password" style={labelStyle}>{t('misc.tok.newPw')}</label>
          <input id="luna-new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('misc.tok.atLeast8')} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="luna-new-password-confirm" style={labelStyle}>{t('misc.tok.repeatPw')}</label>
          <input id="luna-new-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={t('misc.tok.typeAgain')} aria-invalid={mismatch || undefined} aria-describedby={mismatch ? 'luna-reset-mismatch' : undefined} style={{ ...inputStyle, borderColor: mismatch ? T.red : T.line }} />
          {mismatch ? <div id="luna-reset-mismatch" role="alert" style={{ fontSize: 12, color: T.red, marginTop: 4 }}>{t('misc.tok.mismatch')}</div> : null}
        </div>
        {error && !mismatch ? <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div> : null}
        <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>{t('misc.tok.signsOut')}</div>
        <button type="submit" disabled={busy || mismatch} style={buttonStyle(busy || mismatch)}>{busy ? t('misc.tok.busy') : t('misc.tok.saveNew')}</button>
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
  const t = useT();
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

  if (state === 'setup') return <Frame title={t("misc.tok.consentTitle")}><SetupBox migration={migration} /></Frame>;
  if (state === 'invalid' || phase === 'failed') {
    return (
      <Frame title={t("misc.tok.badLink")}>
        <div role="alert" style={infoBox}>{error || t('misc.tok.guardianInvalid')}</div>
      </Frame>
    );
  }
  if (phase === 'refused') {
    return (
      <Frame title={t("misc.tok.refusedTitle")}>
        <div role="status" style={infoBox}>{t('misc.tok.refusedBody')}</div>
      </Frame>
    );
  }
  if (phase === 'done') {
    return (
      <Frame title={t("misc.tok.consentGiven")}>
        <div role="status" style={infoBox}>
          {studentName ? around(t('misc.tok.readyNamed'), <strong>{studentName}</strong>) : t('misc.tok.readyPlain')}{' '}
          {around(t('misc.tok.logInWith'), <strong style={{ overflowWrap: 'anywhere' }}>{result?.studentEmail}</strong>)}
          {result?.createdGuardian ? <> {around(t('misc.tok.parentAccount'), <strong style={{ overflowWrap: 'anywhere' }}>{result?.guardianEmail}</strong>)}</> : <> {t('misc.tok.existingParent')}</>}
          {' '}{t('misc.tok.myStudents')}
        </div>
        <a href="/login" style={{ ...buttonStyle(false), marginTop: 16 }}>{t('misc.tok.login')}</a>
      </Frame>
    );
  }
  return (
    <Frame title={t("misc.tok.consentTitle")}>
      <form onSubmit={consent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        <div style={infoBox}>
          <strong>{studentName || t('misc.tok.yourChild')}</strong> {t('misc.tok.asked')}
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>{t('misc.tok.li1')}</li>
            <li>{t('misc.tok.li2')}</li>
            <li>{t('misc.tok.li3')}</li>
            <li>{t('misc.tok.li4')}</li>
          </ul>
          <div style={{ marginTop: 8 }}>{t('misc.tok.readThe')} <a href="/privacy" target="_blank" rel="noopener" style={{ color: T.accent }}>{t('misc.tok.privacy')}</a>{t('misc.tok.sepThe')} <a href="/terms" target="_blank" rel="noopener" style={{ color: T.accent }}>{t('misc.tok.terms')}</a> {t('misc.tok.andThe')} <a href="/ai" target="_blank" rel="noopener" style={{ color: T.accent }}>{t('misc.tok.aiNotice')}</a>.</div>
        </div>
        <div>
          <label htmlFor="g-sname" style={labelStyle}>{t('misc.tok.childEmail')}</label>
          <input id="g-sname" type="email" value={form.studentEmail} onChange={set('studentEmail')} placeholder="child@example.com" style={inputStyle} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="g-spass" style={labelStyle}>{t('misc.tok.childPw')}</label>
          <input id="g-spass" type="password" value={form.studentPassword} onChange={set('studentPassword')} style={inputStyle} autoComplete="new-password" />
        </div>
        <div>
          <label htmlFor="g-name" style={labelStyle}>{t('misc.tok.yourName')}</label>
          <input id="g-name" value={form.guardianName} onChange={set('guardianName')} style={inputStyle} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="g-pass" style={labelStyle}>{t('misc.tok.parentPw')} <span style={{ color: T.sub, fontWeight: 400 }}>{t('misc.tok.parentPwNote')}</span></label>
          <input id="g-pass" type="password" value={form.guardianPassword} onChange={(event) => setForm((current) => ({ ...current, guardianPassword: event.target.value, guardianPasswordConfirm: event.target.value }))} style={inputStyle} autoComplete="new-password" />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: T.ink, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.accept} onChange={set('accept')} style={{ marginTop: 3 }} />
          <span>{t('misc.tok.iConsentPre', { name: studentName || t('misc.tok.thisChild') })}</span>
        </label>
        {error ? <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div> : null}
        <button type="submit" disabled={phase === 'busy'} style={buttonStyle(phase === 'busy')}>{phase === 'busy' ? t('misc.tok.busy') : t('misc.tok.consentBtn')}</button>
        <button type="button" onClick={refuse} disabled={phase === 'busy'} style={{ background: 'none', border: 'none', color: T.sub, cursor: 'pointer', fontSize: 13 }}>{t('misc.tok.noConsent')}</button>
      </form>
    </Frame>
  );
}
