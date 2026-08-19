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

  const details = body.error?.details;
  const fieldErrors = details
    ? Object.entries(details)
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
