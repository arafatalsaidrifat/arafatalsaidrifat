import crypto from 'node:crypto';
export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !/^sha256=[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const actual = Buffer.from(signatureHeader);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
export function stableWebhookKey(provider, externalId, rawBody) {
  const id = String(externalId ?? '').trim();
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  return `${String(provider).toLowerCase()}:${id || bodyHash}`.slice(0,250);
}
export function validateWebhookVerifyToken(received, expected) {
  if (!received || !expected) return false;
  const a=Buffer.from(received), b=Buffer.from(expected);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
export function validateBengaliPhone(phone) {
  const digits = String(phone ?? '').replace(/[\s()-]/g,'');
  return /^(?:\+?88)?01[3-9]\d{8}$/.test(digits);
}
