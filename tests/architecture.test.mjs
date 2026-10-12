import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
function filesUnder(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(full));
    else result.push(full);
  }
  return result;
}

test('all protected API handlers enforce server-side tenant membership or use the explicit public boundary', () => {
  const apiRoot = path.join(root, 'src/app/api');
  const files = filesUnder(apiRoot).filter(file => file.endsWith('.ts'));
  const publicBoundaries = [
    '/auth/[...all]/route.ts',
    '/health/route.ts',
    '/internal/worker/route.ts',
    '/webhooks/meta/route.ts',
    '/merchants/route.ts',
  ];
  const protectedFiles = files.filter(file => !publicBoundaries.some(part => file.endsWith(part)));
  const missing = protectedFiles.filter(file => !fs.readFileSync(file, 'utf8').includes('tenantContext('));
  assert.deepEqual(missing.map(file => path.relative(root, file)), []);
});

test('Prisma schema has key tenant ownership and uniqueness controls', () => {
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  for (const model of ['Merchant','MerchantMembership','Customer','Conversation','Message','Product','InventoryMovement','Order','OrderItem','Payment','Shipment','WebhookEvent','AuditLog','AiPolicy','AiFaq','AiReview','IdempotencyKey','OutboxJob']) {
    assert.match(schema, new RegExp(`model\\s+${model}\\s*\\{`), `missing model ${model}`);
  }
  assert.match(schema, /@@unique\(\[merchantId, userId\]\)/);
  assert.match(schema, /@@unique\(\[platform, externalAccountId\]\)/);
  assert.match(schema, /requestHash String\?/);
  assert.match(schema, /@@unique\(\[platform, externalAccountId\]\)/);
  assert.match(schema, /requestHash String\?/);
  assert.match(schema, /@@unique\(\[merchantId, sku\]\)/);
  assert.match(schema, /@@unique\(\[merchantId, method, reference\]\)/);
  assert.match(schema, /@@unique\(\[merchantId, key\]\)/);
  assert.match(schema, /idempotencyKey String\s+@unique/);
});

test('Meta webhook validates raw-body HMAC before parsing or scheduling payloads', () => {
  const route = fs.readFileSync(path.join(root, 'src/app/api/webhooks/meta/route.ts'), 'utf8');
  const signatureIndex = route.indexOf('isValidMetaSignature(raw');
  const parseIndex = route.indexOf('JSON.parse(raw.toString');
  const persistIndex = route.indexOf('persistMetaEvents(raw, body as Record');
  assert.ok(signatureIndex >= 0 && parseIndex > signatureIndex && persistIndex > parseIndex);
});

test('provider secrets are not configured as NEXT_PUBLIC variables', () => {
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.doesNotMatch(env, /^NEXT_PUBLIC_.*(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|API_KEY|DATABASE_URL)/im);
  const crypto = fs.readFileSync(path.join(root, 'src/lib/crypto.ts'), 'utf8');
  assert.match(crypto, /aes-256-gcm/);
});

test('ambiguous Meta delivery outcomes stop automatic retries instead of risking duplicate replies', () => {
  const meta = fs.readFileSync(path.join(root, 'src/lib/adapters/meta.ts'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'src/lib/worker.ts'), 'utf8');
  assert.match(meta, /MetaDeliveryOutcomeUnknownError/);
  assert.match(worker, /e instanceof MetaDeliveryOutcomeUnknownError/);
  assert.match(worker, /deliveryStatus: uncertain \? 'UNKNOWN'/);
  assert.match(worker, /retry: !stopRetry/);
  assert.match(worker, /message\.deliveryStatus === 'SENT'/);
  assert.match(worker, /message\.deliveryStatus === 'UNKNOWN'/);
  assert.match(worker, /deliveryStatus: 'SENDING'/);
  assert.match(worker, /stale outbound send outcome unknown; automatic retry prevented/i);
  assert.match(worker, /staleSendRecovery\(message\?\.deliveryStatus\)/);
  assert.match(worker, /Recovered a stale worker lock/);
});

test('ambiguous courier bookings require explicit manual reconciliation before rebooking', () => {
  const route = fs.readFileSync(path.join(root, 'src/app/api/shipments/[id]/sync/route.ts'), 'utf8');
  assert.match(route, /booking_outcome_unknown/);
  assert.match(route, /confirm_not_booked/);
  assert.match(route, /BOOKING_OUTCOME_UNKNOWN/);
});


test('Meta account IDs are unique across tenants and are never transferred by an upsert', () => {
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const connect = fs.readFileSync(path.join(root, 'src/app/api/integrations/[provider]/connect/route.ts'), 'utf8');
  assert.match(schema, /@@unique\(\[platform, externalAccountId\]\)/);
  assert.match(connect, /CHANNEL_OWNED_BY_ANOTHER_WORKSPACE/);
  assert.doesNotMatch(connect, /channelConnection\.upsert/);
});

test('Order idempotency keys are bound to the normalized request payload', () => {
  const route = fs.readFileSync(path.join(root, 'src/app/api/orders/route.ts'), 'utf8');
  assert.match(route, /createHash\('sha256'\)\.update\(JSON\.stringify\(p\.data\)\)/);
  assert.match(route, /existing\.requestHash !== requestHash/);
  assert.match(route, /requestHash }/);
});


test('rate limiting is shared through the database and fails closed in production', () => {
  const limiter = fs.readFileSync(path.join(root, 'src/lib/rate-limit.ts'), 'utf8');
  assert.match(limiter, /prisma\.rateLimitBucket\.upsert/);
  assert.match(limiter, /NODE_ENV === 'production'\) return \{ allowed: false.*unavailable: true/s);
  const merchantRoute = fs.readFileSync(path.join(root, 'src/app/api/merchants/route.ts'), 'utf8');
  const connectRoute = fs.readFileSync(path.join(root, 'src/app/api/integrations/[provider]/connect/route.ts'), 'utf8');
  assert.match(merchantRoute, /await allowRate\(/);
  assert.match(connectRoute, /await allowRate\(/);
  assert.match(merchantRoute, /RATE_LIMIT_UNAVAILABLE/);
  assert.match(connectRoute, /RATE_LIMIT_UNAVAILABLE/);
});

test('provider and model endpoints reject cleartext URLs in production and URL-embedded credentials', () => {
  const types = fs.readFileSync(path.join(root, 'src/lib/adapters/couriers/types.ts'), 'utf8');
  assert.match(types, /assertProviderUrl/);
  assert.match(types, /url\.protocol\s*!==\s*'https:'/ );
  assert.match(types, /url\.username \|\| url\.password/);
  assert.match(types, /redirect:\s*'error'/);
  assert.match(fs.readFileSync(path.join(root, 'src/lib/ai/agent.ts'), 'utf8'), /assertProviderUrl/);
  assert.match(fs.readFileSync(path.join(root, 'src/app/api/payments/[id]/proof/ocr/route.ts'), 'utf8'), /assertProviderUrl/);
});

test('Meta event message duplicates are detected before opening a transaction', () => {
  const worker = fs.readFileSync(path.join(root, 'src/lib/worker.ts'), 'utf8');
  assert.match(worker, /const priorMessage = await prisma\.message\.findFirst/);
  assert.ok(worker.indexOf('const priorMessage') < worker.indexOf('await prisma.$transaction(async tx =>'));
  assert.doesNotMatch(worker, /catch\s*\(e\)\s*\{\s*if\s*\(\(e as \{ code\?: string \}\)\?\.code !== 'P2002'\) throw e;\s*\}/);
});


test('all authenticated tenant contexts use the shared database-backed API limiter', () => {
  const tenant = fs.readFileSync(path.join(root, 'src/lib/tenant.ts'), 'utf8');
  assert.match(tenant, /import \{ allowRate \} from '@\/lib\/rate-limit'/);
  assert.match(tenant, /await allowRate\(`api:/);
  assert.match(tenant, /RATE_LIMIT_UNAVAILABLE/);
  assert.match(tenant, /Retry-After/);
});

test('payment proof upload, download and OCR validate private storage endpoint protocol', () => {
  for (const relative of [
    'src/app/api/payments/[id]/proof/route.ts',
    'src/app/api/payments/[id]/proof/download/route.ts',
    'src/app/api/payments/[id]/proof/ocr/route.ts',
  ]) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /assertProviderUrl\(b\.endpoint\)/, relative);
  }
});


test('outbound messages are idempotent across client retries', () => {
  const route = fs.readFileSync(path.join(root, 'src/app/api/conversations/[id]/messages/route.ts'), 'utf8');
  assert.match(route, /idempotencyKey\(request\)/);
  assert.match(route, /operation: 'conversation\.message\.create'/);
  assert.match(route, /requestHash !== requestHash/);
  assert.match(route, /idempotencyKey: `message-send:\$\{message\.id\}`/);
  const ui = fs.readFileSync(path.join(root, 'src/components/dashboard-client.tsx'), 'utf8');
  assert.match(ui, /'Idempotency-Key':requestKey/);
});

test('ambiguous Meta messages require owner/admin reconciliation and explicit no-delivery confirmation to retry', () => {
  const route = fs.readFileSync(path.join(root, 'src/app/api/conversations/[id]/messages/[messageId]/reconcile/route.ts'), 'utf8');
  assert.match(route, /tenantContext\(request, \['OWNER', 'ADMIN'\]\)/);
  assert.match(route, /confirmedNotSent: z\.literal\(true\)/);
  assert.match(route, /deliveryStatus: 'UNKNOWN'/);
  assert.match(route, /meta\.message_manually_confirmed_not_sent/);
  assert.match(route, /outboxJob\.create/);
});
