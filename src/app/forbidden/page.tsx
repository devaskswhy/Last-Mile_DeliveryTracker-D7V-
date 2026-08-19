/** Shown when a signed-in user reaches a route their role cannot access. */
export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">403 — Not allowed</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Your account does not have permission to view this page.
      </p>
    </main>
  );
}
