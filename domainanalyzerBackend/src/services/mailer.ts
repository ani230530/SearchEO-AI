// Transactional email via Resend. Works on Render / serverless without the
// outbound-SMTP gymnastics Gmail requires.
//
// Two failure modes are surfaced loudly:
//   - missing RESEND_API_KEY at boot → authEnv validator throws
//   - send failure at runtime → logged + URL printed to stdout so the
//     dev can still complete the flow when the email provider is flaky

import { Resend } from 'resend';
import { authEnv } from '../config/authEnv';

let cached: Resend | null = null;
function client(): Resend {
  if (!cached) cached = new Resend(authEnv.RESEND_API_KEY);
  return cached;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  // Optional plain-text fallback. Most inboxes synthesize one from HTML
  // but providing it improves deliverability.
  text?: string;
}

export async function sendMail({ to, subject, html, text }: SendArgs): Promise<void> {
  const from = authEnv.EMAIL_FROM;
  if (!from) {
    throw new Error('[mailer] EMAIL_FROM is not configured');
  }
  const result = await client().emails.send({ from, to, subject, html, text });
  if (result.error) {
    // Resend returns errors in-band rather than throwing.
    throw new Error(`[mailer] Resend rejected the send: ${result.error.message}`);
  }
}
