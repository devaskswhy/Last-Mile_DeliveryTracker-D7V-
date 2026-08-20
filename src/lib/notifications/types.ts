import type { OrderStatus } from "@/lib/domain/enums";

/**
 * Notification contract.
 *
 * Order code calls `notify(order, event)` and knows nothing else — not which
 * channels exist, not whether any of them is configured, not whether they
 * succeeded. Adding SMS, push or a webhook is a new `NotificationChannel`
 * registered in one place, with no edit to the order logic.
 */

/** What happened. The payload carries whatever the message needs to say. */
export type NotificationEvent =
  | { type: "ORDER_CREATED" }
  | { type: "STATUS_CHANGED"; from: OrderStatus | null }
  | { type: "DELIVERY_FAILED"; reason: string | null }
  | {
      type: "DELIVERY_RESCHEDULED";
      scheduledFor: Date;
      attemptNumber: number;
    }
  | { type: "ORDER_REASSIGNED"; previousAgent: string | null };

export type NotificationEventType = NotificationEvent["type"];

/** The slice of an order a message needs. Deliberately small. */
export interface NotifiableOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: {
    id: string;
    name: string;
    email: string;
    /** Nullable — registration does not require one, so SMS may be skipped. */
    phone?: string | null;
  };
  agent?: { name: string; employeeCode: string } | null;
}

export type ChannelName = "email" | "sms";

export interface ChannelResult {
  channel: ChannelName;
  /** True only when a provider actually accepted the message. */
  delivered: boolean;
  /** Provider-side id when there is one; null otherwise. */
  reference: string | null;
  /** Why it was not delivered, or which provider took it. */
  detail: string;
}

/** A rendered message. Channels take what they need and ignore the rest. */
export interface RenderedMessage {
  subject: string;
  html: string;
  text: string;
  /** Short form for character-limited channels. */
  sms: string;
}

export interface NotificationChannel {
  readonly name: ChannelName;
  /** False when the channel has no credentials — reported, never faked. */
  isConfigured(): boolean;
  send(
    order: NotifiableOrder,
    event: NotificationEvent,
    message: RenderedMessage,
  ): Promise<ChannelResult>;
}

export interface NotificationOutcome {
  orderNumber: string;
  event: NotificationEventType;
  results: ChannelResult[];
}
