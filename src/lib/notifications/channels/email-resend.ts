import type {
  ChannelResult,
  NotifiableOrder,
  NotificationChannel,
  NotificationEvent,
  RenderedMessage,
} from "../types";

/**
 * Email via Resend.
 *
 * Chosen over Nodemailer + Gmail because Resend is an HTTP API: it needs
 * nothing but `fetch`, so it adds **no dependency** to a project that keeps its
 * package list deliberately short. Nodemailer would have meant a new package
 * plus SMTP behaviour, connection pooling and Gmail app-password setup, all to
 * do the same job.
 *
 * Requires `RESEND_API_KEY`. Without it the channel reports itself
 * unconfigured and the dispatcher logs the message instead — it never claims a
 * send that did not happen.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * A provider is a network call on the request path of a status update. Bounded
 * so a hanging endpoint delays the agent's response by seconds, not minutes.
 */
const TIMEOUT_MS = 8000;

export class ResendEmailChannel implements NotificationChannel {
  readonly name = "email" as const;

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  async send(
    order: NotifiableOrder,
    _event: NotificationEvent,
    message: RenderedMessage,
  ): Promise<ChannelResult> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return {
        channel: "email",
        delivered: false,
        reference: null,
        detail: "RESEND_API_KEY is not set",
      };
    }

    if (!order.customer.email) {
      return {
        channel: "email",
        delivered: false,
        reference: null,
        detail: "Customer has no email address",
      };
    }

    const fromAddress =
      process.env.EMAIL_FROM_ADDRESS || "onboarding@resend.dev";
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
          to: [order.customer.email],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // The body carries the provider's reason; it is worth keeping, but the
        // API key must never end up in a log line.
        const detail = await response.text().catch(() => "");
        return {
          channel: "email",
          delivered: false,
          reference: null,
          detail: `Resend responded ${response.status}: ${detail.slice(0, 300)}`,
        };
      }

      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
      };

      return {
        channel: "email",
        delivered: true,
        reference: payload.id ?? null,
        detail: "Accepted by Resend",
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        channel: "email",
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
}
