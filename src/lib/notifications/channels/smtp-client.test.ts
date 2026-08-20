import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The SMTP integration, verified without sending anything.
 *
 * `nodemailer` is mocked so the exact call it would make is asserted — the
 * recipient, subject, body, and the `from` address, which for Gmail SMTP must
 * equal the authenticated account, not an arbitrary sender. A live send would
 * need a real app password and would put mail in someone's inbox on every
 * test run.
 */

const sendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe("smtp-client", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMail.mockReset();
    process.env.SMTP_USER = "sender@example.com";
    process.env.SMTP_PASS = "app-password-16-chars";
    process.env.EMAIL_FROM_NAME = "Last-Mile Test";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reports unconfigured when SMTP_USER or SMTP_PASS is missing", async () => {
    delete process.env.SMTP_USER;
    const { isSmtpConfigured } = await import("./smtp-client");
    expect(isSmtpConfigured()).toBe(false);
  });

  it("reports configured once both credentials are present", async () => {
    const { isSmtpConfigured } = await import("./smtp-client");
    expect(isSmtpConfigured()).toBe(true);
  });

  it("sends with the authenticated account as the from address", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@smtp>" });
    const { sendViaSmtp } = await import("./smtp-client");

    const result = await sendViaSmtp({
      to: "someone@example.com",
      subject: "Test subject",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(sendMail).toHaveBeenCalledOnce();
    const call = sendMail.mock.calls[0][0];
    expect(call.from).toBe("Last-Mile Test <sender@example.com>");
    expect(call.to).toBe("someone@example.com");
    expect(call.subject).toBe("Test subject");
    expect(call.html).toBe("<p>hi</p>");

    expect(result).toEqual({
      delivered: true,
      reference: "<abc@smtp>",
      detail: "Accepted by SMTP server",
    });
  });

  it("reaches a recipient that is not the account owner — the whole point of this channel", async () => {
    // The reason this replaced Resend: Resend's sandbox refuses any recipient
    // but the account owner. This asserts the SMTP path places no such
    // restriction on the `to` address at all.
    sendMail.mockResolvedValue({ messageId: "<xyz@smtp>" });
    const { sendViaSmtp } = await import("./smtp-client");

    const result = await sendViaSmtp({
      to: "a-completely-different-person@somewhere-else.example",
      subject: "Reachable",
      html: "<p>ok</p>",
      text: "ok",
    });

    expect(result.delivered).toBe(true);
    expect(sendMail.mock.calls[0][0].to).toBe(
      "a-completely-different-person@somewhere-else.example",
    );
  });

  it("reports failure rather than throwing when the SMTP server rejects the message", async () => {
    sendMail.mockRejectedValue(new Error("535 authentication failed"));
    const { sendViaSmtp } = await import("./smtp-client");

    const result = await sendViaSmtp({
      to: "someone@example.com",
      subject: "s",
      html: "h",
      text: "t",
    });

    expect(result.delivered).toBe(false);
    expect(result.reference).toBeNull();
    expect(result.detail).toContain("535 authentication failed");
  });

  it("never leaks the app password into the result", async () => {
    sendMail.mockRejectedValue(new Error("535 authentication failed"));
    const { sendViaSmtp } = await import("./smtp-client");

    const result = await sendViaSmtp({
      to: "someone@example.com",
      subject: "s",
      html: "h",
      text: "t",
    });

    expect(JSON.stringify(result)).not.toContain("app-password-16-chars");
  });

  it("skips sending entirely when no recipient is given", async () => {
    const { sendViaSmtp } = await import("./smtp-client");

    const result = await sendViaSmtp({
      to: "",
      subject: "s",
      html: "h",
      text: "t",
    });

    expect(sendMail).not.toHaveBeenCalled();
    expect(result.delivered).toBe(false);
    expect(result.detail).toContain("No recipient");
  });

  it("times out rather than hanging on an unresponsive server", async () => {
    vi.useFakeTimers();
    sendMail.mockImplementation(() => new Promise(() => {})); // never resolves
    const { sendViaSmtp } = await import("./smtp-client");

    const pending = sendViaSmtp({
      to: "someone@example.com",
      subject: "s",
      html: "h",
      text: "t",
    });

    await vi.advanceTimersByTimeAsync(10_001);
    const result = await pending;

    expect(result.delivered).toBe(false);
    expect(result.detail).toContain("timed out");
    vi.useRealTimers();
  });
});
