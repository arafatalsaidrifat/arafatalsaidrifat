'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError(result.error.message || 'Unable to request a password reset.');
        return;
      }
      setNotice('If an account exists for that address, password reset instructions will be sent.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request a password reset.');
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message || 'Unable to reset the password.');
        return;
      }
      setPasswordChanged(true);
      setPassword('');
      setNotice('Password updated. You can now sign in with your new password.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset the password.');
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
            <div className="brand-sub" style={{ color: 'var(--muted)' }}>Account recovery</div>
          </div>
        </div>
        <div className="eyebrow" style={{ marginTop: 12 }}>SECURE ACCOUNT RECOVERY</div>
        <h1>{token && !passwordChanged ? 'Choose a new password' : 'Reset your password'}</h1>
        <p>{token && !passwordChanged ? 'Choose a new password for your account. Reset links expire after one hour.' : 'Enter your account email. If an account exists, we will send a time-limited reset link.'}</p>
        {error && <div className="message" role="alert">{error}</div>}
        {notice && <div className="notice green" role="status">{notice}</div>}
        {token && !passwordChanged ? (
          <form onSubmit={updatePassword} className="stack" style={{ marginTop: 20 }}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input id="password" className="control" required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
            </div>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Update password'}</button>
          </form>
        ) : (
          <form onSubmit={requestReset} className="stack" style={{ marginTop: 20 }}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input id="email" className="control" required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />
            </div>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Send reset link'}</button>
          </form>
        )}
        <div className="footer-note"><Link href="/">Return to sign in</Link></div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page"><section className="auth-card"><h1>Loading account recovery…</h1></section></main>}><ResetPasswordForm /></Suspense>;
}
