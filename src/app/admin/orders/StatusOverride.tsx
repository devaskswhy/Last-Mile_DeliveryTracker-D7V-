"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiRequest } from "@/components/client";
import { Button, Notice, inputClass } from "@/components/ui";
import { ORDER_STATUSES } from "@/lib/domain/enums";

/**
 * Admin status override.
 *
 * Every status is offered, including ones the state machine would refuse —
 * that is what an override is for. The reason is required, because a change
 * that steps outside the normal flow is exactly the one someone will need
 * explained six months later.
 */
export function StatusOverride({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");

  const working = busy || pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest(`/api/admin/orders/${orderId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, reason: reason.trim() }),
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not override the status");
      return;
    }
    setOpen(false);
    setStatus("");
    setReason("");
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Override status
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={inputClass}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          required
        >
          <option value="">Set status to…</option>
          {ORDER_STATUSES.filter((s) => s !== currentStatus).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className={`${inputClass} w-56`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (required)"
          required
        />
        <Button type="submit" disabled={working || status === "" || reason.trim().length < 3}>
          {working ? "Saving…" : "Apply"}
        </Button>
        <Button variant="secondary" disabled={working} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
