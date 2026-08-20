import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Middleware already blocks non-admins from `/admin/*`. This repeats the check
 * server-side so the pages below can never render for an account that was
 * deactivated or demoted after its token was issued — middleware only sees the
 * JWT's claims, which stay stale until it expires.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let admin;
  try {
    admin = await requireActiveUser("ADMIN");
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.status === 401 ? "/login?next=/admin" : "/forbidden");
    }
    throw error;
  }

  return (
    <AppShell role="ADMIN" email={admin.email}>
      {children}
    </AppShell>
  );
}
