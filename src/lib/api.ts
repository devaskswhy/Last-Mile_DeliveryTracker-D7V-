import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/** Uniform JSON envelopes so every route handler answers in the same shape. */

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  message: string,
  status = 400,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { message, ...(details ? { details } : {}) } },
    { status },
  );
}

/** Flattens a Zod error into `{ field: [messages] }` for form rendering. */
export function validationFailed(error: ZodError): NextResponse {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fail("Validation failed", 422, fieldErrors);
}

/** Parses a JSON body, returning `undefined` on malformed or absent input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
