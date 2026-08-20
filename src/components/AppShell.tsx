import Link from "next/link";
import type { ReactNode } from "react";

import type { Role } from "@/lib/auth/roles";

import { SignOutButton } from "./SignOutButton";

/**
 * The signed-in shell: same dark surface, accent and type scale as the landing
 * page, so the product reads as one thing rather than a marketing site bolted
 * to an admin panel.
 *
 * Navigation is built from the viewer's role, so nobody is shown a link that
 * middleware would only bounce them off.
 */
const NAV_BY_ROLE: Record<Role, Array<{ href: string; label: string }>> = {
  CUSTOMER: [
    { href: "/orders", label: "My orders" },
    { href: "/orders/new", label: "New order" },
  ],
  AGENT: [{ href: "/agent/orders", label: "My deliveries" }],
  ADMIN: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/zones", label: "Zones" },
    { href: "/admin/areas", label: "Areas" },
    { href: "/admin/rate-cards", label: "Rate cards" },
    { href: "/admin/cod-surcharges", label: "COD" },
  ],
};

export function AppShell({
  role,
  email,
  children,
}: {
  role: Role;
  email: string;
  children: ReactNode;
}) {
  const nav = NAV_BY_ROLE[role];

  return (
    <div className="surface-app min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-line bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto max-w-shell px-gutter">
          <div className="flex items-center justify-between gap-4 py-4">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 text-eyebrow uppercase text-ink-bright"
            >
              <span className="h-2 w-2 rounded-full bg-signal" />
              Last-Mile
            </Link>

            <div className="flex items-center gap-3">
              <span className="hidden text-caption text-ink-muted sm:inline">
                {email}
              </span>
              <span className="rounded-full border border-ink-line px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-wider text-signal">
                {role}
              </span>
              <SignOutButton />
            </div>
          </div>

          {/* Scrolls sideways on a phone rather than wrapping into a stack
              that pushes the content off the first screen. */}
          <nav className="-mx-gutter flex gap-1 overflow-x-auto px-gutter pb-3 md:mx-0 md:px-0">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-caption text-ink-muted transition-colors duration-fast ease-signature hover:bg-ink-soft hover:text-ink-bright"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-shell px-gutter py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
