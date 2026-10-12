export function idempotencyKey(request:Request) {
  const supplied=request.headers.get('idempotency-key')?.trim();
  if (!supplied) throw new Error('This operation requires an Idempotency-Key header.');
  if (supplied.length<8 || supplied.length>180 || /[^a-zA-Z0-9:_-]/.test(supplied)) throw new Error('Idempotency-Key must be 8–180 letters, digits, colon, underscore or hyphen characters.');
  return supplied;
}
