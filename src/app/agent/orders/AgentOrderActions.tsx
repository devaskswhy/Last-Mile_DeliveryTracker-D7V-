"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiRequest } from "@/components/client";
import { Button, Notice, inputClass } from "@/components/ui";

export interface AgentOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  pickupCity: string;
  pickupPincode: string;
  dropCity: string;
  dropPincode: string;
  paymentType: string;
  codAmount: string | null;
  totalCharge: string;
  nextStatuses: readonly string[];
}

const LABELS: Record<string, string> = {
  PICKED_UP: "Mark picked up",
  IN_TRANSIT: "Start transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Mark delivered",
  FAILED: "Report failure",
};

/**
 * The agent's action buttons for one order.
 *
 * Which buttons appear comes from `nextStatuses`, computed server-side from the
 * same `AGENT_TRANSITIONS` table the API validates against — so the UI cannot
 * offer a move the server would reject, and adding a transition in one place
 * updates both.
 */
export function AgentOrderActions({ order }: { order: AgentOrderRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [askingReason, setAskingReason] = useState(false);

  const working = busy || pending;

  async function move(status: string, note?: string) {
    setBusy(true);
    setError(null);

    const result = await apiRequest(`/api/agent/orders/${order.id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...(note ? { note } : {}) }),
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not update this order");
      return;
    }
    setAskingReason(false);
    setFailureReason("");
    startTransition(() => router.refresh());
  }

  if (order.nextStatuses.length === 0) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        No action available
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Notice kind="error">{error}</Notice> : null}

      {askingReason ? (
        // A failure without a reason is useless to the customer deciding
        // whether to rebook, so the reason is collected before it is recorded.
        <div className="flex flex-wrap items-end gap-2">
          <input
            className={`${inputClass} w-64`}
            value={failureReason}
            onChange={(event) => setFailureReason(event.target.value)}
            placeholder="Why did the delivery fail?"
            autoFocus
          />
          <Button
            variant="danger"
            disabled={working || failureReason.trim() === ""}
            onClick={() => move("FAILED", failureReason.trim())}
          >
            {working ? "Saving…" : "Confirm failure"}
          </Button>
          <Button
            variant="secondary"
            disabled={working}
            onClick={() => setAskingReason(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {order.nextStatuses.map((status) =>
            status === "FAILED" ? (
              <Button
                key={status}
                variant="danger"
                disabled={working}
                onClick={() => setAskingReason(true)}
              >
                {LABELS[status] ?? status}
              </Button>
            ) : (
              <Button
                key={status}
                variant={status === "DELIVERED" ? "primary" : "secondary"}
                disabled={working}
                onClick={() => move(status)}
              >
                {working ? "Working…" : (LABELS[status] ?? status)}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
