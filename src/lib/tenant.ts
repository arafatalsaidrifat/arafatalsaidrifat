import { auth, authIsConfigured } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/http';
import type { MerchantRole } from '@prisma/client';
import { allowRate } from '@/lib/rate-limit';

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type TenantContext = { user: Session['user']; merchantId: string; role: MerchantRole; session: Session };
export async function tenantContext(request: Request, allowedRoles?: MerchantRole[]): Promise<TenantContext | Response> {
  if (!authIsConfigured()) return jsonError('Authentication/database configuration is incomplete. Configure DATABASE_URL, BETTER_AUTH_URL and a 32+ character BETTER_AUTH_SECRET.', 503, 'AUTH_NOT_CONFIGURED');
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return jsonError('Sign in to continue.', 401, 'UNAUTHENTICATED');
  const requested = request.headers.get('x-merchant-id') || new URL(request.url).searchParams.get('merchantId') || '';
  const membership = await prisma.merchantMembership.findFirst({
    where: { userId: session.user.id, ...(requested ? { merchantId: requested } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { merchantId: true, role: true },
  });
  if (!membership) return jsonError(requested ? 'You do not have access to this workspace.' : 'Create a workspace before using operations.', requested ? 403 : 409, requested ? 'TENANT_FORBIDDEN' : 'WORKSPACE_REQUIRED');
  if (allowedRoles && !allowedRoles.includes(membership.role)) return jsonError('Your workspace role cannot perform this action.', 403, 'ROLE_FORBIDDEN');
  const limit = await allowRate(`api:${membership.merchantId}:${session.user.id}`, 240, 60_000);
  if (limit.unavailable) return jsonError('Shared rate-limit storage is unavailable. Please retry shortly.', 503, 'RATE_LIMIT_UNAVAILABLE');
  if (!limit.allowed) return new Response(JSON.stringify({ error: 'Too many requests for this workspace session.', code: 'RATE_LIMITED' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) } });
  return { user: session.user, merchantId: membership.merchantId, role: membership.role, session };
}
export function isResponse(value: TenantContext | Response): value is Response { return value instanceof Response; }
export async function writeAudit(input: { merchantId:string; actorId?:string|null; action:string; entityType:string; entityId?:string|null; details?:unknown; requestId?:string|null }) {
  return prisma.auditLog.create({ data: { ...input, details: input.details as never } });
}
