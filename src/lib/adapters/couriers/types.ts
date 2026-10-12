export type CourierOrderInput = {
  orderNumber:string; recipientName:string; recipientPhone:string; recipientAddress:string;
  recipientCity:string; recipientPostalCode?:string; description:string; quantity:number; weightKg:number; codTaka:number; orderTotalTaka:number; paymentMethod:'COD'|'PREPAID';
};
export type CourierBooking = { provider:string; consignmentId:string; trackingCode:string; raw:unknown };
export interface CourierAdapter {
  isConfigured(): boolean;
  createBooking(input:CourierOrderInput):Promise<CourierBooking>;
  getStatus(reference:string):Promise<{status:string;raw:unknown}>;
}
export class ProviderNotConfiguredError extends Error {
  constructor(provider:string){super(`${provider} is not configured. Add approved credentials to the server environment first.`);this.name='ProviderNotConfiguredError';}
}
export function assertProviderUrl(raw:string):URL {
  let url:URL;
  try { url=new URL(raw); } catch { throw new Error('Provider URL is invalid.'); }
  if (url.username || url.password) throw new Error('Provider URLs must not contain embedded credentials.');
  if (!['https:','http:'].includes(url.protocol)) throw new Error('Provider URL must use HTTP or HTTPS.');
  if (process.env.NODE_ENV==='production' && url.protocol!=='https:') throw new Error('Provider integrations require HTTPS in production.');
  return url;
}
export async function providerFetch(rawUrl:string, init:RequestInit, timeoutMs=12_000) {
  const url=assertProviderUrl(rawUrl);
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try { return await fetch(url.toString(),{...init,signal:controller.signal,cache:'no-store',redirect:'error'}); }
  finally { clearTimeout(timeout); }
}
