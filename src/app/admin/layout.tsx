import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AuthError, requireActiveUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/zones", label: "Zones" },
  { href: "/admin/areas", label: "Areas" },
  { href: "/admin/rate-cards", label: "Rate cards" },
  { href: "/admin/cod-surcharges", label: "COD surcharges" },
];

/**
 * Middleware already blocks non-admins from `/admin/*`. This repeats the check
 * server-side so the pages below can never render for a user whose account was
 * deactivated or demoted after their token was issued — middleware only sees
 * the JWT's claims, which stay stale until it expires.
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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">Admin configuration</h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {admin.email}
          </span>
        </div>
        <nav className="mt-3 flex flex-wrap gap-4 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-gray-600 underline-offset-4 hover:underline dark:text-gray-400"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
