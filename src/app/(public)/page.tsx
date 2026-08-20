import Link from "next/link";

import { Preloader } from "@/components/motion/Preloader";

import { LandingMotion } from "./LandingMotion";

export const metadata = {
  title: "Last-Mile — delivery, priced and tracked",
  description:
    "Create delivery orders with charges computed from your own rate cards, assign agents by zone, and follow every status change on an audit trail that cannot be rewritten.",
};

const ROLES = [
  {
    name: "Customer",
    line: "Quote before you commit",
    body: "See the freight, the COD surcharge and the total itemised before an order exists. Track every attempt, and rebook a failed delivery yourself.",
  },
  {
    name: "Agent",
    line: "One screen, one tap",
    body: "Your assigned work, in order, with only the moves the workflow actually permits. Report a failure with a reason the customer can act on.",
  },
  {
    name: "Admin",
    line: "The whole board",
    body: "Zones, areas, rate cards and surcharges as data. Filter by status, zone or agent, reassign anyone, and override a status with a reason on the record.",
  },
];

const STEPS = [
  {
    index: "01",
    title: "Address resolves to a zone",
    body: "A pincode maps to exactly one area, and that area to one zone. Ambiguity is refused rather than guessed at.",
  },
  {
    index: "02",
    title: "Weight decides the price",
    body: "Volumetric against actual, whichever is greater. Every figure is integer arithmetic — no float ever touches a charge.",
  },
  {
    index: "03",
    title: "An agent is chosen",
    body: "Whoever is available in the pickup zone with the least on their plate. If nobody is free, the order waits visibly.",
  },
  {
    index: "04",
    title: "Every change is recorded",
    body: "Status, timestamp, actor. Append-only at the database, so a correction is a new row and history cannot be rewritten.",
  },
];

const CAPABILITIES = [
  { figure: "2 × N²", label: "Rate cards for N zones, coverage gaps reported" },
  { figure: "0", label: "Floats in any charge calculation" },
  { figure: "100%", label: "Status changes on an append-only trail" },
];

export default function LandingPage() {
  return (
    <>
      <Preloader />

      <LandingMotion>
        <main>
          {/* ---------------------------------------------------- Hero -- */}
          <section
            data-hero
            className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden px-gutter pb-16 pt-32"
          >
            {/* Depth, built from transforms only — no image to download. */}
            <div
              data-hero-visual
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 will-change-transform"
            >
              <div className="absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(214,255,61,0.10)_0%,transparent_58%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(36,42,46,0.55)_1px,transparent_1px),linear-gradient(to_bottom,rgba(36,42,46,0.55)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_72%)]" />
            </div>

            <div className="mx-auto w-full max-w-shell">
              <p
                data-hero-meta
                className="mb-8 text-eyebrow uppercase text-signal"
              >
                Logistics operations platform
              </p>

              <h1 className="text-display-lg text-ink-bright">
                {["Every parcel.", "Every status.", "On the record."].map(
                  (line, index) => (
                    <span key={line} className="block overflow-hidden">
                      <span data-hero-line className="block will-change-transform">
                        {index === 2 ? (
                          <>
                            On the <span className="text-signal">record.</span>
                          </>
                        ) : (
                          line
                        )}
                      </span>
                    </span>
                  ),
                )}
              </h1>

              <div
                data-hero-meta
                className="mt-12 flex flex-col gap-8 md:flex-row md:items-end md:justify-between"
              >
                <p className="max-w-prose text-body-lg text-ink-muted">
                  Delivery orders priced from your own rate cards, agents
                  assigned by zone and workload, and a status history the
                  database itself will not let anyone rewrite.
                </p>

                <Link
                  href="/register"
                  className="group inline-flex shrink-0 items-center gap-3 rounded-full bg-signal px-7 py-4 text-caption font-medium uppercase tracking-wider text-ink transition-transform duration-fast ease-signature hover:scale-[1.04]"
                >
                  Start tracking
                  <span className="transition-transform duration-fast ease-signature group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------- Marquee -- */}
          {/* CSS-driven, so it costs nothing on the scroll thread. */}
          <div className="rule overflow-hidden py-5">
            <div className="flex w-max animate-marquee gap-12 will-change-transform">
              {Array.from({ length: 2 }).map((_, copy) => (
                <div key={copy} className="flex shrink-0 gap-12" aria-hidden={copy === 1}>
                  {[
                    "Zone detection",
                    "Volumetric weight",
                    "COD surcharge",
                    "Auto-assignment",
                    "Failed delivery reschedule",
                    "Append-only audit",
                    "Live quotes",
                  ].map((item) => (
                    <span
                      key={item}
                      className="flex items-center gap-12 whitespace-nowrap text-caption uppercase tracking-widest text-ink-muted"
                    >
                      {item}
                      <span className="h-1 w-1 rounded-full bg-signal" />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* --------------------------------------------------- Roles -- */}
          <section className="mx-auto max-w-shell px-gutter py-section">
            <div className="mb-16 max-w-prose">
              <p data-reveal className="mb-5 text-eyebrow uppercase text-signal">
                Three roles
              </p>
              <h2 data-reveal className="text-headline text-ink-bright">
                One system, seen three ways.
              </h2>
            </div>

            <div className="grid gap-px overflow-hidden rounded-2xl bg-ink-line md:grid-cols-3">
              {ROLES.map((role) => (
                <article
                  key={role.name}
                  data-reveal
                  className="group bg-ink-soft p-8 transition-colors duration-base ease-signature hover:bg-ink-raised md:p-10"
                >
                  <p className="text-eyebrow uppercase text-ink-muted">
                    {role.name}
                  </p>
                  <h3 className="mt-5 text-title text-ink-bright">
                    {role.line}
                  </h3>
                  <p className="mt-4 text-body text-ink-muted">{role.body}</p>
                  <div className="mt-8 h-px w-10 origin-left bg-signal transition-transform duration-base ease-signature group-hover:scale-x-[3]" />
                </article>
              ))}
            </div>
          </section>

          {/* ------------------------------- The one pinned section ----- */}
          <section
            data-pin-section
            className="rule relative flex min-h-[100svh] items-center overflow-hidden px-gutter"
          >
            <div className="mx-auto grid w-full max-w-shell gap-16 md:grid-cols-[minmax(0,20rem)_1fr]">
              <div className="self-start md:sticky md:top-32">
                <p className="mb-5 text-eyebrow uppercase text-signal">
                  From address to audit
                </p>
                <h2 className="text-headline text-ink-bright">
                  What happens when an order is placed.
                </h2>
              </div>

              <ol className="flex flex-col gap-10">
                {STEPS.map((step) => (
                  <li
                    key={step.index}
                    data-step
                    className="will-change-transform"
                  >
                    <div className="flex items-baseline gap-5">
                      <span className="font-mono text-caption text-signal">
                        {step.index}
                      </span>
                      <h3 className="text-title text-ink-bright">
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-3 max-w-prose pl-10 text-body text-ink-muted">
                      {step.body}
                    </p>
                    <div
                      data-step-rail
                      className="mt-6 ml-10 h-px origin-left bg-signal/40 will-change-transform"
                    />
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* -------------------------------------------- Capabilities -- */}
          <section className="rule mx-auto max-w-shell px-gutter py-section">
            <div className="grid gap-12 md:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <div key={item.label} data-reveal>
                  <p className="font-mono text-display text-signal">
                    {item.figure}
                  </p>
                  <p className="mt-4 max-w-xs text-body text-ink-muted">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ----------------------------------------------------- CTA -- */}
          <section className="rule mx-auto max-w-shell px-gutter py-section text-center">
            <h2
              data-reveal
              className="mx-auto max-w-4xl text-display text-ink-bright text-balance"
            >
              Price it, dispatch it, prove what happened.
            </h2>
            <div
              data-reveal
              className="mt-12 flex flex-wrap items-center justify-center gap-4"
            >
              <Link
                href="/register"
                className="rounded-full bg-signal px-8 py-4 text-caption font-medium uppercase tracking-wider text-ink transition-transform duration-fast ease-signature hover:scale-[1.04]"
              >
                Create an account
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-ink-line px-8 py-4 text-caption font-medium uppercase tracking-wider text-ink-bright transition-colors duration-fast ease-signature hover:border-signal hover:text-signal"
              >
                Sign in
              </Link>
            </div>
          </section>
        </main>
      </LandingMotion>
    </>
  );
}
