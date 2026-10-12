import { PrismaClient, type OrderStatus, type PaymentMethod, type PaymentStatus, type ShipmentStatus } from '@prisma/client';

const prisma = new PrismaClient();
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL?.trim().toLowerCase();

const products = [
  { name: 'Linen Panjabi — Sand', sku: 'PAN-SAND-M', category: 'Menswear', sellPricePaisa: 189900, costPricePaisa: 112000, stockQuantity: 18, lowStockThreshold: 5 },
  { name: 'Printed Cotton Kurti', sku: 'KURTI-FLORAL-M', category: 'Womenswear', sellPricePaisa: 129900, costPricePaisa: 71000, stockQuantity: 7, lowStockThreshold: 5 },
  { name: 'Handloom Tote Bag', sku: 'BAG-HANDLOOM-01', category: 'Accessories', sellPricePaisa: 85000, costPricePaisa: 42000, stockQuantity: 26, lowStockThreshold: 6 },
  { name: 'Minimal Analog Watch', sku: 'WATCH-MIN-BLK', category: 'Accessories', sellPricePaisa: 245000, costPricePaisa: 166000, stockQuantity: 4, lowStockThreshold: 5 },
  { name: 'Premium Cotton Hijab', sku: 'HIJAB-COT-OLIVE', category: 'Womenswear', sellPricePaisa: 65000, costPricePaisa: 34000, stockQuantity: 31, lowStockThreshold: 8 },
  { name: 'Leather Card Holder', sku: 'CARD-BRN-01', category: 'Accessories', sellPricePaisa: 79900, costPricePaisa: 40000, stockQuantity: 3, lowStockThreshold: 5 },
  { name: 'Classic Oxford Shirt', sku: 'SHIRT-OXF-BLUE-M', category: 'Menswear', sellPricePaisa: 155000, costPricePaisa: 88000, stockQuantity: 14, lowStockThreshold: 5 },
  { name: 'Ceramic Tea Set', sku: 'HOME-TEA-WHT', category: 'Home & Living', sellPricePaisa: 215000, costPricePaisa: 137000, stockQuantity: 9, lowStockThreshold: 4 },
];
const customers = [
  { externalId: 'demo-customer-01', name: 'Nusrat Jahan', phone: '01712340001', city: 'Dhaka', address: 'Bashundhara R/A, Dhaka', tags: ['repeat-customer'] },
  { externalId: 'demo-customer-02', name: 'Tanvir Ahmed', phone: '01812340002', city: 'Dhaka', address: 'Uttara Sector 9, Dhaka', tags: ['new'] },
  { externalId: 'demo-customer-03', name: 'Farzana Akter', phone: '01912340003', city: 'Gaibandha', address: 'Sadar, Gaibandha', tags: ['priority'] },
  { externalId: 'demo-customer-04', name: 'Sadia Rahman', phone: '01612340004', city: 'Chattogram', address: 'GEC Circle, Chattogram', tags: ['repeat-customer'] },
  { externalId: 'demo-customer-05', name: 'Rafiul Islam', phone: '01312340005', city: 'Rajshahi', address: 'Boalia, Rajshahi', tags: ['new'] },
  { externalId: 'demo-customer-06', name: 'Mehedi Hasan', phone: '01412340006', city: 'Narayanganj', address: 'Chashara, Narayanganj', tags: [] },
  { externalId: 'demo-customer-07', name: 'Sumaiya Sultana', phone: '01512340007', city: 'Sylhet', address: 'Zindabazar, Sylhet', tags: ['priority'] },
  { externalId: 'demo-customer-08', name: 'Imran Hossain', phone: '01712340008', city: 'Dhaka', address: 'Mirpur 10, Dhaka', tags: [] },
];
const orderSpecs: Array<{ status: OrderStatus; customer: number; product: number; quantity: number; method: PaymentMethod; payment: PaymentStatus; shipment?: ShipmentStatus }> = [
  { status: 'PENDING', customer: 0, product: 0, quantity: 1, method: 'BKASH', payment: 'REVIEW' },
  { status: 'CONFIRMED', customer: 1, product: 2, quantity: 2, method: 'COD', payment: 'PENDING' },
  { status: 'PROCESSING', customer: 2, product: 4, quantity: 3, method: 'NAGAD', payment: 'VERIFIED' },
  { status: 'PACKED', customer: 3, product: 1, quantity: 1, method: 'ROCKET', payment: 'VERIFIED' },
  { status: 'SHIPPED', customer: 4, product: 6, quantity: 1, method: 'COD', payment: 'PENDING', shipment: 'IN_TRANSIT' },
  { status: 'DELIVERED', customer: 5, product: 7, quantity: 1, method: 'BKASH', payment: 'VERIFIED', shipment: 'DELIVERED' },
  { status: 'CANCELLED', customer: 6, product: 3, quantity: 1, method: 'COD', payment: 'FAILED' },
  { status: 'CONFIRMED', customer: 7, product: 4, quantity: 2, method: 'NAGAD', payment: 'REVIEW' },
  { status: 'PROCESSING', customer: 0, product: 5, quantity: 1, method: 'BKASH', payment: 'VERIFIED' },
  { status: 'PACKED', customer: 2, product: 2, quantity: 1, method: 'COD', payment: 'PENDING' },
  { status: 'SHIPPED', customer: 1, product: 0, quantity: 1, method: 'COD', payment: 'PENDING', shipment: 'BOOKED' },
  { status: 'DELIVERED', customer: 3, product: 1, quantity: 2, method: 'BKASH', payment: 'VERIFIED', shipment: 'DELIVERED' },
];
const questions = [
  ['What are the delivery charges?', 'Delivery fees are illustrative defaults of ৳80 inside Dhaka and ৳150 outside Dhaka. Confirm the shop’s configured charge before placing an order.'],
  ['How do I confirm my bKash payment?', 'Please share your transaction reference. Our team must check it against an approved provider workflow or review it manually. A screenshot alone is not settlement proof.'],
  ['Can I return a product?', 'Our support team will review your request against the merchant’s current return policy.'],
  ['How long does delivery take?', 'Delivery time depends on destination and courier availability. Our team will confirm the current estimate before dispatch.'],
  ['Can I change my address?', 'Please contact the support team as soon as possible. Address changes may not be possible after a courier booking.'],
];
const demoConversations = [
  { platform: 'MESSENGER' as const, customer: 0, thread: 'MESSENGER:demo-sender-01', text: 'Panjabi ta ki size L available ache?', reply: 'Size L stock confirm kore apnake janacchi.' },
  { platform: 'INSTAGRAM' as const, customer: 1, thread: 'INSTAGRAM:demo-sender-02', text: 'Delivery charge Uttara te koto?', reply: 'Uttara delivery fee confirm kore bolchi.' },
  { platform: 'WHATSAPP' as const, customer: 2, thread: 'WHATSAPP:demo-sender-03', text: 'Payment korechi, check korben?', reply: 'Reference ta dile team review korbe.' },
  { platform: 'MESSENGER' as const, customer: 3, thread: 'MESSENGER:demo-sender-04', text: 'Kurti ta abar stock e ashbe?', reply: 'Stock update confirm kore janabo.' },
  { platform: 'INSTAGRAM' as const, customer: 4, thread: 'INSTAGRAM:demo-sender-05', text: 'Watch er real photo ache?', reply: 'Product details team share korbe.' },
  { platform: 'WHATSAPP' as const, customer: 5, thread: 'WHATSAPP:demo-sender-06', text: 'Order ta dispatch hoise?', reply: 'Order status team check korche.' },
  { platform: 'MESSENGER' as const, customer: 6, thread: 'MESSENGER:demo-sender-07', text: 'Return policy ta bolben?', reply: 'Policy review kore support team janabe.' },
  { platform: 'INSTAGRAM' as const, customer: 7, thread: 'INSTAGRAM:demo-sender-08', text: 'COD available?', reply: 'COD availability address onujayi confirm korte hobe.' },
  { platform: 'MESSENGER' as const, customer: 2, thread: 'MESSENGER:demo-sender-09', text: 'Hijab er olive colour ache?', reply: 'Olive stock check kore janacchi.' },
  { platform: 'WHATSAPP' as const, customer: 0, thread: 'WHATSAPP:demo-sender-10', text: 'Order e address change korte chai.', reply: 'Dispatch er age address change check korchi.' },
];

async function main() {
  if (!OWNER_EMAIL) throw new Error('Set DEMO_OWNER_EMAIL to the email address of an existing registered user. The seed never creates a predictable-password account.');
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) throw new Error(`No registered user found for ${OWNER_EMAIL}. Sign up first, then run this seed.`);

  const merchantSlug = `demo-workspace-${owner.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-12)}`;
  const merchant = await prisma.merchant.upsert({
    where: { slug: merchantSlug },
    update: { name: 'F-Commerce Demo Workspace', isDemo: true },
    create: { name: 'F-Commerce Demo Workspace', slug: merchantSlug, isDemo: true, currency: 'BDT', timezone: 'Asia/Dhaka', insideDhakaPaisa: 8000, outsideDhakaPaisa: 15000 },
  });
  await prisma.merchantMembership.upsert({ where: { merchantId_userId: { merchantId: merchant.id, userId: owner.id } }, update: { role: 'OWNER' }, create: { merchantId: merchant.id, userId: owner.id, role: 'OWNER' } });

  await prisma.aiPolicy.upsert({ where: { merchantId: merchant.id }, update: {}, create: {
    merchantId: merchant.id, enabled: false, language: 'Bangla + Banglish', tone: 'Warm and helpful',
    shippingPolicy: 'Illustrative defaults: ৳80 inside Dhaka and ৳150 outside. Confirm configured rate before quoting.',
    paymentPolicy: 'A screenshot alone never confirms settlement. Only an approved provider check or authorized human review can verify payment.',
    returnPolicy: 'Escalate return and refund cases for human review until the merchant policy is confirmed.', minConfidence: 0.78,
  } });
  for (const [question, answer] of questions) {
    const exists = await prisma.aiFaq.findFirst({ where: { merchantId: merchant.id, question } });
    if (!exists) await prisma.aiFaq.create({ data: { merchantId: merchant.id, question, answer, enabled: true } });
  }

  const integrationNames = ['META_MESSENGER','INSTAGRAM','WHATSAPP','BKASH','NAGAD','ROCKET','PATHAO','STEADFAST','SHIPROCKET','AI_PROVIDER'];
  await prisma.integrationConnection.createMany({ data: integrationNames.map(provider => ({ merchantId: merchant.id, provider, displayName: provider.replaceAll('_', ' '), status: 'NOT_CONNECTED' as const })), skipDuplicates: true });
  const channelIds = new Map<string, string>();
  for (const platform of ['MESSENGER','INSTAGRAM','WHATSAPP'] as const) {
    const externalAccountId = `DEMO-${merchant.id}-${platform}-ACCOUNT`;
    const channel = await prisma.channelConnection.upsert({
      where: { platform_externalAccountId: { platform, externalAccountId } },
      update: { displayName: `${platform} demonstration channel`, status: 'NOT_CONNECTED' },
      create: { merchantId: merchant.id, platform, externalAccountId, displayName: `${platform} demonstration channel`, status: 'NOT_CONNECTED', metadata: { demo: true } },
    });
    channelIds.set(platform, channel.id);
  }

  const productRows = [];
  for (const product of products) {
    const row = await prisma.product.upsert({ where: { merchantId_sku: { merchantId: merchant.id, sku: product.sku } }, update: { ...product, active: true }, create: { merchantId: merchant.id, ...product, active: true } });
    productRows.push(row);
    await prisma.inventoryMovement.upsert({ where: { id: `seed-inventory-${merchant.id}-${product.sku}` }, update: {}, create: { id: `seed-inventory-${merchant.id}-${product.sku}`, merchantId: merchant.id, productId: row.id, quantityDelta: product.stockQuantity, reason: 'Seeded demo opening stock', referenceType: 'Seed', referenceId: merchant.id, createdById: owner.id } }).catch(async (error: unknown) => {
      // Existing installations from an older seed may have an equivalent movement with generated ids.
      if ((error as { code?: string })?.code !== 'P2002') throw error;
    });
  }

  const customerRows = [];
  for (const customer of customers) {
    const row = await prisma.customer.upsert({
      where: { merchantId_externalId: { merchantId: merchant.id, externalId: customer.externalId } },
      update: { name: customer.name, phone: customer.phone, city: customer.city, address: customer.address, tags: customer.tags },
      create: { merchantId: merchant.id, ...customer },
    });
    customerRows.push(row);
  }

  const shipmentByOrder = new Map<number, { provider: string; status: ShipmentStatus; trackingCode: string }>([
    [4, { provider: 'STEADFAST', status: 'IN_TRANSIT', trackingCode: 'DEMO-SF-1005' }],
    [5, { provider: 'PATHAO', status: 'DELIVERED', trackingCode: 'DEMO-PTH-1006' }],
    [10, { provider: 'STEADFAST', status: 'BOOKED', trackingCode: 'DEMO-SF-1011' }],
    [11, { provider: 'PATHAO', status: 'DELIVERED', trackingCode: 'DEMO-PTH-1012' }],
  ]);
  for (let ix = 0; ix < orderSpecs.length; ix++) {
    const spec = orderSpecs[ix]!;
    const orderNumber = `DEMO-2026-${String(ix + 1).padStart(3, '0')}`;
    const product = productRows[spec.product]!;
    const customer = customerRows[spec.customer]!;
    const quantity = spec.quantity;
    const subtotalPaisa = product.sellPricePaisa * quantity;
    const shippingPaisa = ['Dhaka'].includes(customer.city ?? '') ? merchant.insideDhakaPaisa : merchant.outsideDhakaPaisa;
    const totalPaisa = subtotalPaisa + shippingPaisa;
    const order = await prisma.order.upsert({
      where: { merchantId_orderNumber: { merchantId: merchant.id, orderNumber } },
      update: {},
      create: {
        merchantId: merchant.id, orderNumber, customerId: customer.id, status: spec.status,
        subtotalPaisa, discountPaisa: 0, shippingPaisa, totalPaisa,
        shippingName: customer.name, shippingPhone: customer.phone!, shippingAddress: customer.address!, shippingCity: customer.city!,
        shippingPostalCode: customer.city === 'Dhaka' ? '1229' : undefined,
        notes: 'Seeded sample record; not a real customer order.',
        items: { create: [{ merchantId: merchant.id, productId: product.id, productName: product.name, sku: product.sku, quantity, unitPricePaisa: product.sellPricePaisa, lineTotalPaisa: subtotalPaisa }] },
        payment: { create: { merchantId: merchant.id, method: spec.method, status: spec.payment, amountPaisa: totalPaisa, reference: ['REVIEW','VERIFIED'].includes(spec.payment) ? `DEMO-${spec.method}-${String(ix + 1).padStart(5, '0')}` : undefined, verificationSource: spec.payment === 'VERIFIED' ? 'HUMAN_MANUAL' : undefined, reviewedById: spec.payment === 'VERIFIED' ? owner.id : undefined, reviewedAt: spec.payment === 'VERIFIED' ? new Date() : undefined } },
      },
    });
    const shipment = shipmentByOrder.get(ix);
    if (shipment) await prisma.shipment.upsert({
      where: { orderId: order.id }, update: {},
      create: { merchantId: merchant.id, orderId: order.id, provider: shipment.provider, status: shipment.status, trackingCode: shipment.trackingCode, consignmentId: shipment.trackingCode, bookedAt: new Date(), deliveredAt: shipment.status === 'DELIVERED' ? new Date() : undefined, lastProviderStatus: 'DEMO — not submitted to courier', metadata: { demo: true, providerConfirmed: false } },
    });
  }

  for (let ix = 0; ix < demoConversations.length; ix++) {
    const spec = demoConversations[ix]!;
    const customer = customerRows[spec.customer]!;
    const id = `${merchant.id}-demo-thread-${String(ix + 1).padStart(2, '0')}`;
    const conversation = await prisma.conversation.upsert({
      where: { merchantId_platform_externalThreadId: { merchantId: merchant.id, platform: spec.platform, externalThreadId: spec.thread } },
      update: { lastMessageAt: new Date(Date.now() - ix * 11 * 60_000), channelConnectionId: channelIds.get(spec.platform) },
      create: { id, merchantId: merchant.id, platform: spec.platform, externalThreadId: spec.thread, customerId: customer.id, channelConnectionId: channelIds.get(spec.platform), status: ix === 6 ? 'HUMAN_REVIEW' : ix === 4 ? 'PENDING' : 'OPEN', unread: ix % 3 === 0, lastMessageAt: new Date(Date.now() - ix * 11 * 60_000) },
    });
    await prisma.message.createMany({ skipDuplicates: true, data: [
      { id: `${conversation.id}-customer-message`, merchantId: merchant.id, conversationId: conversation.id, externalMessageId: `DEMO-MSG-C-${ix + 1}`, direction: 'INBOUND', text: spec.text, sentAt: new Date(Date.now() - ix * 11 * 60_000 - 60_000), deliveryStatus: 'DEMO' },
      { id: `${conversation.id}-seller-message`, merchantId: merchant.id, conversationId: conversation.id, externalMessageId: `DEMO-MSG-S-${ix + 1}`, direction: 'OUTBOUND', text: spec.reply, sentAt: new Date(Date.now() - ix * 11 * 60_000), deliveryStatus: 'DEMO' },
    ] });
  }

  for (const c of customerRows) {
    const aggregate = await prisma.order.aggregate({ where: { merchantId: merchant.id, customerId: c.id, status: { not: 'CANCELLED' } }, _sum: { totalPaisa: true } });
    await prisma.customer.update({ where: { id: c.id }, data: { lifetimePaisa: aggregate._sum.totalPaisa ?? 0 } });
  }
  await prisma.auditLog.create({ data: { merchantId: merchant.id, actorId: owner.id, action: 'demo.seeded', entityType: 'Merchant', entityId: merchant.id, details: { products: productRows.length, customers: customerRows.length, orders: orderSpecs.length, conversations: demoConversations.length } } });

  console.log(`Seeded demo workspace ${merchant.slug}`);
  console.log(`Products: ${productRows.length}; customers: ${customerRows.length}; orders: ${orderSpecs.length}; conversations: ${demoConversations.length}`);
  console.log('All demo transactions, references, and tracking codes are labeled DEMO; no external provider was contacted.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
