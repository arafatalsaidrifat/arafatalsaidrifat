import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/prisma';
import { accountEmailIsConfigured, sendAccountEmail } from '@/lib/account-email';

export function authIsConfigured(){const secret=process.env.BETTER_AUTH_SECRET??'';return Boolean(secret.length>=32&&!/^(replace|change|example|placeholder|auth_not_configured)/i.test(secret)&&process.env.DATABASE_URL&&process.env.BETTER_AUTH_URL);}
export function publicSignupIsEnabled(){return process.env.ALLOW_PUBLIC_SIGNUP==='true'&&accountEmailIsConfigured();}
// Auth handlers are hard-blocked by their routes until the required production secrets exist.
// The fallback below is only an inert construction placeholder; never serve auth APIs with it.
export const auth = betterAuth({
  appName: 'F-Commerce OS',
  baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || 'AUTH_NOT_CONFIGURED_AND_ROUTES_MUST_REJECT_THIS_PLACEHOLDER',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    disableSignUp: !publicSignupIsEnabled(),
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => sendAccountEmail({
      to: user.email,
      subject: 'Reset your F-Commerce OS password',
      action: 'Reset your password',
      url,
    }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    expiresIn: 60 * 60,
    autoSignInAfterVerification: false,
    sendVerificationEmail: ({ user, url }) => sendAccountEmail({
      to: user.email,
      subject: 'Verify your F-Commerce OS email address',
      action: 'Verify your email address',
      url,
    }),
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 12, cookieCache: { enabled: true, maxAge: 60 * 5 } },
  advanced: { useSecureCookies: process.env.NODE_ENV === 'production', defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' } },
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS || process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:3000').split(',').map(s=>s.trim()).filter(Boolean),
});
