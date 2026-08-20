import { ResendEmailChannel } from "./channels/email-resend";
import { SmsStubChannel } from "./channels/sms-stub";
import { renderMessage } from "./templates";
import type {
  ChannelResult,
  NotifiableOrder,
  NotificationChannel,
  NotificationEvent,
  NotificationOutcome,
} from "./types";

export type * from "./types";
export { renderMessage, describeStatus, trackingUrl } from "./templates";

/**
 * The notification service.
 *
 * Order code calls `notify(order, event)`. It does not know which channels
 * exist, whether any is configured, or whether they succeeded — adding a
 * channel is a new `NotificationChannel` in the list below and nothing else.
 */

let registry: NotificationChannel[] = [
  new ResendEmailChannel(),
  new SmsStubChannel(),
];

export function channels(): readonly NotificationChannel[] {
  return registry;
}

/** Replaces the channel list. Used by tests and by any future wiring. */
export function setChannels(next: NotificationChannel[]): void {
  registry = next;
}

/**
 * Delivers one event over every registered channel.
 *
 * **This function never throws.** A notification is a side effect of an order
 * operation, not part of it: by the time it runs the status change is already
 * committed, so letting a provider outage surface as a failed request would
 * make an agent retry a transition that already succeeded and put a duplicate
 * entry in the audit trail for one real event.
 *
 * Channels run in parallel and are settled independently, so a slow SMS
 * provider cannot delay an email that is already sent, and one channel failing
 * has no effect on the others.
 */
export async function notify(
  order: NotifiableOrder,
  event: NotificationEvent,
): Promise<NotificationOutcome> {
  const outcome: NotificationOutcome = {
    orderNumber: order.orderNumber,
    event: event.type,
    results: [],
  };

  try {
    const message = renderMessage(order, event);

    const settled = await Promise.allSettled(
      registry.map(async (channel): Promise<ChannelResult> => {
        if (!channel.isConfigured()) {
          // The summary line below reports this, so it is visible without
          // being logged twice.
          return {
            channel: channel.name,
            delivered: false,
            reference: null,
            detail: `${channel.name} channel is not configured`,
          };
        }
        return channel.send(order, event, message);
      }),
    );

    outcome.results = settled.map((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : {
            channel: registry[index].name,
            delivered: false,
            reference: null,
            detail: `Channel threw: ${
              result.reason instanceof Error
                ? result.reason.message
                : "unknown error"
            }`,
          },
    );

    for (const result of outcome.results) {
      const state = result.delivered ? "sent" : "not sent";
      console.info(
        `[notify:${event.type}] ${order.orderNumber} → ${order.status} · ${result.channel} ${state} — ${result.detail}`,
      );
    }
  } catch (error) {
    // Rendering itself failed. Still not the caller's problem.
    console.error(`[notify:${event.type}] ${order.orderNumber} failed`, error);
  }

  return outcome;
}

/** True when at least one channel actually delivered. Never assumed. */
export function wasDelivered(outcome: NotificationOutcome): boolean {
  return outcome.results.some((result) => result.delivered);
}
