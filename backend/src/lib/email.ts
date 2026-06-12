/**
 * Email provider abstraction for magic-link delivery.
 *
 * Selection is driven by env (emailProviderFromEnv):
 * - ENVIRONMENT="production" -> Resend only; console can never run there.
 * - EMAIL_PROVIDER="console"  -> ConsoleEmailProvider in dev/test only (logs the
 *   message instead of sending - the magic link lands in `wrangler tail` /
 *   local logs so the flow is testable without an email account).
 * - RESEND_API_KEY set (and EMAIL_PROVIDER unset or "resend")
 *   -> ResendEmailProvider over plain HTTP (no SDK).
 * - dev/test with neither set -> ConsoleEmailProvider.
 * - anything else -> null; callers answer 503 (misconfig is loud, never an
 *   open fail and never a silent drop).
 */

import { logEvent } from "./log";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  /** Rejects on delivery failure - callers decide whether that is fatal. */
  send(message: EmailMessage): Promise<void>;
}

export const DEFAULT_EMAIL_FROM = "Festra <auth@festra.au>";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend (https://resend.com) via raw fetch - no SDK in the worker. */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`resend_send_failed ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}

/**
 * Dev stub: logs the full message (including the magic link) instead of
 * sending. Deliberately the only place a plaintext token may reach a log -
 * select it only via EMAIL_PROVIDER="console" in local/dev configs.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    logEvent("email_console_send", {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

type EmailEnv = {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  ENVIRONMENT?: string;
};

/** Pick the provider from env, or null when none is usable (callers 503). */
export function emailProviderFromEnv(env: EmailEnv): EmailProvider | null {
  if (env.ENVIRONMENT === "production") {
    if (!env.RESEND_API_KEY) return null;
    if (env.EMAIL_PROVIDER !== undefined && env.EMAIL_PROVIDER !== "resend") return null;
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM);
  }
  if (env.EMAIL_PROVIDER === "console") return new ConsoleEmailProvider();
  if (env.EMAIL_PROVIDER !== undefined && env.EMAIL_PROVIDER !== "resend") return null;
  if (env.RESEND_API_KEY) {
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM);
  }
  return env.EMAIL_PROVIDER === "resend" ? null : new ConsoleEmailProvider();
}
