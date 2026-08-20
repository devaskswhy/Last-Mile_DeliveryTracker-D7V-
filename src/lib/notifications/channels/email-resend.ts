import type {
  ChannelResult,
  NotifiableOrder,
  NotificationChannel,
  NotificationEvent,
  RenderedMessage,
} from "../types";
import { isResendConfigured, sendViaResend } from "./resend-client";

/**
 * Order-notification email, via Resend.
 *
 * Chosen over Nodemailer + Gmail because Resend is an HTTP API: it needs
 * nothing but `fetch`, so it adds **no dependency** to a project that keeps its
 * package list deliberately short. Nodemailer would have meant a new package
 * plus SMTP behaviour, connection pooling and Gmail app-password setup, all to
 * do the same job.
 *
 * The actual HTTP call lives in `resend-client.ts`, shared with the
 * password-reset email — this class only adapts the `NotificationChannel`
 * shape to it.
 *
 * Requires `RESEND_API_KEY`. Without it the channel reports itself
 * unconfigured and the dispatcher logs the message instead — it never claims a
 * send that did not happen.
 */
export class ResendEmailChannel implements NotificationChannel {
  readonly name = "email" as const;

  isConfigured(): boolean {
    return isResendConfigured();
  }

  async send(
    order: NotifiableOrder,
    _event: NotificationEvent,
    message: RenderedMessage,
  ): Promise<ChannelResult> {
    if (!this.isConfigured()) {
      return {
        channel: "email",
        delivered: false,
        reference: null,
        detail: "RESEND_API_KEY is not set",
      };
    }

    const result = await sendViaResend({
      to: order.customer.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    return { channel: "email", ...result };
  }
}
