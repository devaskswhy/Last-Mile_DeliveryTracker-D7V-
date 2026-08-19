import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";
import type { Role } from "@/lib/auth/roles";

/**
 * Route protection. Runs on the Edge runtime before every matched request, so
 * it may only verify the JWT signature -- no database lookups, no bcrypt.
 *
 * The token is the single source of truth here. Anything needing live user
 * state (a deactivated account, a changed role) must re-check in the route
 * handler; keep session lifetimes short enough that stale claims are bounded.
 */

/** Longest-prefix wins, so `/api/admin` can differ from `/api`. */
const PROTECTED_PREFIXES: ReadonlyArray<{
  prefix: string;
  allow: readonly Role[];
}> = [
  { prefix: "/admin", allow: ["ADMIN"] },
  { prefix: "/api/admin", allow: ["ADMIN"] },
  { prefix: "/agent", allow: ["AGENT", "ADMIN"] },
  { prefix: "/api/agent", allow: ["AGENT", "ADMIN"] },
  { prefix: "/dashboard", allow: ["CUSTOMER", "AGENT", "ADMIN"] },
  { prefix: "/orders", allow: ["CUSTOMER", "AGENT", "ADMIN"] },
  { prefix: "/api/orders", allow: ["CUSTOMER", "AGENT", "ADMIN"] },
  { prefix: "/api/me", allow: ["CUSTOMER", "AGENT", "ADMIN"] },
];

function matchRule(pathname: string) {
  let match: { prefix: string; allow: readonly Role[] } | undefined;

  for (const rule of PROTECTED_PREFIXES) {
    const isMatch =
      pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
    if (isMatch && (!match || rule.prefix.length > match.prefix.length)) {
      match = rule;
    }
  }

  return match;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const rule = matchRule(pathname);
  if (!rule) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  // --- Not signed in -------------------------------------------------------
  if (!session) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { ok: false, error: { message: "Authentication required" } },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // --- Signed in, wrong role ----------------------------------------------
  if (!rule.allow.includes(session.role)) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { ok: false, error: { message: "Insufficient permissions" } },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  // --- Allowed: forward identity so handlers skip re-parsing the cookie ----
  const headers = new Headers(request.headers);
  headers.set("x-user-id", session.userId);
  headers.set("x-user-role", session.role);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  /**
   * Everything except Next internals and static files. Public routes fall
   * through `matchRule` above and are returned untouched.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
