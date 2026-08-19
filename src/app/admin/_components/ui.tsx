"use client";

import type { ReactNode } from "react";

/**
 * Plain building blocks shared by the admin screens. Deliberately unstyled
 * beyond what makes the tables and forms legible — visual design comes later.
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
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 " +
  "focus:border-gray-500 focus:outline-none dark:border-gray-700 " +
  "dark:bg-gray-900 dark:text-gray-100";

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300",
    secondary: "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
    danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950",
  }[variant];

  return (
    <button
      {...props}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}
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
  const styles = {
    error: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    success: "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
    warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  }[kind];

  return (
    <p className={`rounded border px-3 py-2 text-sm ${styles}`}>{children}</p>
  );
}

export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300 dark:border-gray-700">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const cellClass = "py-2 pr-4 align-top";
export const rowClass = "border-b border-gray-100 dark:border-gray-800";
