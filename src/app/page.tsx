const ENDPOINTS: ReadonlyArray<{
  method: string;
  path: string;
  access: string;
}> = [
  { method: "POST", path: "/api/auth/register", access: "public" },
  { method: "POST", path: "/api/auth/login", access: "public" },
  { method: "POST", path: "/api/auth/logout", access: "public" },
  { method: "GET", path: "/api/me", access: "any signed-in role" },
  { method: "GET", path: "/api/agent/ping", access: "AGENT, ADMIN" },
  { method: "GET", path: "/api/admin/ping", access: "ADMIN" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Last-Mile Delivery Tracker
      </h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Foundation is in place: Prisma schema, migrations, and JWT auth. The
        customer, agent and admin interfaces come next.
      </p>

      <h2 className="mt-10 text-lg font-medium">Available endpoints</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-4 font-medium">Method</th>
              <th className="py-2 pr-4 font-medium">Path</th>
              <th className="py-2 font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((endpoint) => (
              <tr
                key={`${endpoint.method} ${endpoint.path}`}
                className="border-b border-gray-100 dark:border-gray-900"
              >
                <td className="py-2 pr-4 font-mono text-xs">
                  {endpoint.method}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{endpoint.path}</td>
                <td className="py-2 text-gray-600 dark:text-gray-400">
                  {endpoint.access}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
