"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiRequest } from "@/components/client";

import { AuthField } from "./AuthField";

type Mode = "login" | "register";

/**
 * Sign in and registration, one component.
 *
 * The two forms differ by three fields and an endpoint; splitting them into
 * separate components would duplicate the error handling and the redirect
 * logic, which is where the actual behaviour lives.
 *
 * No preloader here on purpose. A two-second curtain is right once, on a
 * landing page someone chose to visit; in front of a sign-in form it is a
 * two-second tax on every attempt.
 */
export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const isRegister = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest<{ user: { role: string } }>(
      isRegister ? "/api/auth/register" : "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify(
          isRegister
            ? { name, email, password, ...(phone ? { phone } : {}) }
            : { email, password },
        ),
      },
    );

    if (!result.ok || !result.data) {
      setBusy(false);
      setError(result.error ?? "Something went wrong. Try again.");
      return;
    }

    // Land people where their role can actually do something.
    const role = result.data.user.role;
    const destination =
      next ??
      (role === "ADMIN"
        ? "/admin"
        : role === "AGENT"
          ? "/agent/orders"
          : "/orders");

    router.push(destination);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-shell items-center px-gutter py-32">
      <div className="grid w-full gap-16 md:grid-cols-2 md:items-center">
        {/* Left: identity. Type carries it — no decorative art. */}
        <div className="hidden md:block">
          <p className="mb-6 text-eyebrow uppercase text-signal">
            {isRegister ? "Create account" : "Welcome back"}
          </p>
          <h1 className="text-display text-ink-bright">
            {isRegister ? (
              <>
                Start
                <br />
                <span className="text-signal">shipping.</span>
              </>
            ) : (
              <>
                Pick up
                <br />
                where you <span className="text-signal">left off.</span>
              </>
            )}
          </h1>
          <p className="mt-8 max-w-sm text-body text-ink-muted">
            {isRegister
              ? "Registration creates a customer account. Agent and admin access is provisioned by your operations team."
              : "Customers, agents and admins all sign in here — you land on whichever view your role uses."}
          </p>
        </div>

        {/* Right: the form. */}
        <div className="w-full max-w-md md:justify-self-end">
          <div className="mb-8 md:hidden">
            <p className="mb-3 text-eyebrow uppercase text-signal">
              {isRegister ? "Create account" : "Welcome back"}
            </p>
            <h1 className="text-headline text-ink-bright">
              {isRegister ? "Start shipping." : "Sign in."}
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

            {isRegister ? (
              <AuthField
                label="Full name"
                value={name}
                onChange={setName}
                autoComplete="name"
                required
              />
            ) : null}

            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />

            {isRegister ? (
              <AuthField
                label="Phone (optional)"
                type="tel"
                value={phone}
                onChange={setPhone}
                autoComplete="tel"
              />
            ) : null}

            <AuthField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              hint={isRegister ? "At least 8 characters" : undefined}
            />

            {!isRegister ? (
              <Link
                href="/forgot-password"
                className="-mt-2 self-end text-caption text-ink-muted underline-offset-4 hover:text-signal hover:underline"
              >
                Forgot password?
              </Link>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mt-3 rounded-full bg-signal px-8 py-4 text-caption font-medium uppercase tracking-wider text-ink transition-transform duration-fast ease-signature hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {busy
                ? "Working…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-caption text-ink-muted">
            {isRegister ? "Already registered? " : "No account yet? "}
            <Link
              href={isRegister ? "/login" : "/register"}
              className="text-signal underline-offset-4 hover:underline"
            >
              {isRegister ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

