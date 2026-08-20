import { AuthForm } from "../AuthForm";

export const metadata = {
  title: "Sign in — Last-Mile",
  description: "Sign in to create, track and dispatch deliveries.",
};

/**
 * Middleware sends unauthenticated traffic here with a `next` parameter naming
 * the page that was asked for, so signing in returns the visitor to where they
 * were going rather than to a generic dashboard.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  // Only same-origin paths are honoured. Accepting an arbitrary `next` would
  // turn the sign-in page into an open redirect: a link to
  // /login?next=https://evil.example would bounce a freshly authenticated user
  // straight off the site.
  const raw = searchParams?.next;
  const next =
    raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;

  return <AuthForm mode="login" next={next} />;
}
