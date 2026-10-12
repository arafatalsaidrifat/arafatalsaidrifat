import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { tenantContext, isResponse, writeAudit } from '@/lib/tenant';
import { jsonError, noStoreJson } from '@/lib/http';
import { calculateOrderTotal, shippingFeePaisa } from '@/lib/core/commerce.mjs';
import { idempotencyKey } from '@/lib/idempotency';

export const runtime = 'nodejs';
const schema = z.object({
  customerId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(1000) })).min(1).max(100),
  discountPaisa: z.number().int().min(0).default(0),
  shippingCity: z.string().trim().min(1).max(100),
  shippingPostalCode: z.string().trim().max(20).optional(),
  shippingName: z.string().trim().min(2).max(100),
  shippingPhone: z.string().trim().min(8).max(25),
  shippingAddress: z.string().trim().min(5).max(500),
  notes: z.string().max(2000).optional(),
  paymentMethod: z.enum(['BKASH', 'NAGAD', 'ROCKET', 'COD', 'BANK_TRANSFER', 'OTHER']).default('COD'),
});

export async function GET(request: Request) {
  const ctx = await tenantContext(request);
  if (isResponse(ctx)) return ctx;
  const u = new URL(request.url);
  const status = u.searchParams.get('status');
  const q = u.searchParams.get('q')?.trim();
  const parsedPage = Number(u.searchParams.get('page') || 1);
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.min(1000, Math.floor(parsedPage))) : 1;
  const take = 50;
  const where = {
    merchantId: ctx.merchantId,
    ...(status && ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(status) ? { status: status as never } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q, mode: 'insensitive' as const } }, { shippingName: { contains: q, mode: 'insensitive' as const } }, { shippingPhone: { contains: q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, include: { customer: { select: { id: true, name: true, phone: true, city: true } }, items: true, payment: true, shipment: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
    prisma.order.count({ where }),
  ]);
  return noStoreJson({ orders: rows, total, page, take });
}

export async function POST(request: Request) {
  const ctx = await tenantContext(request, ['OWNER', 'ADMIN', 'AGENT']);
  if (isResponse(ctx)) return ctx;
  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError('Invalid JSON.'); }
  const p = schema.safeParse(raw);
  if (!p.success) return jsonError(p.error.issues[0]?.message ?? 'Invalid order.');
  let key: string;
  try { key = idempotencyKey(request); } catch (e) { return jsonError(e instanceof Error ? e.message : 'Invalid Idempotency-Key.'); }
  const requestHash = createHash('sha256').update(JSON.stringify(p.data)).digest('hex');

  const existing = await prisma.idempotencyKey.findUnique({ where: { merchantId_key: { merchantId: ctx.merchantId, key } } });
  if (existing) {
    if (existing.operation !== 'order.create' || existing.requestHash !== requestHash) return jsonError('This Idempotency-Key has already been used for a different request.', 409, 'IDEMPOTENCY_CONFLICT');
    if (existing.completedAt && existing.response) return noStoreJson(existing.response, 200);
    return jsonError('An order request with this key is still in progress. Do not submit a different key until you reconcile the original request.', 409, 'IDEMPOTENCY_IN_PROGRESS');
  }

  try {
    const result = await prisma.$transaction(async tx => {
      await tx.idempotencyKey.create({ data: { merchantId: ctx.merchantId, key, operation: 'order.create', requestHash } });
      const [merchant, customer] = await Promise.all([
        tx.merchant.findUniqueOrThrow({ where: { id: ctx.merchantId } }),
        tx.customer.findFirst({ where: { id: p.data.customerId, merchantId: ctx.merchantId } }),
      ]);
      if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
      const ids = [...new Set(p.data.items.map(item => item.productId))];
      const products = await tx.product.findMany({ where: { merchantId: ctx.merchantId, id: { in: ids }, active: true } });
      if (products.length !== ids.length) throw new Error('PRODUCT_NOT_FOUND');
      const productsById = new Map(products.map(product => [product.id, product]));
      const items = p.data.items.map(item => {
        const product = productsById.get(item.productId);
        if (!product) throw new Error('PRODUCT_NOT_FOUND');
        if (product.stockQuantity < item.quantity) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
        const lineTotalPaisa = product.sellPricePaisa * item.quantity;
        if (!Number.isSafeInteger(lineTotalPaisa)) throw new Error('ORDER_TOTAL_UNSAFE');
        return { productId: product.id, productName: product.name, sku: product.sku, quantity: item.quantity, unitPricePaisa: product.sellPricePaisa, lineTotalPaisa };
      });
      const shippingPaisa = shippingFeePaisa(p.data.shippingCity, merchant.insideDhakaPaisa, merchant.outsideDhakaPaisa);
      const totals = calculateOrderTotal({ items, discountPaisa: p.data.discountPaisa, shippingPaisa });
      const orderNumber = `FC-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const order = await tx.order.create({ data: {
        merchantId: ctx.merchantId, orderNumber, customerId: customer.id, status: 'PENDING', ...totals,
        shippingName: p.data.shippingName, shippingPhone: p.data.shippingPhone,
        shippingAddress: p.data.shippingAddress, shippingCity: p.data.shippingCity,
        shippingPostalCode: p.data.shippingPostalCode || null, notes: p.data.notes,
        items: { create: items }, payment: { create: { merchantId: ctx.merchantId, method: p.data.paymentMethod, amountPaisa: totals.totalPaisa, status: 'PENDING' } },
      }, include: { customer: true, items: true, payment: true } });

      for (const item of items) {
        const updated = await tx.product.updateMany({ where: { id: item.productId, merchantId: ctx.merchantId, stockQuantity: { gte: item.quantity } }, data: { stockQuantity: { decrement: item.quantity } } });
        if (!updated.count) throw new Error(`INSUFFICIENT_STOCK:${item.productName}`);
        await tx.inventoryMovement.create({ data: { merchantId: ctx.merchantId, productId: item.productId, quantityDelta: -item.quantity, reason: 'Order reserved', referenceType: 'Order', referenceId: order.id, createdById: ctx.user.id } });
      }
      await tx.customer.update({ where: { id: customer.id }, data: { lifetimePaisa: { increment: totals.totalPaisa } } });
      const response = { order };
      await tx.idempotencyKey.update({ where: { merchantId_key: { merchantId: ctx.merchantId, key } }, data: { response: response as never, completedAt: new Date() } });
      return response;
    });
    await writeAudit({ merchantId: ctx.merchantId, actorId: ctx.user.id, action: 'order.created', entityType: 'Order', entityId: result.order.id, details: { idempotencyKey: key } });
    return noStoreJson(result, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if ((e as { code?: string })?.code === 'P2002') {
      const prior = await prisma.idempotencyKey.findUnique({ where: { merchantId_key: { merchantId: ctx.merchantId, key } } });
      if (prior && prior.requestHash !== requestHash) return jsonError('This Idempotency-Key has already been used for a different request.', 409, 'IDEMPOTENCY_CONFLICT');
      if (prior?.completedAt && prior.response) return noStoreJson(prior.response, 200);
      return jsonError('This Idempotency-Key is already processing or conflicting with an existing record.', 409, 'IDEMPOTENCY_IN_PROGRESS');
    }
    if (message === 'CUSTOMER_NOT_FOUND') return jsonError('Customer not found in this workspace.', 404, 'CUSTOMER_NOT_FOUND');
    if (message === 'PRODUCT_NOT_FOUND') return jsonError('One or more products are unavailable in this workspace.', 409, 'PRODUCT_NOT_FOUND');
    if (message.startsWith('INSUFFICIENT_STOCK')) return jsonError(message.replace('INSUFFICIENT_STOCK:', 'Insufficient stock for '), 409, 'INSUFFICIENT_STOCK');
    if (message === 'ORDER_TOTAL_UNSAFE') return jsonError('Order total exceeds a safe monetary range.', 422, 'ORDER_TOTAL_UNSAFE');
    throw e;
  }
}
