/**
 * Placeholder sign-in page. Middleware redirects unauthenticated browser
 * traffic here with a `next` query param naming the originally requested path.
 * The real form lands with the customer-facing UI; the API is already live.
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Sign-in UI is not built yet. The endpoint is live at{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">
          POST /api/auth/login
        </code>
        .
      </p>
    </main>
  );
}
