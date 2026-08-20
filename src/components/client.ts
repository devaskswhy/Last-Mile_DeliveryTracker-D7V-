"use client";

/**
 * Thin wrapper over fetch for the admin forms. Unwraps the `{ ok, data, error }`
 * envelope from `src/lib/api.ts` and flattens Zod's field errors into a single
 * readable string, so every form reports failures the same way.
 */
export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function apiRequest<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    return { ok: false, error: "Network error — is the server running?" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: `Unexpected response (HTTP ${response.status})` };
  }

  const body = payload as {
    ok?: boolean;
    data?: T;
    error?: { message?: string; details?: Record<string, string[]> };
  };

  if (response.ok && body.ok) return { ok: true, data: body.data };

  // Two shapes travel through this same field: Zod validation failures put
  // `{ field: [messages] }` here, but a domain error (RateEngineError and
  // friends) puts flat diagnostic metadata like `{ code, pincode, side }` --
  // scalars, not arrays. Only the first is meant to be appended to the
  // message; treating the second as if it were the first used to throw
  // (`messages.join` on a string), which aborted the request silently and
  // left callers like the quote panel stuck showing "Pricing..." forever.
  const details = body.error?.details as Record<string, unknown> | undefined;
  const isFieldErrors =
    !!details && Object.values(details).every((value) => Array.isArray(value));
  const fieldErrors = isFieldErrors
    ? Object.entries(details as Record<string, string[]>)
        .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
        .join("; ")
    : "";

  return {
    ok: false,
    error:
      [body.error?.message, fieldErrors].filter(Boolean).join(" — ") ||
      `Request failed (HTTP ${response.status})`,
  };
}
