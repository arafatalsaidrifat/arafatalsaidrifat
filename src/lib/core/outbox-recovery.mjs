/**
 * Decide how to recover a stale outbound provider job after a worker crash.
 * SENDING is intentionally ambiguous: the provider may have accepted the request.
 */
export function staleSendRecovery(deliveryStatus) {
  switch (String(deliveryStatus ?? '').toUpperCase()) {
    case 'SENT': return { action: 'complete', messageStatus: 'SENT', retry: false };
    case 'QUEUED':
    case 'RETRYABLE': return { action: 'retry', messageStatus: deliveryStatus, retry: true };
    case 'SENDING': return { action: 'mark_unknown', messageStatus: 'UNKNOWN', retry: false };
    case 'UNKNOWN':
    case 'FAILED': return { action: 'stop', messageStatus: deliveryStatus, retry: false };
    default: return { action: 'stop', messageStatus: String(deliveryStatus ?? ''), retry: false };
  }
}
