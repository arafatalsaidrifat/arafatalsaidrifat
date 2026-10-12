import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  verifyMetaSignature,
  stableWebhookKey,
  validateWebhookVerifyToken,
  validateBengaliPhone,
} from '../src/lib/core/security.mjs';

test('Meta signature verification is HMAC-SHA256 over the exact raw body', () => {
  const body = Buffer.from('{"object":"page","entry":[]}');
  const secret = 'test-app-secret';
  const signature = `sha256=${createHmac('sha256',secret).update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body,signature,secret),true);
  assert.equal(verifyMetaSignature(body,signature,'wrong-secret'),false);
  assert.equal(verifyMetaSignature(Buffer.from(body.toString()+' '),signature,secret),false);
  assert.equal(verifyMetaSignature(body,'sha1=abc',secret),false);
  assert.equal(verifyMetaSignature(body,null,secret),false);
  assert.equal(verifyMetaSignature(body,signature,''),false);
});

test('webhook verification tokens compare exact values and fail closed', () => {
  assert.equal(validateWebhookVerifyToken('expected-token','expected-token'),true);
  assert.equal(validateWebhookVerifyToken('expected-token','other-token'),false);
  assert.equal(validateWebhookVerifyToken('short','longer'),false);
  assert.equal(validateWebhookVerifyToken(null,'expected-token'),false);
  assert.equal(validateWebhookVerifyToken('expected-token',null),false);
});

test('local PostgreSQL and Redis require credentials and bind only to loopback', () => {
  const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?/);
  assert.match(compose, /127\.0\.0\.1:5432:5432/);
  assert.match(compose, /REDIS_PASSWORD:\?/);
  assert.match(compose, /127\.0\.0\.1:6379:6379/);
  assert.doesNotMatch(compose, /POSTGRES_PASSWORD:\s*fcommerce/);
  assert.match(compose, /--requirepass/);
});

test('production content security policy permits only the fonts required by the app', () => {
  const styles = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
  assert.match(styles, /fonts\.googleapis\.com/);
  assert.match(config, /style-src[^`]*https:\/\/fonts\.googleapis\.com/);
  assert.match(config, /font-src[^`]*https:\/\/fonts\.gstatic\.com/);
});

test('stable webhook keys are deterministic and change with external message IDs', () => {
  const body = Buffer.from('raw webhook');
  assert.equal(stableWebhookKey('page','mid.123',body),stableWebhookKey('page','mid.123',body));
  assert.notEqual(stableWebhookKey('page','mid.123',body),stableWebhookKey('page','mid.124',body));
  assert.notEqual(stableWebhookKey('page','mid.123',body),stableWebhookKey('instagram','mid.123',body));
  assert.match(stableWebhookKey('page','',body),/^page:[a-f0-9]{64}$/);
});

test('Bangladesh phone validator accepts local and +88 format, rejects invalid ranges', () => {
  assert.equal(validateBengaliPhone('01712345678'),true);
  assert.equal(validateBengaliPhone('+8801712345678'),true);
  assert.equal(validateBengaliPhone('8801712345678'),true);
  assert.equal(validateBengaliPhone('01112345678'),false);
  assert.equal(validateBengaliPhone('0171234567'),false);
  assert.equal(validateBengaliPhone('abc'),false);
});

test('account registration requires email delivery and email verification', () => {
  const auth = readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
  const email = readFileSync(new URL('../src/lib/account-email.ts', import.meta.url), 'utf8');
  assert.match(auth, /requireEmailVerification:\s*true/);
  assert.match(auth, /disableSignUp:\s*!publicSignupIsEnabled\(\)/);
  assert.match(auth, /revokeSessionsOnPasswordReset:\s*true/);
  assert.match(auth, /sendVerificationEmail:/);
  assert.match(auth, /sendResetPassword:/);
  assert.match(email, /https:\/\/api\.resend\.com\/emails/);
  assert.match(email, /actionUrl\.origin !== appOrigin/);
  assert.match(email, /AbortSignal\.timeout\(10_000\)/);
  assert.match(email, /example\\\.com\|placeholder\|your-domain/);
});

test('only server-backed application entry points and real workspace creation are shipped', () => {
  const root = new URL('../', import.meta.url);
  assert.equal(existsSync(new URL('index.html', root)), false);
  assert.equal(existsSync(new URL('prisma/seed.ts', root)), false);
  assert.deepEqual(readdirSync(new URL('public/', root)), ['.gitkeep']);
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['db:seed'], undefined);
  const page = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const workspaceRoute = readFileSync(new URL('../src/app/api/merchants/route.ts', import.meta.url), 'utf8');
  assert.match(page, /auth\.api\.getSession/);
  assert.match(workspaceRoute, /tx\.merchant\.create/);
});
