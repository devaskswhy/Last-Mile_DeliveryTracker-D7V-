import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SmsStubChannel } from "./channels/sms-stub";
import { notify, setChannels, wasDelivered } from "./index";
import { escapeHtml, renderMessage, trackingUrl } from "./templates";
import type {
  ChannelResult,
  NotifiableOrder,
  NotificationChannel,
  NotificationEvent,
} from "./types";

const ORDER: NotifiableOrder = {
  id: "order-123",
  orderNumber: "LM-20260820-ABC123",
  status: "OUT_FOR_DELIVERY",
  customer: {
    id: "cus-1",
    name: "Priya Nair",
    email: "priya@example.com",
    phone: "+91 90000 12345",
  },
  agent: { name: "Asha Rane", employeeCode: "AGT-001" },
};

/** Records what it was asked to send; never touches a network. */
class RecordingChannel implements NotificationChannel {
  readonly name = "email" as const;
  sent: Array<{ subject: string; html: string }> = [];
  constructor(private readonly configured = true) {}
  isConfigured() {
    return this.configured;
  }
  async send(
    _order: NotifiableOrder,
    _event: NotificationEvent,
    message: { subject: string; html: string },
  ): Promise<ChannelResult> {
    this.sent.push({ subject: message.subject, html: message.html });
    return {
      channel: "email",
      delivered: true,
      reference: "rec-1",
      detail: "recorded",
    };
  }
}

class ThrowingChannel implements NotificationChannel {
  readonly name = "sms" as const;
  isConfigured() {
    return true;
  }
  async send(): Promise<ChannelResult> {
    throw new Error("provider exploded");
  }
}

describe("templates", () => {
  it("escapes HTML so user text cannot inject markup", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s");
  });

  it("escapes a failure reason before it reaches the email body", () => {
    // An agent types this into the failure-reason box.
    const message = renderMessage(ORDER, {
      type: "DELIVERY_FAILED",
      reason: `<script>alert("xss")</script>`,
    });

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("includes the order number, status and tracking link", () => {
    const message = renderMessage(ORDER, { type: "STATUS_CHANGED", from: "IN_TRANSIT" });

    expect(message.subject).toContain("LM-20260820-ABC123");
    expect(message.html).toContain("LM-20260820-ABC123");
    expect(message.html).toContain("Out for delivery");
    expect(message.html).toContain(trackingUrl(ORDER.id));
    expect(message.text).toContain(trackingUrl(ORDER.id));
  });

  it("renders every event type without throwing", () => {
    const events: NotificationEvent[] = [
      { type: "ORDER_CREATED" },
      { type: "STATUS_CHANGED", from: "ASSIGNED" },
      { type: "DELIVERY_FAILED", reason: "Nobody home" },
      { type: "DELIVERY_RESCHEDULED", scheduledFor: new Date("2026-09-01"), attemptNumber: 2 },
      { type: "ORDER_REASSIGNED", previousAgent: "Vikram Iyer" },
    ];

    for (const event of events) {
      const message = renderMessage(ORDER, event);
      expect(message.subject.length, event.type).toBeGreaterThan(0);
      expect(message.html, event.type).toContain("LM-20260820-ABC123");
      expect(message.sms, event.type).toContain("LM-20260820-ABC123");
    }
  });

  it("keeps the SMS body short enough to be worth sending", () => {
    for (const event of [
      { type: "ORDER_CREATED" },
      { type: "STATUS_CHANGED", from: null },
    ] as NotificationEvent[]) {
      expect(renderMessage(ORDER, event).sms.length).toBeLessThan(320);
    }
  });
});

describe("SMS stub", () => {
  it("is configured — so the dispatcher calls it and it can log", () => {
    // "Configured" means it can run, not that it delivers. If this were false
    // the dispatcher would skip send() and the would-be message would vanish.
    expect(new SmsStubChannel().isConfigured()).toBe(true);
  });

  it("never claims delivery, and says it is a stub", async () => {
    const result = await new SmsStubChannel().send(
      ORDER,
      { type: "ORDER_CREATED" },
      renderMessage(ORDER, { type: "ORDER_CREATED" }),
    );

    expect(result.delivered).toBe(false);
    expect(result.reference).toBeNull();
    expect(result.detail).toContain("STUB");
  });

  it("does not log a full phone number", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await new SmsStubChannel().send(
      ORDER,
      { type: "ORDER_CREATED" },
      renderMessage(ORDER, { type: "ORDER_CREATED" }),
    );

    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("9000012345");
    expect(logged).toContain("***2345");
    spy.mockRestore();
  });
});

describe("notify", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
    setChannels([]);
  });

  it("delivers the rendered message to every configured channel", async () => {
    const channel = new RecordingChannel();
    setChannels([channel]);

    const outcome = await notify(ORDER, { type: "ORDER_CREATED" });

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].subject).toContain("LM-20260820-ABC123");
    expect(wasDelivered(outcome)).toBe(true);
  });

  it("never throws when a channel throws", async () => {
    setChannels([new ThrowingChannel()]);

    // The order operation has already committed — this must not surface.
    const outcome = await notify(ORDER, { type: "ORDER_CREATED" });

    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].delivered).toBe(false);
    expect(outcome.results[0].detail).toContain("provider exploded");
  });

  it("isolates channels from each other", async () => {
    const working = new RecordingChannel();
    setChannels([new ThrowingChannel(), working]);

    const outcome = await notify(ORDER, { type: "ORDER_CREATED" });

    // One channel blowing up must not stop the other sending.
    expect(working.sent).toHaveLength(1);
    expect(outcome.results.filter((r) => r.delivered)).toHaveLength(1);
    expect(wasDelivered(outcome)).toBe(true);
  });

  it("reports an unconfigured channel as not delivered", async () => {
    setChannels([new RecordingChannel(false)]);

    const outcome = await notify(ORDER, { type: "ORDER_CREATED" });

    expect(outcome.results[0].delivered).toBe(false);
    expect(outcome.results[0].detail).toContain("not configured");
    expect(wasDelivered(outcome)).toBe(false);
  });

  it("reports not-delivered when there are no channels at all", async () => {
    setChannels([]);
    const outcome = await notify(ORDER, { type: "ORDER_CREATED" });
    expect(wasDelivered(outcome)).toBe(false);
  });
});
