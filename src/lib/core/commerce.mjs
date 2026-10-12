export const ORDER_STAGES = Object.freeze(['PENDING','CONFIRMED','PROCESSING','PACKED','SHIPPED','DELIVERED','CANCELLED']);
const NEXT = Object.freeze({
  PENDING: ['CONFIRMED','CANCELLED'],
  CONFIRMED: ['PROCESSING','CANCELLED'],
  PROCESSING: ['PACKED','CANCELLED'],
  PACKED: ['SHIPPED','CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
});
export function validOrderTransition(from, to) {
  if (!ORDER_STAGES.includes(from) || !ORDER_STAGES.includes(to)) return { ok:false, reason:'Unknown order status.' };
  if (from === to) return { ok:true, reason:null };
  return NEXT[from].includes(to) ? {ok:true, reason:null} : {ok:false, reason:`Cannot move an order from ${from} to ${to}.`};
}
export function calculateOrderTotal({items, discountPaisa=0, shippingPaisa=0}) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one order item is required.');
  const subtotalPaisa = items.reduce((sum,item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('Quantity must be a positive integer.');
    if (!Number.isSafeInteger(item.unitPricePaisa) || item.unitPricePaisa < 0) throw new Error('Price must be a non-negative integer in poisha.');
    const line = item.quantity * item.unitPricePaisa;
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(sum + line)) throw new Error('Order subtotal exceeds safe integer range.');
    return sum + line;
  },0);
  if (!Number.isSafeInteger(discountPaisa) || discountPaisa < 0 || discountPaisa > subtotalPaisa) throw new Error('Discount is invalid.');
  if (!Number.isSafeInteger(shippingPaisa) || shippingPaisa < 0) throw new Error('Shipping fee is invalid.');
  const totalPaisa = subtotalPaisa - discountPaisa + shippingPaisa;
  if (!Number.isSafeInteger(totalPaisa)) throw new Error('Order total exceeds safe integer range.');
  return { subtotalPaisa, discountPaisa, shippingPaisa, totalPaisa };
}
export function shippingFeePaisa(city, insideDhakaPaisa=8000, outsideDhakaPaisa=15000) {
  const normalized = String(city ?? '').trim().toLocaleLowerCase('en');
  return ['dhaka','ঢাকা','dhaka city','ঢাকা শহর'].includes(normalized) ? insideDhakaPaisa : outsideDhakaPaisa;
}
export function duplicateReferenceKey(merchantId, method, reference) {
  const clean = String(reference ?? '').trim().toUpperCase().replace(/\s+/g,'');
  return clean ? `${merchantId}:${method}:${clean}` : null;
}
export function safeProviderName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,50);
}
