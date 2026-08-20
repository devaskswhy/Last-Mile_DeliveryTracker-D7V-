import type {
  ChannelResult,
  NotifiableOrder,
  NotificationChannel,
  NotificationEvent,
  RenderedMessage,
} from "../types";
import { isSmtpConfigured, sendViaSmtp } from "./smtp-client";

/**
 * Order-notification email, via SMTP (a Gmail account + app password).
 *
 * The actual send lives in `smtp-client.ts`, shared with the password-reset
 * email — this class only adapts the `NotificationChannel` shape to it. See
 * that file for why SMTP rather than Resend.
 */
export class SmtpEmailChannel implements NotificationChannel {
  readonly name = "email" as const;

  isConfigured(): boolean {
    return isSmtpConfigured();
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
        detail: "SMTP_USER / SMTP_PASS are not set",
      };
    }

    const result = await sendViaSmtp({
      to: order.customer.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    return { channel: "email", ...result };
  }
}
