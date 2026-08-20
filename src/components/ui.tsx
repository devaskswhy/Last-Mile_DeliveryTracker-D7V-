"use client";

import type { ReactNode } from "react";

/**
 * Dashboard primitives, in the Phase 7 design system.
 *
 * Dark base, the single `signal` accent, the shared `ease-signature` curve.
 * These are the same tokens the landing page uses — the point of a design
 * system is that an admin table and a marketing hero are recognisably the same
 * product.
 *
 * There are no `dark:` variants any more. The app surface is dark, full stop;
 * carrying a second palette for a theme nothing switches to is dead weight.
 */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-eyebrow uppercase text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="text-caption text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full min-w-0 rounded-xl border border-ink-line bg-ink-soft px-3.5 py-2.5 " +
  "text-body text-ink-bright outline-none transition-colors duration-fast " +
  "ease-signature placeholder:text-ink-muted/60 focus:border-signal " +
  "disabled:opacity-50";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  /**
   * `danger` is not a second accent. It is the neutral ramp plus a heavier
   * border — the design system has one hue, so destructive intent is signalled
   * by weight and wording rather than by introducing red.
   */
  const styles = {
    primary: "bg-signal text-ink hover:scale-[1.03] active:scale-100",
    secondary:
      "border border-ink-line text-ink-bright hover:border-ink-muted hover:bg-ink-raised",
    danger:
      "border border-ink-muted/50 text-ink-muted hover:border-ink-bright hover:text-ink-bright",
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-caption font-medium transition-all duration-fast ease-signature disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: "error" | "success" | "warn";
  children: ReactNode;
}) {
  /**
   * One hue, three weights. An error is the accent at full strength on a tinted
   * ground; a warning is the same tint with a quieter border; success is the
   * accent as a rule rather than a fill.
   */
  const styles = {
    error: "border-signal bg-signal-wash text-ink-bright",
    warn: "border-signal/40 bg-signal-wash text-ink-bright",
    success: "border-ink-line bg-ink-soft text-ink-bright",
  }[kind];

  return (
    <p
      role={kind === "error" ? "alert" : undefined}
      className={`rounded-xl border px-4 py-3 text-caption ${styles}`}
    >
      {kind === "success" ? (
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />
      ) : null}
      {children}
    </p>
  );
}

/**
 * Tables scroll horizontally inside their own container rather than widening
 * the page. On a phone a wide data table has to go somewhere, and a body that
 * scrolls sideways takes the whole layout with it.
 */
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="-mx-gutter overflow-x-auto px-gutter md:mx-0 md:px-0">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-ink-line">
            {headers.map((header) => (
              <th
                key={header}
                className="whitespace-nowrap py-3 pr-4 text-eyebrow uppercase text-ink-muted"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const cellClass = "py-3 pr-4 align-top text-body text-ink-bright";
export const rowClass =
  "border-b border-ink-line/60 transition-colors duration-fast ease-signature hover:bg-ink-soft/60";

/** Section heading with the eyebrow/headline pairing used across the app. */
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-prose">
        <p className="mb-3 text-eyebrow uppercase text-signal">{eyebrow}</p>
        <h2 className="text-headline text-ink-bright">{title}</h2>
        {children ? (
          <p className="mt-3 text-body text-ink-muted">{children}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** A bordered panel — the standard container for a form or a grouped list. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-ink-line bg-ink-soft p-5 md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/** Small monospace chip for a status, code or enum value. */
export function Tag({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-wider ${
        active
          ? "bg-signal text-ink"
          : "border border-ink-line text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel>
      <p className="text-eyebrow uppercase text-ink-muted">{label}</p>
      <p className="mt-2 font-mono text-title text-ink-bright">{value}</p>
    </Panel>
  );
}

export function EmptyRow({ span, children }: { span: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="py-8 text-center text-body text-ink-muted">
        {children}
      </td>
    </tr>
  );
}
