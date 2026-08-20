import type {
  NotifiableOrder,
  NotificationEvent,
  RenderedMessage,
} from "./types";

/**
 * Message templates, one per event.
 *
 * Pure: order and event in, strings out. No I/O, so the wording is unit-tested
 * without a provider.
 */

/**
 * Escapes text before it goes into HTML.
 *
 * This is not decorative. A failure reason is typed by an agent and a note is
 * typed by a customer, and both land in an email body — unescaped, `<img
 * onerror=...>` in a delivery note becomes script running in whatever renders
 * the mail. Every interpolated value below is escaped, including ones that look
 * safe today.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Human wording for a status code. */
const STATUS_WORDING: Record<string, string> = {
  CREATED: "Order created",
  ASSIGNED: "Assigned to a delivery agent",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery attempt failed",
  CANCELLED: "Cancelled",
};

export function describeStatus(status: string): string {
  return STATUS_WORDING[status] ?? status;
}

export function trackingUrl(orderId: string): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}/orders/${orderId}`;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

interface Parts {
  subject: string;
  headline: string;
  body: string[];
  sms: string;
}

function partsFor(order: NotifiableOrder, event: NotificationEvent): Parts {
  const number = order.orderNumber;

  switch (event.type) {
    case "ORDER_CREATED":
      return {
        subject: `Order ${number} confirmed`,
        headline: "Your order is confirmed",
        body: [
          `We have received order ${number}.`,
          order.agent
            ? `${order.agent.name} has been assigned to collect it.`
            : "We are assigning a delivery agent and will let you know shortly.",
        ],
        sms: `Order ${number} confirmed. Track: ${trackingUrl(order.id)}`,
      };

    case "STATUS_CHANGED":
      return {
        subject: `Order ${number}: ${describeStatus(order.status)}`,
        headline: describeStatus(order.status),
        body: [
          `Order ${number} is now "${describeStatus(order.status)}".`,
          ...(order.agent
            ? [`Your delivery agent is ${order.agent.name}.`]
            : []),
        ],
        sms: `Order ${number}: ${describeStatus(order.status)}. ${trackingUrl(order.id)}`,
      };

    case "DELIVERY_FAILED":
      return {
        subject: `Order ${number}: delivery attempt failed`,
        headline: "We could not complete this delivery",
        body: [
          `We tried to deliver order ${number} but could not complete it.`,
          event.reason ? `Reason given: ${event.reason}` : "",
          "You can choose a new delivery date from the tracking page.",
        ].filter(Boolean),
        sms: `Order ${number}: delivery failed${event.reason ? ` (${event.reason})` : ""}. Rebook: ${trackingUrl(order.id)}`,
      };

    case "DELIVERY_RESCHEDULED":
      return {
        subject: `Order ${number}: rescheduled for ${formatDate(event.scheduledFor)}`,
        headline: "Your delivery has been rescheduled",
        body: [
          `Order ${number} is booked for ${formatDate(event.scheduledFor)} (attempt ${event.attemptNumber}).`,
          order.agent
            ? `${order.agent.name} will deliver it.`
            : "We are assigning an agent and will confirm shortly.",
        ],
        sms: `Order ${number} rescheduled for ${formatDate(event.scheduledFor)}. ${trackingUrl(order.id)}`,
      };

    case "ORDER_REASSIGNED":
      return {
        subject: `Order ${number}: a new agent is handling your delivery`,
        headline: "Your delivery agent has changed",
        body: [
          order.agent
            ? `Order ${number} is now with ${order.agent.name}.`
            : `Order ${number} is being reassigned.`,
          event.previousAgent
            ? `It was previously with ${event.previousAgent}.`
            : "",
        ].filter(Boolean),
        sms: `Order ${number}: now with ${order.agent?.name ?? "a new agent"}. ${trackingUrl(order.id)}`,
      };
  }
}

export function renderMessage(
  order: NotifiableOrder,
  event: NotificationEvent,
): RenderedMessage {
  const parts = partsFor(order, event);
  const url = trackingUrl(order.id);

  const paragraphs = parts.body
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f6f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">
      <tr><td>
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666">Last-Mile Delivery</p>
        <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(parts.headline)}</h1>
        ${paragraphs}
        <p style="margin:0 0 8px"><strong>Order:</strong> ${escapeHtml(order.orderNumber)}</p>
        <p style="margin:0 0 20px"><strong>Status:</strong> ${escapeHtml(describeStatus(order.status))}</p>
        <p style="margin:0 0 20px">
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Track this order</a>
        </p>
        <p style="margin:0;font-size:12px;color:#666">${escapeHtml(url)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    parts.headline,
    "",
    ...parts.body,
    "",
    `Order: ${order.orderNumber}`,
    `Status: ${describeStatus(order.status)}`,
    `Track: ${url}`,
  ].join("\n");

  return { subject: parts.subject, html, text, sms: parts.sms };
}
