/**
 * The low-level Resend call, shared by every email this app sends.
 *
 * `ResendEmailChannel` (order notifications) and the password-reset email both
 * need the same thing — POST to Resend, bound by a timeout, translate the
 * response into a result nobody has to guess at — so it lives here once rather
 * than being copied. Neither caller talks to `fetch` directly.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * A provider call sits on the request path of whatever triggered it — a status
 * update, a password-reset request. Bounded so a hanging endpoint delays that
 * response by seconds, not minutes.
 */
const TIMEOUT_MS = 8000;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  delivered: boolean;
  reference: string | null;
  detail: string;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendViaResend(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { delivered: false, reference: null, detail: "RESEND_API_KEY is not set" };
  }
  if (!input.to) {
    return { delivered: false, reference: null, detail: "No recipient email address" };
  }

  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "onboarding@resend.dev";
  const fromName = process.env.EMAIL_FROM_NAME || "Last-Mile Delivery";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The body carries the provider's reason; it is worth keeping, but the
      // API key must never end up in a log line.
      const detail = await response.text().catch(() => "");
      return {
        delivered: false,
        reference: null,
        detail: `Resend responded ${response.status}: ${detail.slice(0, 300)}`,
      };
    }

    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, reference: payload.id ?? null, detail: "Accepted by Resend" };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      delivered: false,
      reference: null,
      detail: aborted
        ? `Resend did not respond within ${TIMEOUT_MS}ms`
        : `Resend request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
