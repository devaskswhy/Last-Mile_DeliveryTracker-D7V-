import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMail.mockReset();
    sendMail.mockResolvedValue({ messageId: "<r1@smtp>" });
    process.env.SMTP_USER = "sender@example.com";
    process.env.SMTP_PASS = "app-password";
    process.env.NEXT_PUBLIC_APP_URL = "https://lastmile.example";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("builds a reset link at /reset-password?token=<raw token>", async () => {
    const { sendPasswordResetEmail } = await import("./reset-email");
    await sendPasswordResetEmail("priya@example.com", "Priya", "abc123def456");

    const body = sendMail.mock.calls[0][0];
    const expectedUrl = "https://lastmile.example/reset-password?token=abc123def456";
    expect(body.html).toContain(expectedUrl);
    expect(body.text).toContain(expectedUrl);
  });

  it("percent-encodes a token that needs it in the URL", async () => {
    const { sendPasswordResetEmail } = await import("./reset-email");
    // Hex tokens never contain characters that need encoding, but the encode
    // call must not silently be skipped if that ever changes.
    await sendPasswordResetEmail("priya@example.com", "Priya", "abc&def=123");

    const body = sendMail.mock.calls[0][0];
    expect(body.html).toContain(encodeURIComponent("abc&def=123"));
    expect(body.html).not.toContain("token=abc&def=123");
  });

  it("escapes the recipient's name before it reaches the HTML body", async () => {
    const { sendPasswordResetEmail } = await import("./reset-email");
    // A display name is user-supplied at registration and lands directly in
    // this email — the same injection surface the order templates guard.
    await sendPasswordResetEmail(
      "priya@example.com",
      `<img src=x onerror="alert(1)">`,
      "tok",
    );

    const body = sendMail.mock.calls[0][0];
    expect(body.html).not.toContain("<img src=x onerror");
    expect(body.html).toContain("&lt;img");
  });

  it("sends to the given address with a clear subject", async () => {
    const { sendPasswordResetEmail } = await import("./reset-email");
    await sendPasswordResetEmail("priya@example.com", "Priya", "tok");

    const body = sendMail.mock.calls[0][0];
    expect(body.to).toBe("priya@example.com");
    expect(body.subject.toLowerCase()).toContain("reset");
  });

  it("reports failure rather than throwing when the SMTP server rejects the message", async () => {
    sendMail.mockRejectedValue(new Error("550 mailbox unavailable"));
    const { sendPasswordResetEmail } = await import("./reset-email");

    const result = await sendPasswordResetEmail("priya@example.com", "Priya", "tok");
    expect(result.delivered).toBe(false);
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { sendPasswordResetEmail } = await import("./reset-email");

    await sendPasswordResetEmail("priya@example.com", "Priya", "tok");

    const body = sendMail.mock.calls[0][0];
    expect(body.html).toContain("http://localhost:3000/reset-password?token=tok");
  });
});
