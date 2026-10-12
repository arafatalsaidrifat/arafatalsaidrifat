import { NextResponse } from 'next/server';
export function jsonError(message: string, status=400, code='BAD_REQUEST') {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control':'no-store' } });
}
export async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > 1_000_000) throw new Error('Payload exceeds 1 MB.');
  return await request.json() as T;
}
export function noStoreJson(body: unknown, status=200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control':'no-store, private' } });
}
export function safeString(value: unknown, max=500) { return String(value ?? '').trim().slice(0,max); }
