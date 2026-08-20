"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiRequest } from "./client";
import { Button, Field, Notice, inputClass } from "./ui";

/**
 * Lets the customer book a new delivery date after a failed attempt.
 *
 * Only rendered when the order is FAILED and the viewer owns it. The server
 * re-checks both conditions — this component decides what to show, not what is
 * permitted.
 */
export function RescheduleForm({
  orderId,
  failureReason,
}: {
  orderId: string;
  failureReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [note, setNote] = useState("");

  const working = busy || pending;

  // Earliest selectable day is tomorrow: today's delivery window has already
  // been used by the attempt that failed.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await apiRequest<{
      attemptNumber: number;
      assignment:
        | { assigned: true; agentName: string; employeeCode: string }
        | { assigned: false; reason: string };
    }>(`/api/orders/${orderId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({
        // Midday local avoids a date-only value landing on the previous day
        // once it is parsed as UTC.
        scheduledFor: new Date(`${scheduledFor}T12:00:00`).toISOString(),
        ...(note ? { note } : {}),
      }),
    });

    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not reschedule the delivery");
      return;
    }

    const { attemptNumber, assignment } = result.data;
    setNotice(
      assignment.assigned
        ? `Attempt ${attemptNumber} booked — ${assignment.agentName} (${assignment.employeeCode}) will deliver.`
        : `Attempt ${attemptNumber} booked. ${assignment.reason} — an admin will assign an agent.`,
    );
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded border border-amber-300 p-4 dark:border-amber-900">
      <h2 className="text-sm font-medium">Delivery failed</h2>
      {failureReason ? (
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Reason given: {failureReason}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Pick a new date and we will try again. An agent is assigned fresh, so it
        may not be the same person.
      </p>

      {error ? (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3">
          <Notice kind="success">{notice}</Notice>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="New delivery date">
          <input
            type="date"
            className={inputClass}
            value={scheduledFor}
            min={tomorrow}
            onChange={(event) => setScheduledFor(event.target.value)}
            required
          />
        </Field>
        <Field label="Note for the agent (optional)">
          <input
            className={`${inputClass} w-64`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. leave with the neighbour"
          />
        </Field>
        <Button type="submit" disabled={working || scheduledFor === ""}>
          {working ? "Booking…" : "Reschedule delivery"}
        </Button>
      </form>
    </section>
  );
}
