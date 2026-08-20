import { describe, expect, it } from "vitest";

import {
  RESET_TOKEN_TTL_MS,
  generateResetToken,
  hashResetToken,
  hashesMatch,
  isResetTokenUsable,
  resetTokenExpiry,
} from "./password-reset";

describe("generateResetToken", () => {
  it("produces a 64-character hex string (32 bytes)", () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is different on every call", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateResetToken));
    expect(tokens.size).toBe(50);
  });
});

describe("hashResetToken", () => {
  it("is deterministic — the same token always hashes the same way", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
  });

  it("produces a different hash for a different token", () => {
    expect(hashResetToken(generateResetToken())).not.toBe(
      hashResetToken(generateResetToken()),
    );
  });

  it("never stores the raw token as its own hash", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).not.toBe(token);
  });

  it("produces a 64-character hex SHA-256 digest", () => {
    expect(hashResetToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashesMatch", () => {
  it("is true for equal hashes", () => {
    const h = hashResetToken(generateResetToken());
    expect(hashesMatch(h, h)).toBe(true);
  });

  it("is false for different hashes", () => {
    expect(
      hashesMatch(
        hashResetToken("a"),
        hashResetToken("b"),
      ),
    ).toBe(false);
  });

  it("is false rather than throwing on mismatched lengths", () => {
    expect(hashesMatch("ab", "abcd")).toBe(false);
  });
});

describe("resetTokenExpiry", () => {
  it("is exactly one hour after the reference time", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    expect(resetTokenExpiry(now).getTime() - now.getTime()).toBe(
      RESET_TOKEN_TTL_MS,
    );
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});

describe("isResetTokenUsable", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const hourAhead = new Date(now.getTime() + 60 * 60 * 1000);

  it("is usable when unexpired and unused", () => {
    expect(
      isResetTokenUsable({ expiresAt: hourAhead, usedAt: null }, now),
    ).toBe(true);
  });

  it("is not usable once expired", () => {
    expect(
      isResetTokenUsable({ expiresAt: hourAgo, usedAt: null }, now),
    ).toBe(false);
  });

  it("is not usable exactly at the expiry instant", () => {
    // Strictly greater-than, so a token does not remain valid for the exact
    // millisecond it expires.
    expect(isResetTokenUsable({ expiresAt: now, usedAt: null }, now)).toBe(
      false,
    );
  });

  it("is not usable once already used, even if not yet expired", () => {
    expect(
      isResetTokenUsable({ expiresAt: hourAhead, usedAt: hourAgo }, now),
    ).toBe(false);
  });

  it("is not usable when both expired and used", () => {
    expect(
      isResetTokenUsable({ expiresAt: hourAgo, usedAt: hourAgo }, now),
    ).toBe(false);
  });
});
