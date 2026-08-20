import type {
  Notifier,
  OrderNotification,
  NotificationResult,
} from "./types";

export type * from "./types";

/**
 * Phase 5 adapter: records the notification and reports it as undelivered.
 *
 * It returns `delivered: false` rather than pretending, so nothing downstream
 * can mistake "wired up" for "the customer was told". Phase 6 replaces this
 * with a provider-backed implementation of the same interface.
 */
export class ConsoleNotifier implements Notifier {
  async send(notification: OrderNotification): Promise<NotificationResult> {
    const { type, recipient, orderNumber, status, message } = notification;

    console.info(
      `[notify:${type}] ${orderNumber} → ${status} → ${recipient.email}` +
        (message ? ` — ${message}` : ""),
    );

    return {
      delivered: false,
      reference: null,
      detail: "No delivery channel configured yet (Phase 6)",
    };
  }
}

let notifier: Notifier = new ConsoleNotifier();

export function getNotifier(): Notifier {
  return notifier;
}

/** Swaps the adapter — used by Phase 6 wiring and by tests. */
export function setNotifier(next: Notifier): void {
  notifier = next;
}

/**
 * Sends without ever failing the caller.
 *
 * Notification is a side effect of a status change, not part of it. The
 * transition is already committed by the time this runs, so a provider outage
 * must not surface as a failed status update — the agent would retry a
 * transition that already succeeded, and the audit trail would gain a
 * duplicate entry for one real event.
 */
export async function notifySafely(
  notification: OrderNotification,
): Promise<NotificationResult> {
  try {
    return await getNotifier().send(notification);
  } catch (error) {
    console.error("[notify] delivery failed", {
      type: notification.type,
      orderNumber: notification.orderNumber,
      error,
    });
    return {
      delivered: false,
      reference: null,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
