import type {
  ChannelResult,
  NotifiableOrder,
  NotificationChannel,
  NotificationEvent,
  RenderedMessage,
} from "../types";

/**
 * SMS — **stub. No message is sent to anybody.**
 *
 * There is no working free SMS provider behind this. Twilio's trial requires
 * every destination number to be verified by its owner first, which is not a
 * flow a delivery customer would ever complete, and the paid alternatives need
 * a billing account. Rather than wire a provider that cannot actually reach a
 * customer, this channel logs the exact message it would have sent and reports
 * `delivered: false`.
 *
 * That honesty is the point. A stub that returned `delivered: true` would put
 * "SMS sent" in front of an operator for a message that never left the process,
 * and the first anyone would know is a customer saying they were never told.
 *
 * Swapping it for a real provider is one class: implement `NotificationChannel`
 * with the same three methods, POST to the provider in `send`, and register it
 * in `channels()` in `../index.ts` instead of this. Nothing in the order code
 * changes.
 */
export class SmsStubChannel implements NotificationChannel {
  readonly name = "sms" as const;

  /**
   * True — the stub is installed and can run.
   *
   * `isConfigured` answers "can this channel do its job", not "does it deliver".
   * Returning false would make the dispatcher skip `send` entirely, and the
   * stub would never log the message it would have sent — which is the only
   * useful thing it does. The honesty lives in `delivered: false` and the STUB
   * label on every result, not in pretending the channel is absent.
   */
  isConfigured(): boolean {
    return true;
  }

  async send(
    order: NotifiableOrder,
    event: NotificationEvent,
    message: RenderedMessage,
  ): Promise<ChannelResult> {
    const phone = order.customer.phone;

    if (!phone) {
      return {
        channel: "sms",
        delivered: false,
        reference: null,
        detail: "STUB — customer has no phone number on file",
      };
    }

    console.info(
      `[sms:STUB — NOT SENT] to=${maskPhone(phone)} order=${order.orderNumber} ` +
        `event=${event.type} body=${JSON.stringify(message.sms)}`,
    );

    return {
      channel: "sms",
      delivered: false,
      reference: null,
      detail: "STUB — logged only, no SMS provider is configured",
    };
  }
}

/** Keeps a full phone number out of the logs while leaving it recognisable. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}
