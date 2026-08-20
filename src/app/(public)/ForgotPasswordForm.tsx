"use client";

import Link from "next/link";
import { useState } from "react";

import { apiRequest } from "@/components/client";

import { AuthField } from "./AuthField";

/**
 * Requests a reset link.
 *
 * Always shows the same confirmation, whatever the server actually did — the
 * API itself never reveals whether the address is registered, and the UI must
 * not undo that by reacting differently to a 200 that happens to carry no
 * error versus one that does. There is exactly one outcome to render.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    setBusy(false);

    // The server's 200 response is, by construction, identical whether or not
    // the account exists — so `result.ok` alone is the whole signal. A `!ok`
    // here means the request itself was rejected (a malformed email, a
    // network failure) before any account lookup happened, which is not
    // information about any account and is safe to show directly.
    if (!result.ok) {
      setError(result.error ?? "Something went wrong. Try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-shell items-center px-gutter py-32">
      <div className="grid w-full gap-16 md:grid-cols-2 md:items-center">
        <div className="hidden md:block">
          <p className="mb-6 text-eyebrow uppercase text-signal">
            Reset password
          </p>
          <h1 className="text-display text-ink-bright">
            Locked out?
            <br />
            <span className="text-signal">We&rsquo;ll send a link.</span>
          </h1>
          <p className="mt-8 max-w-sm text-body text-ink-muted">
            Enter the email on your account and, if it&rsquo;s registered,
            we&rsquo;ll send a link to set a new password. The link works once
            and expires in an hour.
          </p>
        </div>

        <div className="w-full max-w-md md:justify-self-end">
          <div className="mb-8 md:hidden">
            <p className="mb-3 text-eyebrow uppercase text-signal">
              Reset password
            </p>
            <h1 className="text-headline text-ink-bright">
              Locked out? We&rsquo;ll send a link.
            </h1>
          </div>

          {sent ? (
            <div className="flex flex-col gap-5">
              <p className="rounded-xl border border-ink-line bg-ink-soft px-4 py-3 text-caption text-ink-bright">
                If an account exists for that email, a reset link is on its
                way. Check your inbox — and spam, just in case.
              </p>
              <Link
                href="/login"
                className="text-caption text-signal underline-offset-4 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
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
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                required
              />

              <button
                type="submit"
                disabled={busy}
                className="mt-3 rounded-full bg-signal px-8 py-4 text-caption font-medium uppercase tracking-wider text-ink transition-transform duration-fast ease-signature hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>

              <p className="mt-3 text-caption text-ink-muted">
                <Link
                  href="/login"
                  className="text-signal underline-offset-4 hover:underline"
                >
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
