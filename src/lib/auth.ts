import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/prisma';

export function authIsConfigured(){const secret=process.env.BETTER_AUTH_SECRET??'';return Boolean(secret.length>=32&&!/^(replace|change|example|placeholder|auth_not_configured)/i.test(secret)&&process.env.DATABASE_URL&&process.env.BETTER_AUTH_URL);}
// Auth handlers are hard-blocked by their routes until the required production secrets exist.
// The fallback below is only an inert construction placeholder; never serve auth APIs with it.
export const auth = betterAuth({
  appName: 'F-Commerce OS',
  baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || 'AUTH_NOT_CONFIGURED_AND_ROUTES_MUST_REJECT_THIS_PLACEHOLDER',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, requireEmailVerification: false, minPasswordLength: 12, maxPasswordLength: 128, disableSignUp: process.env.ALLOW_PUBLIC_SIGNUP !== 'true' },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 12, cookieCache: { enabled: true, maxAge: 60 * 5 } },
  advanced: { useSecureCookies: process.env.NODE_ENV === 'production', defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' } },
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS || process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:3000').split(',').map(s=>s.trim()).filter(Boolean),
});
