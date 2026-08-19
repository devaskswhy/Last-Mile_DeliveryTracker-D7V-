import { compare, hash } from "bcryptjs";

/**
 * `bcryptjs` (pure JS) rather than `bcrypt` (native): the native build needs a
 * C++ toolchain, which makes installs fragile on Windows and in slim CI images.
 * Same algorithm and hash format, so hashes are interchangeable.
 */
const SALT_ROUNDS = 12;

/** bcrypt silently ignores bytes past 72; reject instead of truncating. */
export const MAX_PASSWORD_BYTES = 72;

export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export async function hashPassword(password: string): Promise<string> {
  if (passwordByteLength(password) > MAX_PASSWORD_BYTES) {
    throw new Error(
      `Password exceeds bcrypt's ${MAX_PASSWORD_BYTES}-byte limit.`,
    );
  }
  return hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await compare(password, passwordHash);
  } catch {
    return false;
  }
}
