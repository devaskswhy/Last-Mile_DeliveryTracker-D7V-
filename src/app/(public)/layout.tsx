import Link from "next/link";
import type { ReactNode } from "react";

import { SmoothScroll } from "@/components/motion/SmoothScroll";

/**
 * The public shell: landing, sign in, register.
 *
 * The dark identity is applied here rather than on `<body>` so the internal
 * admin, agent and customer pages keep their own OS-driven theme untouched.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="surface-public min-h-screen selection:bg-signal selection:text-ink">
      <SmoothScroll />

      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex max-w-shell items-center justify-between px-gutter py-5">
          <Link
            href="/"
            className="group flex items-center gap-2.5 text-eyebrow uppercase text-ink-bright"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-signal" />
              <span className="absolute inset-0 animate-ping rounded-full bg-signal opacity-60" />
            </span>
            Last-Mile
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/login"
              className="px-4 py-2 text-caption text-ink-muted transition-colors duration-fast ease-signature hover:text-ink-bright"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-signal px-4 py-2 text-caption font-medium text-ink transition-transform duration-fast ease-signature hover:scale-[1.03]"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="rule mx-auto max-w-shell px-gutter py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 text-caption text-ink-muted">
          <span>Last-Mile Delivery Tracker</span>
          <span className="font-mono">
            Zones · Rate cards · Agents · Audit trail
          </span>
        </div>
      </footer>
    </div>
  );
}
