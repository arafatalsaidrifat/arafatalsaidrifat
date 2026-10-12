type AccountEmail = {
  to: string;
  subject: string;
  action: string;
  url: string;
};

export function accountEmailIsConfigured() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  const sender = process.env.AUTH_EMAIL_FROM?.trim() ?? '';
  const address = sender.match(/<([^<>]+)>/)?.[1] ?? sender;
  return Boolean(
    apiKey &&
    !/^(replace|change|example|placeholder)/i.test(apiKey) &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) &&
    !/(example\.com|placeholder|your-domain)/i.test(address),
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

export async function sendAccountEmail({ to, subject, action, url }: AccountEmail) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error('Account email delivery is not configured.');

  const appOrigin = new URL(process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:3000').origin;
  const actionUrl = new URL(url);
  if (actionUrl.origin !== appOrigin) throw new Error('Account email link origin does not match the configured application.');

  const safeUrl = escapeHtml(actionUrl.toString());
  const safeAction = escapeHtml(action);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: `<p>${safeAction} for your F-Commerce OS account:</p><p><a href="${safeUrl}">${safeAction}</a></p><p>If you did not request this, you can ignore this email.</p>`,
      text: `${action} for your F-Commerce OS account: ${actionUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });

  if (!response.ok) throw new Error(`Account email delivery failed with HTTP ${response.status}.`);
}
