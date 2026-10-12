'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export default function AuthScreen({ signupEnabled }: { signupEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = mode === 'signup'
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message || 'Authentication failed.');
        return;
      }

      if (mode === 'signup') {
        setMode('signin');
        setPassword('');
        setNotice('Account created. Check your email to verify your address before signing in.');
        return;
      }

      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to authenticate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand" style={{ padding: '0 0 22px', borderBottom: 0 }}>
          <div className="brand-mark">FC</div>
          <div>
            <div className="brand-title" style={{ color: 'var(--ink)' }}>F-Commerce OS</div>
            <div className="brand-sub" style={{ color: 'var(--muted)' }}>Merchant operations platform</div>
          </div>
        </div>
        <div className="eyebrow" style={{ marginTop: 12 }}>SECURE WORKSPACE ACCESS</div>
        <h1>{mode === 'signin' ? 'Welcome back' : 'Create your workspace account'}</h1>
        <p>Manage conversations, orders, inventory, payments and shipping from one workspace. Provider features remain disabled until configured.</p>
        {error && <div className="message" role="alert">{error}</div>}
        {notice && <div className="notice green" role="status">{notice}</div>}
        <form onSubmit={submit} className="stack" style={{ marginTop: 20 }}>
          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" className="control" required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" className="control" required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password <span className="subtle">(at least 12 characters)</span></label>
            <input id="password" className="control" required minLength={12} maxLength={128} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} />
          </div>
          <button className="btn primary" type="submit" disabled={busy || (mode === 'signup' && !signupEnabled)}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        {mode === 'signin' && (
          <button className="btn small ghost" style={{ marginTop: 14 }} onClick={() => router.push('/reset-password')}>
            Forgot password?
          </button>
        )}
        {signupEnabled ? (
          <p style={{ marginTop: 16 }}>
            {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
            <button className="btn small ghost" onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setNotice('');
            }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        ) : (
          <div className="notice" style={{ marginTop: 16 }}>
            Self-service registration requires server approval, verified email delivery, and abuse protections. Contact your workspace owner for access.
          </div>
        )}
        <div className="footer-note">Session cookies are HTTP-only and secure in production. Workspace membership is verified by the server for every operation.</div>
      </section>
    </main>
  );
}
