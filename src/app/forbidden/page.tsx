import Link from "next/link";

export const metadata = { title: "Not allowed — Last-Mile" };

export default function ForbiddenPage() {
  return (
    <main className="surface-app flex min-h-screen flex-col items-center justify-center gap-5 px-gutter text-center">
      <p className="text-eyebrow uppercase text-signal">403</p>
      <h1 className="text-headline text-ink-bright">
        Your account cannot open this.
      </h1>
      <p className="max-w-prose text-body text-ink-muted">
        You are signed in, but this area belongs to a different role. If that
        seems wrong, ask an admin to check your account.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full border border-ink-line px-6 py-3 text-caption text-ink-bright transition-colors duration-fast ease-signature hover:border-signal hover:text-signal"
      >
        Back to start
      </Link>
    </main>
  );
}
