import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMessage } from "../templates";
import type { NotifiableOrder } from "../types";
import { ResendEmailChannel } from "./email-resend";

/**
 * The provider integration, verified without sending anything.
 *
 * `fetch` is stubbed so the exact request Resend would receive is asserted —
 * URL, auth header, and body — which is the part that is actually easy to get
 * wrong. A live send would need a real API key and would put mail in someone's
 * inbox on every test run.
 */

const ORDER: NotifiableOrder = {
  id: "order-9",
  orderNumber: "LM-20260820-XYZ789",
  status: "DELIVERED",
  customer: { id: "c1", name: "Priya Nair", email: "priya@example.com" },
  agent: null,
};

const MESSAGE = renderMessage(ORDER, { type: "STATUS_CHANGED", from: "OUT_FOR_DELIVERY" });

const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.EMAIL_FROM_ADDRESS;

describe("ResendEmailChannel", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM_ADDRESS = "no-reply@lastmile.test";
    process.env.EMAIL_FROM_NAME = "Last-Mile";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.RESEND_API_KEY = originalKey;
    process.env.EMAIL_FROM_ADDRESS = originalFrom;
  });

  it("reports itself unconfigured without an API key", () => {
    delete process.env.RESEND_API_KEY;
    expect(new ResendEmailChannel().isConfigured()).toBe(false);
  });

  it("is configured once the key is present", () => {
    expect(new ResendEmailChannel().isConfigured()).toBe(true);
  });

  it("posts the message to Resend with the right shape", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-abc" }), { status: 200 }),
    );

    const result = await new ResendEmailChannel().send(
      ORDER,
      { type: "STATUS_CHANGED", from: "OUT_FOR_DELIVERY" },
      MESSAGE,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string);
    expect(body.from).toBe("Last-Mile <no-reply@lastmile.test>");
    expect(body.to).toEqual(["priya@example.com"]);
    expect(body.subject).toContain("LM-20260820-XYZ789");
    expect(body.html).toContain("LM-20260820-XYZ789");
    expect(body.text).toContain("Track:");

    expect(result).toMatchObject({
      channel: "email",
      delivered: true,
      reference: "resend-abc",
    });
  });

  it("reports a provider error without claiming delivery", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("domain is not verified", { status: 403 }),
    );

    const result = await new ResendEmailChannel().send(
      ORDER,
      { type: "ORDER_CREATED" },
      MESSAGE,
    );

    expect(result.delivered).toBe(false);
    expect(result.reference).toBeNull();
    expect(result.detail).toContain("403");
    expect(result.detail).toContain("domain is not verified");
  });

  it("never leaks the API key into the result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad request", { status: 400 }),
    );

    const result = await new ResendEmailChannel().send(
      ORDER,
      { type: "ORDER_CREATED" },
      MESSAGE,
    );

    // The detail string ends up in logs, so it must never carry the key.
    expect(JSON.stringify(result)).not.toContain("re_test_key");
  });

  it("returns a failure rather than throwing when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await new ResendEmailChannel().send(
      ORDER,
      { type: "ORDER_CREATED" },
      MESSAGE,
    );

    expect(result.delivered).toBe(false);
    expect(result.detail).toContain("ECONNREFUSED");
  });

  it("gives up on a hanging provider instead of stalling the request", async () => {
    // AbortError is what a timed-out fetch raises.
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abort);

    const result = await new ResendEmailChannel().send(
      ORDER,
      { type: "ORDER_CREATED" },
      MESSAGE,
    );

    expect(result.delivered).toBe(false);
    expect(result.detail).toContain("did not respond within");
  });

  it("skips a customer with no email address", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await new ResendEmailChannel().send(
      { ...ORDER, customer: { ...ORDER.customer, email: "" } },
      { type: "ORDER_CREATED" },
      MESSAGE,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.delivered).toBe(false);
    expect(result.detail).toContain("no email address");
  });
});
