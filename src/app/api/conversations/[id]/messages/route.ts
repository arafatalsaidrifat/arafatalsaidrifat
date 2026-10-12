import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { tenantContext, isResponse, writeAudit } from '@/lib/tenant';
import { jsonError, noStoreJson } from '@/lib/http';
import { enqueueOutbox } from '@/lib/jobs';
import { idempotencyKey } from '@/lib/idempotency';

export const runtime = 'nodejs';
const schema = z.object({ text: z.string().trim().min(1).max(4000), internalNote: z.boolean().default(false) });
type Route = { params: Promise<{ id: string }> };

export async function GET(request: Request, route: Route) {
  const t = await tenantContext(request);
  if (isResponse(t)) return t;
  const { id } = await route.params;
  const conv = await prisma.conversation.findFirst({ where: { id, merchantId: t.merchantId }, select: { id: true } });
  if (!conv) return jsonError('Conversation not found in this workspace.', 404, 'NOT_FOUND');
  const messages = await prisma.message.findMany({ where: { merchantId: t.merchantId, conversationId: id }, orderBy: { sentAt: 'asc' }, take: 500 });
  return noStoreJson({ messages });
}

export async function POST(request: Request, route: Route) {
  const t = await tenantContext(request, ['OWNER', 'ADMIN', 'AGENT']);
  if (isResponse(t)) return t;
  const { id } = await route.params;
  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError('Invalid JSON.'); }
  const p = schema.safeParse(raw);
  if (!p.success) return jsonError(p.error.issues[0]?.message ?? 'Invalid message.');
  let key: string;
  try { key = idempotencyKey(request); } catch (e) { return jsonError(e instanceof Error ? e.message : 'Invalid Idempotency-Key.'); }
  const requestHash = createHash('sha256').update(JSON.stringify({ conversationId: id, ...p.data })).digest('hex');
  const replay = async () => {
    const existing = await prisma.idempotencyKey.findUnique({ where: { merchantId_key: { merchantId: t.merchantId, key } } });
    if (!existing) return null;
    if (existing.operation !== 'conversation.message.create' || existing.requestHash !== requestHash) {
      return jsonError('This Idempotency-Key has already been used for a different message request.', 409, 'IDEMPOTENCY_CONFLICT');
    }
    if (existing.completedAt && existing.response) return noStoreJson(existing.response, 200);
    return jsonError('This message request is still in progress. Retry with the same Idempotency-Key.', 409, 'IDEMPOTENCY_IN_PROGRESS');
  };
  const prior = await replay();
  if (prior) return prior;

  const conversation = await prisma.conversation.findFirst({ where: { id, merchantId: t.merchantId }, include: { channelConnection: true } });
  if (!conversation) return jsonError('Conversation not found in this workspace.', 404, 'NOT_FOUND');
  if (!p.data.internalNote && (!conversation.channelConnection || conversation.channelConnection.status !== 'CONNECTED' || !conversation.channelConnection.accessTokenCiphertext)) {
    return jsonError('This channel is not connected; message was not sent. Save an internal note or connect the provider first.', 409, 'CHANNEL_NOT_CONNECTED');
  }

  try {
    const result = await prisma.$transaction(async tx => {
      await tx.idempotencyKey.create({ data: { merchantId: t.merchantId, key, operation: 'conversation.message.create', requestHash } });
      const message = await tx.message.create({ data: {
        merchantId: t.merchantId, conversationId: id, direction: p.data.internalNote ? 'INTERNAL' : 'OUTBOUND',
        text: p.data.text, deliveryStatus: p.data.internalNote ? 'INTERNAL_NOTE' : 'QUEUED',
      } });
      await tx.conversation.update({ where: { id }, data: { lastMessageAt: new Date(), status: p.data.internalNote ? conversation.status : 'OPEN', unread: false } });
      let delivery: string = p.data.internalNote ? 'internal_note' : 'queued_for_provider';
      if (!p.data.internalNote) {
        await tx.outboxJob.create({ data: { merchantId: t.merchantId, type: 'SEND_META_MESSAGE', payload: { conversationId: id, messageId: message.id, text: p.data.text }, idempotencyKey: `message-send:${message.id}` } });
      }
      const response = { message, delivery };
      await tx.idempotencyKey.update({ where: { merchantId_key: { merchantId: t.merchantId, key } }, data: { response: response as never, completedAt: new Date() } });
      return response;
    });
    if (!p.data.internalNote) {
      await enqueueOutbox({ merchantId: t.merchantId, type: 'SEND_META_MESSAGE', payload: { conversationId: id, messageId: result.message.id, text: p.data.text }, idempotencyKey: `message-send:${result.message.id}` }).catch(() => undefined);
    }
    await writeAudit({ merchantId: t.merchantId, actorId: t.user.id, action: p.data.internalNote ? 'message.note_added' : 'message.send_queued', entityType: 'Conversation', entityId: id, details: { messageId: result.message.id, direction: result.message.direction, idempotencyKey: key } });
    return noStoreJson(result, 201);
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      const existing = await replay();
      if (existing) return existing;
    }
    throw e;
  }
}
