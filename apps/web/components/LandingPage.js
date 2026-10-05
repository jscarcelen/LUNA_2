'use client';
import { useEffect, useState } from 'react';
// Log in / Sign up: the real accounts dialog (see components/auth/AuthModal.js). This page only decides when to open it.
import { AuthModal } from './auth/AuthModal';
import { LunaLogo } from './brand/LunaLogo.js';
import { LandingNav, TABS } from './landing/LandingNav.js';
import { HomeTab } from './landing/HomeTab.js';
import { DemoTab } from './landing/DemoTab.js';
import { PricingTab, TrainingTab } from './landing/SoonTabs.js';
import './landing/landing.css';

/**
 * The public page: Home / Demo / Pricing (soon) / Training (soon). The tab is kept in the URL hash
 * (#demo) so a section can be shared. All pictures are real screenshots of the app
 * (apps/web/public/landing, refreshed with scripts/landing-capture).
 */
export function LandingPage() {
  const [tab, setTabState] = useState('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  // `lp-js` turns on the scroll-reveal hidden state; without JavaScript everything simply shows.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace('#', '');
      if (TABS.some((t) => t.id === id)) setTabState(id);
    };
    fromHash();
    setReady(true);
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const setTab = (id) => {
    setTabState(id);
    try { window.history.replaceState(null, '', id === 'home' ? window.location.pathname : `#${id}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  };
  const openSignUp = () => { setAuthMode('signup'); setAuthOpen(true); };
  const openSignIn = () => { setAuthMode('signin'); setAuthOpen(true); };

  return (
    <div className={`lp-root${ready ? ' lp-js' : ''}`}>
      <LandingNav tab={tab} setTab={setTab} onSignIn={openSignIn} onSignUp={openSignUp} />
      <main className="lp-main">
        {tab === 'home' && <HomeTab onSignUp={openSignUp} />}
        {tab === 'demo' && <DemoTab />}
        {tab === 'pricing' && <PricingTab onSignUp={openSignUp} />}
        {tab === 'training' && <TrainingTab onSignUp={openSignUp} />}
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <LunaLogo variant="mono" size={24} />
          <p>Luna is in beta. Screens shown use demo data.</p>
          <nav aria-label="Footer">
            {TABS.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)}>{t.label}</button>)}
            <a href="/app">Live demo</a>
          </nav>
        </div>
      </footer>
      {authOpen && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthOpen(false)}
          onToggle={() => setAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
        />
      )}
    </div>
  );
}
