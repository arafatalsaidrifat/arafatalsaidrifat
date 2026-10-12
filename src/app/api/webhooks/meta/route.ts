import { jsonError, noStoreJson } from '@/lib/http';
import { isValidMetaSignature, isValidVerifyToken, persistMetaEvents } from '@/lib/adapters/meta-webhook';
export const runtime = 'nodejs';
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function boundedRawBody(request: Request): Promise<Buffer | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size);
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const mode = u.searchParams.get('hub.mode');
  const token = u.searchParams.get('hub.verify_token');
  const challenge = u.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && isValidVerifyToken(token, process.env.META_WEBHOOK_VERIFY_TOKEN ?? null) && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  }
  return jsonError('Webhook verification failed.', 403, 'WEBHOOK_VERIFY_FAILED');
}

export async function POST(request: Request) {
  const raw = await boundedRawBody(request);
  if (raw === null) return jsonError('Webhook payload exceeds the 5 MB limit.', 413, 'INVALID_PAYLOAD_SIZE');
  if (raw.length === 0) return jsonError('Webhook payload is empty.', 400, 'EMPTY_PAYLOAD');
  if (!isValidMetaSignature(raw, request.headers.get('x-hub-signature-256'))) return jsonError('Invalid Meta webhook signature.', 401, 'INVALID_SIGNATURE');
  let body: unknown;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return jsonError('Webhook payload is not valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('Invalid webhook payload.');
  try {
    const result = await persistMetaEvents(raw, body as Record<string, unknown>);
    return noStoreJson({ ok: true, ...result });
  } catch {
    // Avoid echoing provider payloads, raw internal details or secrets into public webhook responses.
    return jsonError('Webhook persistence failed; Meta may safely retry delivery.', 503, 'WEBHOOK_PERSISTENCE_FAILED');
  }
}
