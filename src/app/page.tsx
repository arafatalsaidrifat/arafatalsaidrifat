import { headers } from 'next/headers';
import { auth, authIsConfigured, publicSignupIsEnabled } from '@/lib/auth';
import AuthScreen from '@/components/auth-screen';
import DashboardClient from '@/components/dashboard-client';

export const dynamic = 'force-dynamic';

function SetupPage() {
  return (
    <main className="setup-page">
      <section className="setup-card">
        <div className="brand" style={{ padding: '0 0 20px', borderBottom: 0 }}>
          <div className="brand-mark">FC</div>
          <div>
            <div className="brand-title" style={{ color: 'var(--ink)' }}>F-Commerce OS</div>
            <div className="brand-sub" style={{ color: 'var(--muted)' }}>Commerce operations platform</div>
          </div>
        </div>
        <div className="eyebrow">SERVER CONFIGURATION REQUIRED</div>
        <h1>Configure the server services to activate sign-in.</h1>
        <p>The authenticated application is included, but this server is not configured with its database and identity secrets. Authentication and protected routes remain unavailable until they are supplied.</p>
        <div className="setup-list">
          <div>
            <b>01</b>
            <span><strong>Provision PostgreSQL</strong><br />Set <code>DATABASE_URL</code>, then apply reviewed migrations with <code>npm run db:migrate:deploy</code>.</span>
          </div>
          <div>
            <b>02</b>
            <span><strong>Set authentication secrets</strong><br />Configure <code>BETTER_AUTH_SECRET</code> (32+ characters), <code>BETTER_AUTH_URL</code>, <code>APP_URL</code>, trusted origins, and <code>TOKEN_ENCRYPTION_KEY</code>.</span>
          </div>
          <div>
            <b>03</b>
            <span><strong>Configure account email</strong><br />Set <code>RESEND_API_KEY</code> and <code>AUTH_EMAIL_FROM</code> to an address on your verified sending domain before enabling registration or account recovery.</span>
          </div>
          <div>
            <b>04</b>
            <span><strong>Authorize integrations separately</strong><br />Use server-side provider credentials and the account owner&apos;s approved authorization flow. Never place provider secrets in frontend code.</span>
          </div>
        </div>
        <div className="notice" style={{ marginTop: 16 }}>Keep public registration and external provider actions disabled until security, data-retention, and provider-approval gates are complete.</div>
        <div className="footer-note">A deployment or configured credential does not prove a provider is connected. Verify provider responses and live-account permissions before processing real orders.</div>
      </section>
    </main>
  );
}

export default async function Home() {
  if (!authIsConfigured()) return <SetupPage />;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return <AuthScreen signupEnabled={publicSignupIsEnabled()} />;
  return <DashboardClient user={{ id: session.user.id, name: session.user.name, email: session.user.email }} />;
}
