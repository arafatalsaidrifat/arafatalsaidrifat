const MAP = [
  [/\b(return|returned|rto)\b/, 'RETURNED'],
  [/\b(cancel|cancelled|canceled)\b/, 'CANCELLED'],
  [/\bundelivered\b|\bnot delivered\b/, null],
  [/\bdelivered\b/, 'DELIVERED'],
  [/\b(pickup|picked up|pickedup)\b/, 'PICKED_UP'],
  [/\b(transit|in transit|out for delivery|shipped)\b/, 'IN_TRANSIT'],
  [/\b(book|booked|success|created|manifest|awb assigned|label generated|pending|processing)\b/, 'BOOKED'],
];
export function normalizeShipmentStatus(value) {
  const normalized = String(value ?? '').toLocaleLowerCase('en').replace(/[_-]+/g, ' ').trim();
  if (!normalized) throw new Error('Courier did not provide a current shipment status. Local status was not changed.');
  for (const [pattern, status] of MAP) {
    if (pattern.test(normalized)) {
      if (!status) throw new Error(`Courier returned an ambiguous status: ${value}. Local status was not changed.`);
      return status;
    }
  }
  throw new Error(`Unrecognized courier status "${value}". Local status was not changed.`);
}
