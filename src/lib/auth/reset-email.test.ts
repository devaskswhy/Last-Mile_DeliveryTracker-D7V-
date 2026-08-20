import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendPasswordResetEmail } from "./reset-email";

const originalKey = process.env.RESEND_API_KEY;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://lastmile.example";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.RESEND_API_KEY = originalKey;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("builds a reset link at /reset-password?token=<raw token>", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "r1" }), { status: 200 }));

    await sendPasswordResetEmail("priya@example.com", "Priya", "abc123def456");

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    const expectedUrl = "https://lastmile.example/reset-password?token=abc123def456";
    expect(body.html).toContain(expectedUrl);
    expect(body.text).toContain(expectedUrl);
  });

  it("percent-encodes a token that needs it in the URL", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "r1" }), { status: 200 }));

    // Hex tokens never contain characters that need encoding, but the encode
    // call must not silently be skipped if that ever changes.
    await sendPasswordResetEmail("priya@example.com", "Priya", "abc&def=123");

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.html).toContain(encodeURIComponent("abc&def=123"));
    expect(body.html).not.toContain("token=abc&def=123");
  });

  it("escapes the recipient's name before it reaches the HTML body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "r1" }), { status: 200 }));

    // A display name is user-supplied at registration and lands directly in
    // this email — the same injection surface the order templates guard.
    await sendPasswordResetEmail(
      "priya@example.com",
      `<img src=x onerror="alert(1)">`,
      "tok",
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.html).not.toContain("<img src=x onerror");
    expect(body.html).toContain("&lt;img");
  });

  it("sends to the given address with a clear subject", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "r1" }), { status: 200 }));

    await sendPasswordResetEmail("priya@example.com", "Priya", "tok");

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.to).toEqual(["priya@example.com"]);
    expect(body.subject.toLowerCase()).toContain("reset");
  });

  it("reports failure rather than throwing when Resend rejects the request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad request", { status: 400 }),
    );

    const result = await sendPasswordResetEmail("priya@example.com", "Priya", "tok");
    expect(result.delivered).toBe(false);
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "r1" }), { status: 200 }));

    await sendPasswordResetEmail("priya@example.com", "Priya", "tok");

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.html).toContain("http://localhost:3000/reset-password?token=tok");
  });
});
