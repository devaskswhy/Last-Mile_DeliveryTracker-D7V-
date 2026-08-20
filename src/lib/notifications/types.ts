import type { OrderStatus } from "@/lib/domain/enums";

/**
 * The notification seam.
 *
 * Phase 5 wires the interface and calls it at every point a customer should
 * hear something; Phase 6 supplies an adapter that actually sends email. The
 * split matters because the call sites are the hard part to get right — *when*
 * to notify, and what the message needs to know — while swapping a console
 * logger for an email provider is a single new implementation of `Notifier`.
 */

export type NotificationType =
  /** Any forward movement: picked up, in transit, out for delivery, delivered. */
  | "ORDER_STATUS_CHANGED"
  /** A delivery attempt failed; the customer needs to pick a new date. */
  | "DELIVERY_FAILED"
  /** A new attempt has been scheduled. */
  | "DELIVERY_RESCHEDULED";

export interface NotificationRecipient {
  userId: string;
  name: string;
  email: string;
}

export interface OrderNotification {
  type: NotificationType;
  recipient: NotificationRecipient;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  previousStatus: OrderStatus | null;
  /** Free text shown to the customer — the failure reason, or a status note. */
  message?: string | null;
  /** Set on DELIVERY_RESCHEDULED. */
  scheduledFor?: Date | null;
  attemptNumber?: number | null;
  occurredAt: Date;
}

export interface NotificationResult {
  delivered: boolean;
  /** Identifier from the provider once one exists; null while unsent. */
  reference: string | null;
  detail?: string;
}

export interface Notifier {
  send(notification: OrderNotification): Promise<NotificationResult>;
}
