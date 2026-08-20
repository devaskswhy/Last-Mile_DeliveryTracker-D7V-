"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiRequest } from "./client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await apiRequest("/api/auth/logout", { method: "POST" });
        // A full refresh so no server-rendered page keeps the old session's data.
        router.push("/login");
        router.refresh();
      }}
      className="rounded-full border border-ink-line px-3 py-1.5 text-caption text-ink-muted transition-colors duration-fast ease-signature hover:border-ink-muted hover:text-ink-bright disabled:opacity-40"
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
