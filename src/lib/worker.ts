import { prisma } from '@/lib/prisma';
import { sendMetaText, MetaDeliveryOutcomeUnknownError, MetaPermanentDeliveryError } from '@/lib/adapters/meta';
import type { ChannelPlatform } from '@prisma/client';
import { staleSendRecovery } from '@/lib/core/outbox-recovery.mjs';

type MetaEntry = {
  id?: string;
  messaging?: Array<{
    sender?: { id?: string };
    timestamp?: number;
    message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
  }>;
  changes?: Array<{
    value?: {
      metadata?: { phone_number_id?: string };
      messages?: Array<{ id?: string; from?: string; text?: { body?: string }; timestamp?: string; type?: string }>;
    };
  }>;
  [k: string]: unknown;
};
function parsePlatform(provider: string): ChannelPlatform | null {
  if (provider === 'page') return 'MESSENGER';
  if (provider === 'instagram') return 'INSTAGRAM';
  if (provider === 'whatsapp_business_account') return 'WHATSAPP';
  return null;
}

async function processMetaEvent(eventId: string) {
  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event || !event.merchantId) throw new Error('Webhook event has no resolved merchant connection.');
  const platform = parsePlatform(event.provider);
  if (!platform) throw new Error('Unsupported Meta webhook object.');
  const entry = event.payload as unknown as MetaEntry;
  const accountId = platform === 'WHATSAPP'
    ? String(entry.changes?.[0]?.value?.metadata?.phone_number_id ?? '')
    : String(entry.id ?? '');
  const connection = await prisma.channelConnection.findUnique({
    where: { platform_externalAccountId: { platform, externalAccountId: accountId } },
  });
  if (!connection || connection.merchantId !== event.merchantId || connection.status !== 'CONNECTED') {
    throw new Error('Connected channel does not match the webhook tenant and account.');
  }

  let senderId = '', externalMessageId = '', text = '', sentAt = new Date();
  let attachments: unknown[] = [];
  if (platform === 'WHATSAPP') {
    const message = entry.changes?.flatMap(change => change.value?.messages ?? []).find(item => item.id === event.externalEventId);
    if (!message) {
      await prisma.webhookEvent.update({ where: { id: eventId }, data: { status: 'PROCESSED', processedAt: new Date() } });
      return;
    }
    senderId = String(message.from ?? '');
    externalMessageId = String(message.id ?? '');
    text = String(message.text?.body ?? (message.type === 'image' ? '[Image attachment]' : '[Non-text message]'));
    if (message.timestamp && /^\d+$/.test(message.timestamp)) sentAt = new Date(Number(message.timestamp) * 1000);
  } else {
    const message = entry.messaging?.find(item => item.message?.mid === event.externalEventId);
    // Message echoes and delivery/read receipts are provider confirmations, not new inbound customer messages.
    if (!message?.sender?.id || !message.message?.mid || message.message.is_echo) {
      await prisma.webhookEvent.update({ where: { id: eventId }, data: { status: 'PROCESSED', processedAt: new Date() } });
      return;
    }
    senderId = message.sender.id;
    externalMessageId = message.message.mid;
    text = String(message.message.text ?? (message.message.attachments?.length ? '[Attachment]' : '[Message]'));
    attachments = message.message.attachments ?? [];
    if (message.timestamp) sentAt = new Date(message.timestamp);
  }
  if (!senderId || !externalMessageId) throw new Error('Message event is missing provider identifiers.');
  if (Number.isNaN(sentAt.getTime())) sentAt = new Date();

  // The fast-path handles normal webhook retries. A concurrent duplicate can still race;
  // in that case the unique constraint rolls back the entire transaction and the outbox
  // retry re-enters this fast-path. Never catch a unique violation inside a PostgreSQL
  // transaction and then try to reuse the aborted transaction.
  const priorMessage = await prisma.message.findFirst({
    where: { merchantId: event.merchantId, externalMessageId },
    select: { id: true },
  });
  if (priorMessage) {
    await prisma.webhookEvent.update({ where: { id: eventId }, data: { status: 'PROCESSED', processedAt: new Date(), errorCode: null, errorDetail: null } });
    return;
  }
  await prisma.$transaction(async tx => {
    const customer = await tx.customer.upsert({
      where: { merchantId_externalId: { merchantId: event.merchantId!, externalId: senderId } },
      update: {},
      create: { merchantId: event.merchantId!, externalId: senderId, name: `Social customer · ${senderId.slice(-5)}` },
    });
    const thread = `${platform}:${senderId}`;
    const conversation = await tx.conversation.upsert({
      where: { merchantId_platform_externalThreadId: { merchantId: event.merchantId!, platform, externalThreadId: thread } },
      update: { lastMessageAt: sentAt, status: 'OPEN', unread: true, channelConnectionId: connection.id },
      create: { merchantId: event.merchantId!, platform, externalThreadId: thread, customerId: customer.id, channelConnectionId: connection.id, status: 'OPEN', unread: true, lastMessageAt: sentAt },
    });
    await tx.message.create({ data: { merchantId: event.merchantId!, conversationId: conversation.id, externalMessageId, direction: 'INBOUND', text, attachments: attachments as never, sentAt, deliveryStatus: 'RECEIVED' } });
    await tx.webhookEvent.update({ where: { id: eventId }, data: { status: 'PROCESSED', processedAt: new Date(), errorCode: null, errorDetail: null } });
  });
}

export async function handleOutboxJob(id: string) {
  const now = new Date();
  const claim = await prisma.outboxJob.updateMany({ where: { id, status: 'PENDING', runAt: { lte: now } }, data: { status: 'RUNNING', lockedAt: now, attempts: { increment: 1 } } });
  if (!claim.count) return { claimed: false };
  const job = await prisma.outboxJob.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as Record<string, unknown>;
  let providerAccepted = false;
  try {
    if (job.type === 'PROCESS_META_EVENT') {
      await processMetaEvent(String(payload.webhookEventId));
    } else if (job.type === 'SEND_META_MESSAGE') {
      const conversationId = String(payload.conversationId);
      const messageId = String(payload.messageId);
      const messageText = String(payload.text);
      const message = await prisma.message.findFirst({ where: { id: messageId, merchantId: job.merchantId } });
      if (!message) throw new MetaPermanentDeliveryError('Queued message was not found in its merchant workspace.');
      // A retry after a crash must never resend a message which was already acknowledged or whose outcome is unknown.
      if (message.deliveryStatus === 'SENT') {
        // Provider acknowledgement was durably saved before a later outbox update failed.
      } else if (message.deliveryStatus === 'UNKNOWN') {
        throw new MetaDeliveryOutcomeUnknownError('This message has an unknown delivery outcome. Check the provider inbox before taking manual action. It will not be resent automatically.');
      } else if (message.deliveryStatus === 'FAILED') {
        throw new MetaPermanentDeliveryError('This message has already been marked failed and requires a human to review it before retrying.');
      } else {
        // Persist an in-flight state before network I/O. If the process dies after the
        // provider accepted the message but before the acknowledgement is committed,
        // stale-lock recovery will mark it UNKNOWN instead of auto-sending it again.
        const sending = await prisma.message.updateMany({
          where: { id: messageId, merchantId: job.merchantId, deliveryStatus: { in: ['QUEUED', 'RETRYABLE'] } },
          data: { deliveryStatus: 'SENDING' },
        });
        if (!sending.count) {
          const current = await prisma.message.findFirst({ where: { id: messageId, merchantId: job.merchantId }, select: { deliveryStatus: true } });
          if (current?.deliveryStatus === 'SENT') {
            // Another worker already committed the acknowledgement.
          } else if (current?.deliveryStatus === 'UNKNOWN' || current?.deliveryStatus === 'SENDING') {
            throw new MetaDeliveryOutcomeUnknownError('Message is already in flight or its outcome is uncertain. It will not be sent again automatically.');
          } else {
            throw new MetaPermanentDeliveryError(`Message cannot be sent from state ${current?.deliveryStatus ?? 'missing'}.`);
          }
        }
        if (sending.count) {
        const result = await sendMetaText({ merchantId: String(job.merchantId), conversationId, text: messageText });
        providerAccepted = true;
        const externalId = String((result as { message_id?: string; messages?: Array<{ id?: string }> }).message_id ?? (result as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? '');
        try {
          const saved = await prisma.message.updateMany({ where: { id: messageId, merchantId: job.merchantId, deliveryStatus: { notIn: ['SENT', 'UNKNOWN'] } }, data: { deliveryStatus: 'SENT', ...(externalId ? { externalMessageId: externalId } : {}) } });
          if (!saved.count) {
            const current = await prisma.message.findFirst({ where: { id: messageId, merchantId: job.merchantId }, select: { deliveryStatus: true } });
            if (current?.deliveryStatus !== 'SENT') throw new Error('Message acknowledgement was not persisted.');
          }
        } catch {
          throw new MetaDeliveryOutcomeUnknownError('Meta accepted the send, but the local confirmation could not be saved. Check the provider inbox before any manual retry.');
        }
        }
      }
    } else {
      throw new MetaPermanentDeliveryError(`Unsupported outbox job type: ${job.type}`);
    }
    await prisma.outboxJob.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), lockedAt: null, lastError: null } });
    return { claimed: true, completed: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown worker error';
    const uncertain = e instanceof MetaDeliveryOutcomeUnknownError || providerAccepted;
    const permanent = e instanceof MetaPermanentDeliveryError;
    const exhausted = job.attempts >= job.maxAttempts;
    const stopRetry = uncertain || permanent || exhausted;
    const delay = Math.min(60 * 60_000, 1000 * 2 ** Math.min(job.attempts, 10));
    await prisma.outboxJob.update({ where: { id }, data: { status: stopRetry ? 'FAILED' : 'PENDING', runAt: new Date(Date.now() + delay), lockedAt: null, lastError: message.slice(0, 1000) } });
    if (job.type === 'PROCESS_META_EVENT' && payload.webhookEventId) {
      await prisma.webhookEvent.updateMany({ where: { id: String(payload.webhookEventId), status: { not: 'PROCESSED' } }, data: { status: exhausted ? 'FAILED' : 'QUEUED', errorCode: 'PROCESSING_FAILED', errorDetail: message.slice(0, 500) } });
    }
    if (job.type === 'SEND_META_MESSAGE' && payload.messageId) {
      // Never overwrite a previously persisted SENT status if only the final outbox update failed.
      const current = await prisma.message.findFirst({ where: { id: String(payload.messageId), merchantId: job.merchantId }, select: { deliveryStatus: true } });
      if (current?.deliveryStatus !== 'SENT') await prisma.message.updateMany({ where: { id: String(payload.messageId), merchantId: job.merchantId, deliveryStatus: { notIn: ['SENT', 'UNKNOWN'] } }, data: { deliveryStatus: uncertain ? 'UNKNOWN' : stopRetry ? 'FAILED' : 'RETRYABLE' } });
    }
    if (uncertain && job.type === 'SEND_META_MESSAGE' && payload.messageId) {
      await prisma.auditLog.create({ data: { merchantId: String(job.merchantId), action: 'meta.message_delivery_unknown', entityType: 'Message', entityId: String(payload.messageId), details: { outboxJobId: id, automaticRetry: false } } }).catch(() => undefined);
    }
    return { claimed: true, completed: false, retry: !stopRetry, outcomeUnknown: uncertain, error: message };
  }
}

export async function processPendingOutbox(limit = 25) {
  // For ordinary idempotent internal jobs a stale lock is retried. A stale outbound
  // network send is different: the provider may have accepted it just before the worker
  // crashed. Mark it UNKNOWN and require manual reconciliation to avoid duplicate replies.
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const stale = await prisma.outboxJob.findMany({ where: { status: 'RUNNING', lockedAt: { lt: staleBefore } }, select: { id: true, type: true, merchantId: true, payload: true } });
  for (const job of stale) {
    if (job.type === 'SEND_META_MESSAGE' && job.merchantId) {
      const payload = job.payload as Record<string, unknown>;
      const messageId = String(payload.messageId ?? '');
      const message = messageId ? await prisma.message.findFirst({ where: { id: messageId, merchantId: job.merchantId }, select: { deliveryStatus: true } }) : null;
      const recovery = staleSendRecovery(message?.deliveryStatus);
      if (messageId && recovery.action === 'mark_unknown') {
        await prisma.message.updateMany({ where: { id: messageId, merchantId: job.merchantId, deliveryStatus: 'SENDING' }, data: { deliveryStatus: 'UNKNOWN' } });
        await prisma.auditLog.create({ data: { merchantId: job.merchantId, action: 'meta.message_delivery_unknown', entityType: 'Message', entityId: messageId, details: { outboxJobId: job.id, reason: 'stale_worker_lock', automaticRetry: false } } }).catch(() => undefined);
      }
      if (recovery.action === 'complete') {
        await prisma.outboxJob.updateMany({ where: { id: job.id, status: 'RUNNING', lockedAt: { lt: staleBefore } }, data: { status: 'COMPLETED', completedAt: new Date(), lockedAt: null, lastError: null } });
      } else if (recovery.action === 'retry') {
        // The provider call only happens after the SENDING transition commits. QUEUED or
        // RETRYABLE therefore means this worker had not started external I/O yet.
        await prisma.outboxJob.updateMany({ where: { id: job.id, status: 'RUNNING', lockedAt: { lt: staleBefore } }, data: { status: 'PENDING', lockedAt: null, runAt: new Date(), lastError: 'Recovered stale job before provider send began.' } });
      } else {
        await prisma.outboxJob.updateMany({ where: { id: job.id, status: 'RUNNING', lockedAt: { lt: staleBefore } }, data: { status: 'FAILED', lockedAt: null, lastError: recovery.action === 'mark_unknown' ? 'Stale outbound send outcome unknown; automatic retry prevented.' : 'Stale outbound job not safe to retry automatically.' } });
      }
    } else {
      await prisma.outboxJob.updateMany({ where: { id: job.id, status: 'RUNNING', lockedAt: { lt: staleBefore } }, data: { status: 'PENDING', lockedAt: null, runAt: new Date(), lastError: 'Recovered a stale worker lock.' } });
    }
  }
  const pending = await prisma.outboxJob.findMany({ where: { status: 'PENDING', runAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: Math.max(1, Math.min(100, limit)), select: { id: true } });
  const results = [];
  for (const job of pending) results.push({ id: job.id, ...await handleOutboxJob(job.id) });
  return results;
}
