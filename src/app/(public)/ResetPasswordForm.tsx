"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiRequest } from "@/components/client";

import { AuthField } from "./AuthField";

/**
 * Sets a new password from a reset link.
 *
 * The token comes from the URL and is never shown or re-typed — it travels
 * straight from the query string to the request body. Confirmation is
 * checked client-side only as a courtesy against a typo; the server does not
 * know or care that a confirmation field existed.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setBusy(true);
    const result = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Could not reset the password.");
      return;
    }

    setDone(true);
    // A brief pause so the confirmation is actually seen before the redirect.
    setTimeout(() => router.push("/login"), 1800);
  }

  if (!token) {
    return (
      <FormShell heading="Link missing its token">
        <p className="rounded-xl border border-signal/40 bg-signal-wash px-4 py-3 text-caption text-ink-bright">
          This reset link is incomplete. Request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-block text-caption text-signal underline-offset-4 hover:underline"
        >
          Request a new link
        </Link>
      </FormShell>
    );
  }

  if (done) {
    return (
      <FormShell heading="Password updated">
        <p className="rounded-xl border border-ink-line bg-ink-soft px-4 py-3 text-caption text-ink-bright">
          Your password has been changed. Taking you to sign in…
        </p>
      </FormShell>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-shell items-center px-gutter py-32">
      <div className="grid w-full gap-16 md:grid-cols-2 md:items-center">
        <div className="hidden md:block">
          <p className="mb-6 text-eyebrow uppercase text-signal">
            Reset password
          </p>
          <h1 className="text-display text-ink-bright">
            Choose a
            <br />
            <span className="text-signal">new password.</span>
          </h1>
          <p className="mt-8 max-w-sm text-body text-ink-muted">
            This link works once. After you set a new password it stops
            working, and any other reset link you requested stops too.
          </p>
        </div>

        <div className="w-full max-w-md md:justify-self-end">
          <div className="mb-8 md:hidden">
            <p className="mb-3 text-eyebrow uppercase text-signal">
              Reset password
            </p>
            <h1 className="text-headline text-ink-bright">
              Choose a new password.
            </h1>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-5">
            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-signal/40 bg-signal-wash px-4 py-3 text-caption text-ink-bright"
              >
                {error}
              </p>
            ) : null}

            <AuthField
              label="New password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
              hint="At least 8 characters"
            />

            <AuthField
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
            />

            <button
              type="submit"
              disabled={busy}
              className="mt-3 rounded-full bg-signal px-8 py-4 text-caption font-medium uppercase tracking-wider text-ink transition-transform duration-fast ease-signature hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {busy ? "Saving…" : "Set new password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FormShell({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[100svh] max-w-shell items-center px-gutter py-32">
      <div className="w-full max-w-md">
        <p className="mb-3 text-eyebrow uppercase text-signal">
          Reset password
        </p>
        <h1 className="mb-6 text-headline text-ink-bright">{heading}</h1>
        {children}
      </div>
    </div>
  );
}
