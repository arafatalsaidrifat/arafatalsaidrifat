import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/crypto';
import { providerFetch } from '@/lib/adapters/couriers/types';
import { tenantContext, isResponse, writeAudit } from '@/lib/tenant';
import { jsonError, noStoreJson } from '@/lib/http';
import { allowRate } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const schema = z.object({
  accountId: z.string().trim().min(3).max(120),
  accessToken: z.string().trim().min(20).max(6000),
  displayName: z.string().trim().min(2).max(160),
});
const providerMap: Record<string, 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP'> = {
  META_MESSENGER: 'MESSENGER', INSTAGRAM: 'INSTAGRAM', WHATSAPP: 'WHATSAPP',
};
const requiredScope: Record<'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP', string> = {
  MESSENGER: 'pages_messaging', INSTAGRAM: 'instagram_manage_messages', WHATSAPP: 'whatsapp_business_messaging',
};

export async function POST(request: Request, route: { params: Promise<{ provider: string }> }) {
  const t = await tenantContext(request, ['OWNER', 'ADMIN']);
  if (isResponse(t)) return t;
  const rate = await allowRate(`meta-connect:${t.merchantId}:${t.user.id}`, 5, 15 * 60_000);
  if (rate.unavailable) return jsonError('Rate-limit storage is unavailable. Please retry shortly.', 503, 'RATE_LIMIT_UNAVAILABLE');
  if (!rate.allowed) return jsonError('Too many connection attempts. Try again later.', 429, 'RATE_LIMITED');
  const { provider: raw } = await route.params;
  const provider = raw.toUpperCase();
  const platform = providerMap[provider];
  if (!platform) return jsonError('Secure token connection is currently available only for Meta social channels.', 400, 'UNSUPPORTED_PROVIDER');
  if (!process.env.TOKEN_ENCRYPTION_KEY) return jsonError('TOKEN_ENCRYPTION_KEY is not configured. The channel was not connected.', 503, 'TOKEN_ENCRYPTION_NOT_CONFIGURED');
  const version = process.env.META_GRAPH_API_VERSION;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!version || !/^v\d+\.\d+$/.test(version) || !appId || !appSecret) return jsonError('META_GRAPH_API_VERSION, META_APP_ID and META_APP_SECRET are required to validate a token.', 503, 'META_VALIDATION_NOT_CONFIGURED');
  let rawBody: unknown;
  try { rawBody = await request.json(); } catch { return jsonError('Invalid JSON.'); }
  const p = schema.safeParse(rawBody);
  if (!p.success) return jsonError(p.error.issues[0]?.message ?? 'Invalid connection data.');
  const base = (process.env.META_GRAPH_API_BASE_URL || 'https://graph.facebook.com').replace(/\/$/, '');

  // Use the configured app to validate the token, its app binding and minimum messaging permission before storing it.
  try {
    const debugUrl = new URL(`${base}/${version}/debug_token`);
    debugUrl.searchParams.set('input_token', p.data.accessToken);
    debugUrl.searchParams.set('access_token', `${appId}|${appSecret}`);
    const debugResponse = await providerFetch(debugUrl.toString(), { headers: { Accept: 'application/json' } });
    if (!debugResponse.ok) return jsonError('Meta could not validate this access token. Nothing was stored.', 401, 'META_TOKEN_INVALID');
    const debug = await debugResponse.json() as { data?: { is_valid?: boolean; app_id?: string; expires_at?: number; data_access_expires_at?: number; scopes?: string[] } };
    const token = debug.data;
    if (!token?.is_valid || (token.app_id && token.app_id !== appId)) return jsonError('This token is invalid or belongs to a different Meta app. Nothing was stored.', 401, 'META_TOKEN_INVALID');
    const now = Math.floor(Date.now() / 1000);
    if (token.expires_at && token.expires_at > 0 && token.expires_at <= now) return jsonError('This Meta token has expired. Nothing was stored.', 401, 'META_TOKEN_EXPIRED');
    if (!Array.isArray(token.scopes) || !token.scopes.includes(requiredScope[platform])) return jsonError(`The token is missing the required ${requiredScope[platform]} permission. Nothing was stored.`, 403, 'META_SCOPE_MISSING');

    const url = new URL(`${base}/${version}/${encodeURIComponent(p.data.accountId)}`);
    url.searchParams.set('fields', platform === 'WHATSAPP' ? 'id,display_phone_number' : 'id,name');
    const verify = await providerFetch(url.toString(), { headers: { Authorization: `Bearer ${p.data.accessToken}` } });
    if (!verify.ok) return jsonError('Meta did not accept this token/account combination. Nothing was stored.', 401, 'META_ACCOUNT_INVALID');
    const info = await verify.json() as { id?: string; name?: string; display_phone_number?: string };
    if (String(info.id ?? '') !== p.data.accountId) return jsonError('Meta returned an unexpected account ID.', 401, 'META_ACCOUNT_MISMATCH');

    // A Meta messaging account may not be attached to two merchant tenants.
    const prior = await prisma.channelConnection.findUnique({ where: { platform_externalAccountId: { platform, externalAccountId: p.data.accountId } } });
    if (prior && prior.merchantId !== t.merchantId) return jsonError('This Meta account is already connected to another workspace. Disconnect it there before transferring ownership.', 409, 'CHANNEL_OWNED_BY_ANOTHER_WORKSPACE');
    let ciphertext: string;
    try { ciphertext = encryptSecret(p.data.accessToken); } catch (e) { return jsonError(e instanceof Error ? e.message : 'Token encryption failed.', 503, 'TOKEN_ENCRYPTION_FAILED'); }
    const channel = prior
      ? await prisma.channelConnection.update({ where: { id: prior.id }, data: { displayName: p.data.displayName, accessTokenCiphertext: ciphertext, status: 'CONNECTED', tokenExpiresAt: token.expires_at ? new Date(token.expires_at * 1000) : null } })
      : await prisma.channelConnection.create({ data: { merchantId: t.merchantId, platform, externalAccountId: p.data.accountId, displayName: p.data.displayName, accessTokenCiphertext: ciphertext, status: 'CONNECTED', tokenExpiresAt: token.expires_at ? new Date(token.expires_at * 1000) : null } });
    await prisma.integrationConnection.upsert({ where: { merchantId_provider: { merchantId: t.merchantId, provider } }, update: { displayName: p.data.displayName, status: 'CONFIGURED', lastCheckedAt: new Date(), lastErrorCode: null }, create: { merchantId: t.merchantId, provider, displayName: p.data.displayName, status: 'CONFIGURED', lastCheckedAt: new Date() } });
    await writeAudit({ merchantId: t.merchantId, actorId: t.user.id, action: 'integration.meta_token_validated', entityType: 'ChannelConnection', entityId: channel.id, details: { provider, externalAccountId: p.data.accountId, permissionValidated: requiredScope[platform] } });
    return noStoreJson({ connected: true, provider, displayName: p.data.displayName, accountId: p.data.accountId, tokenStoredEncrypted: true, permissionValidated: requiredScope[platform], notice: 'Token validity, app binding, account ID and the minimum messaging permission were checked. You must still complete the correct webhook/app subscriptions and live message smoke tests.' }, 201);
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return jsonError('This Meta account was connected elsewhere at the same time. Refresh and verify workspace ownership.', 409, 'CHANNEL_OWNERSHIP_CONFLICT');
    return jsonError(e instanceof Error ? e.message : 'Meta connection check failed.', 502, 'META_CONNECTION_CHECK_FAILED');
  }
}
