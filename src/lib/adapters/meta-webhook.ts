import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { enqueueOutbox } from '@/lib/jobs';

export function isValidMetaSignature(raw: Buffer, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const actual = Buffer.from(signature, 'utf8');
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'), 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function isValidVerifyToken(received: string | null, expected: string | null) {
  if (!received || !expected) return false;
  const a = Buffer.from(received); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
type Entry = {
  id?: string;
  messaging?: Array<{ sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] }; delivery?: unknown; read?: unknown }>;
  changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; messages?: Array<{ id?: string; from?: string; text?: { body?: string }; timestamp?: string; type?: string }>; statuses?: unknown[] } }>;
  [k: string]: unknown;
};
type Body = { object?: string; entry?: Entry[]; [k: string]: unknown };
function platformFor(object: string | undefined): 'MESSENGER' | 'INSTAGRAM' | 'WHATSAPP' | null {
  if (object === 'page') return 'MESSENGER';
  if (object === 'instagram') return 'INSTAGRAM';
  if (object === 'whatsapp_business_account') return 'WHATSAPP';
  return null;
}
export async function persistMetaEvents(raw: Buffer, body: Body) {
  const provider = String(body.object ?? 'meta');
  const platform = platformFor(body.object);
  const entries = Array.isArray(body.entry) ? body.entry : [];
  let saved = 0, duplicate = 0, unmapped = 0;

  for (const entry of entries) {
    const accountId = platform === 'WHATSAPP'
      ? String(entry.changes?.[0]?.value?.metadata?.phone_number_id ?? '')
      : String(entry.id ?? '');
    const connection = platform && accountId
      ? await prisma.channelConnection.findUnique({ where: { platform_externalAccountId: { platform, externalAccountId: accountId } }, select: { id: true, merchantId: true, platform: true, externalAccountId: true, status: true } })
      : null;
    const activeConnection = connection?.status === 'CONNECTED' ? connection : null;
    const entryBody = JSON.stringify(entry);
    const itemIds: string[] = [];
    for (const m of entry.messaging ?? []) if (m.message?.mid && !m.message.is_echo) itemIds.push(m.message.mid);
    for (const c of entry.changes ?? []) for (const m of c.value?.messages ?? []) if (m.id) itemIds.push(m.id);
    const fallback = createHash('sha256').update(entryBody).digest('hex');
    const eventIds = itemIds.length ? Array.from(new Set(itemIds)) : [fallback];

    for (const eventId of eventIds) {
      const key = createHash('sha256').update(`${provider}:${activeConnection?.merchantId ?? 'unmapped'}:${eventId}`).digest('hex');
      try {
        // Event and its durable outbox entry commit atomically. A process crash cannot leave a queued event with no job.
        await prisma.$transaction(async tx => {
          const event = await tx.webhookEvent.create({ data: {
            merchantId: activeConnection?.merchantId ?? null,
            provider,
            idempotencyKey: key,
            externalEventId: eventId,
            status: activeConnection ? 'QUEUED' : 'IGNORED_UNMAPPED',
            payload: entry as never,
          } });
          if (activeConnection) await tx.outboxJob.create({ data: {
            merchantId: activeConnection.merchantId,
            type: 'PROCESS_META_EVENT',
            payload: { webhookEventId: event.id },
            idempotencyKey: `webhook:${event.id}`,
          } });
        });
        saved++;
        if (!activeConnection) unmapped++;
      } catch (e) {
        if ((e as { code?: string })?.code === 'P2002') { duplicate++; continue; }
        throw e;
      }
      // Redis is only an accelerator. The outbox row already exists durably if queue publishing fails.
      if (activeConnection) {
        const event = await prisma.webhookEvent.findUnique({ where: { idempotencyKey: key }, select: { id: true, merchantId: true } });
        if (event?.merchantId) await enqueueOutbox({ merchantId: event.merchantId, type: 'PROCESS_META_EVENT', payload: { webhookEventId: event.id }, idempotencyKey: `webhook:${event.id}` }).catch(() => undefined);
      }
    }
  }
  if (!entries.length) {
    const key = createHash('sha256').update(`${provider}:${raw.toString('base64')}`).digest('hex');
    try {
      await prisma.webhookEvent.create({ data: { provider, idempotencyKey: key, status: 'IGNORED_UNMAPPED', payload: body as never } });
      saved++;
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') duplicate++;
      else throw e;
    }
  }
  return { saved, duplicate, unmapped };
}
