import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number; unavailable?: boolean };
let cleanupCounter = 0;
const localBuckets = new Map<string, { count: number; resetAt: number }>();
function hashedKey(value: string) { return createHash('sha256').update(value).digest('hex'); }

/**
 * Shared DB-backed sliding fixed-window counter. Unlike a module-local Map, limits survive
 * serverless cold starts and are consistent across application instances. If storage fails,
 * production callers fail closed rather than silently switching to a per-process limit.
 */
export async function allowRate(key: string, limit = 60, windowMs = 60_000): Promise<RateLimitResult> {
  const now = new Date();
  const bucketKey = hashedKey(key);
  const resetAt = new Date(now.getTime() + Math.max(1000, windowMs));
  try {
    await prisma.rateLimitBucket.upsert({
      where: { key: bucketKey },
      create: { key: bucketKey, count: 0, resetAt: new Date(0) },
      update: {},
    });
    // A conditional reset ensures concurrent requests cannot each reset the same expired bucket.
    const reset = await prisma.rateLimitBucket.updateMany({
      where: { key: bucketKey, resetAt: { lte: now } },
      data: { count: 1, resetAt },
    });
    if (!reset.count) {
      await prisma.rateLimitBucket.updateMany({ where: { key: bucketKey, resetAt: { gt: now } }, data: { count: { increment: 1 } } });
    }
    const current = await prisma.rateLimitBucket.findUnique({ where: { key: bucketKey }, select: { count: true, resetAt: true } });
    if (!current) return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs, unavailable: true };
    cleanupCounter++;
    if (cleanupCounter % 100 === 0) {
      await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }).catch(() => undefined);
    }
    return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt.getTime() };
  } catch {
    if (process.env.NODE_ENV === 'production') return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs, unavailable: true };
    const localKey = bucketKey;
    let item = localBuckets.get(localKey);
    if (!item || item.resetAt <= Date.now()) { item = { count: 0, resetAt: Date.now() + windowMs }; localBuckets.set(localKey, item); }
    item.count++;
    if (localBuckets.size > 10_000) for (const [k, v] of localBuckets) if (v.resetAt <= Date.now()) localBuckets.delete(k);
    return { allowed: item.count <= limit, remaining: Math.max(0, limit - item.count), resetAt: item.resetAt };
  }
}

export function constantTimeBearerMatches(received: string | null, expected: string | null): boolean {
  if (!received || !expected || received.length !== expected.length) return false;
  const a = Buffer.from(received); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
