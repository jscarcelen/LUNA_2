'use client';
import { useState } from 'react';
import { AuthModal } from './AuthModal';

/**
 * The stand-alone log in / sign up page (/login). /platform sends people here when nobody is logged
 * in; the landing page opens the same AuthModal over itself.
 */
export function LoginScreen({ initialMode = 'signin', next = '/platform' }) {
  const [mode, setMode] = useState(initialMode === 'signup' ? 'signup' : 'signin');
  return (
    <main style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <a href="/" style={{ position: 'fixed', top: 18, left: 22, zIndex: 210, fontSize: 14, fontWeight: 600, color: '#0071e3', textDecoration: 'none' }}>← LUNA</a>
      <AuthModal mode={mode} next={next} onToggle={() => setMode((current) => (current === 'signin' ? 'signup' : 'signin'))} />
    </main>
  );
}
