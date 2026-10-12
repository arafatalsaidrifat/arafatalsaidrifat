import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { enqueueOutbox } from '@/lib/jobs';
import { tenantContext, isResponse, writeAudit } from '@/lib/tenant';
import { jsonError, noStoreJson } from '@/lib/http';

export const runtime = 'nodejs';
const schema = z.object({
  action: z.enum(['confirm_sent', 'confirm_not_sent']),
  reason: z.string().trim().min(8).max(500),
  providerMessageId: z.string().trim().min(2).max(200).optional(),
  confirmedNotSent: z.literal(true).optional(),
}).refine(v => v.action !== 'confirm_not_sent' || v.confirmedNotSent === true, {
  message: 'Confirm that you checked the provider inbox and the message was not delivered before retrying.',
});

type Route = { params: Promise<{ id: string; messageId: string }> };
export async function POST(request: Request, route: Route) {
  const t = await tenantContext(request, ['OWNER', 'ADMIN']);
  if (isResponse(t)) return t;
  const { id: conversationId, messageId } = await route.params;
  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError('Invalid JSON.'); }
  const p = schema.safeParse(raw);
  if (!p.success) return jsonError(p.error.issues[0]?.message ?? 'Invalid reconciliation request.');
  const message = await prisma.message.findFirst({ where: { id: messageId, conversationId, merchantId: t.merchantId }, select: { id: true, text: true, deliveryStatus: true } });
  if (!message) return jsonError('Message not found in this workspace.', 404, 'NOT_FOUND');
  if (message.deliveryStatus !== 'UNKNOWN') return jsonError('Only messages with an uncertain delivery outcome can be reconciled here.', 409, 'MESSAGE_NOT_AMBIGUOUS');

  if (p.data.action === 'confirm_sent') {
    try {
      const updated = await prisma.message.updateMany({
        where: { id: messageId, conversationId, merchantId: t.merchantId, deliveryStatus: 'UNKNOWN' },
        data: { deliveryStatus: 'SENT', ...(p.data.providerMessageId ? { externalMessageId: p.data.providerMessageId } : {}) },
      });
      if (!updated.count) return jsonError('Message state changed during reconciliation. Reload and verify it again.', 409, 'STATE_CHANGED');
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') return jsonError('That provider message ID is already attached to another message.', 409, 'PROVIDER_MESSAGE_ID_CONFLICT');
      throw e;
    }
    await writeAudit({ merchantId: t.merchantId, actorId: t.user.id, action: 'meta.message_manually_confirmed_sent', entityType: 'Message', entityId: messageId, details: { reason: p.data.reason, providerMessageId: p.data.providerMessageId ?? null } });
    return noStoreJson({ ok: true, deliveryStatus: 'SENT', manuallyReconciled: true });
  }

  const outboxKey = `message-send-reconciled:${messageId}:${randomUUID()}`;
  try {
    await prisma.$transaction(async tx => {
      const updated = await tx.message.updateMany({ where: { id: messageId, conversationId, merchantId: t.merchantId, deliveryStatus: 'UNKNOWN' }, data: { deliveryStatus: 'RETRYABLE' } });
      if (!updated.count) throw new Error('STATE_CHANGED');
      await tx.outboxJob.create({ data: { merchantId: t.merchantId, type: 'SEND_META_MESSAGE', payload: { conversationId, messageId, text: message.text }, idempotencyKey: outboxKey } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'STATE_CHANGED') return jsonError('Message state changed during reconciliation. Reload before retrying.', 409, 'STATE_CHANGED');
    throw e;
  }
  await enqueueOutbox({ merchantId: t.merchantId, type: 'SEND_META_MESSAGE', payload: { conversationId, messageId, text: message.text }, idempotencyKey: outboxKey }).catch(() => undefined);
  await writeAudit({ merchantId: t.merchantId, actorId: t.user.id, action: 'meta.message_manually_confirmed_not_sent', entityType: 'Message', entityId: messageId, details: { reason: p.data.reason, newOutboxKey: outboxKey } });
  return noStoreJson({ ok: true, deliveryStatus: 'RETRYABLE', queued: true, warning: 'Retry was authorized by a workspace owner/admin after confirming the provider did not deliver the earlier attempt.' }, 202);
}
