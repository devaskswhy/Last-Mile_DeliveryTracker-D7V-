"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiRequest } from "@/components/client";
import { Button, Notice, inputClass } from "@/components/ui";

export interface AgentOption {
  id: string;
  employeeCode: string;
  name: string;
  availability: string;
  zoneCode: string | null;
  activeOrderCount: number;
  isActive: boolean;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  pickupZoneCode: string;
  dropZoneCode: string;
  customerName: string;
  totalCharge: string;
  assignedAgent: { id: string; name: string; employeeCode: string } | null;
  isTerminal: boolean;
}

/**
 * Per-order assignment controls.
 *
 * The agent list is not filtered to the pickup zone: manual assignment is an
 * override, and a dispatcher looking at a real situation may know something the
 * policy does not. Each option shows availability, zone and current workload so
 * the choice is informed rather than blind.
 */
export function AssignmentControls({
  order,
  agents,
}: {
  order: OrderRow;
  agents: AgentOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");

  const working = busy || pending;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await apiRequest<{
      agent: { name: string; employeeCode: string };
      previousAgent: { name: string } | null;
      status: string;
    }>(`/api/admin/orders/${order.id}/assign`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not assign the order");
      return;
    }

    const { agent, previousAgent } = result.data;
    setNotice(
      previousAgent
        ? `Reassigned from ${previousAgent.name} to ${agent.name} (${agent.employeeCode}).`
        : `Assigned to ${agent.name} (${agent.employeeCode}).`,
    );
    setAgentId("");
    startTransition(() => router.refresh());
  }

  if (order.isTerminal) {
    return (
      <span className="text-[0.6875rem] text-ink-muted">
        {order.status} — closed
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {notice ? <Notice kind="success">{notice}</Notice> : null}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${inputClass} max-w-xs`}
          value={agentId}
          disabled={working}
          onChange={(event) => setAgentId(event.target.value)}
        >
          <option value="">Assign to…</option>
          {agents
            .filter((agent) => agent.isActive && agent.id !== order.assignedAgent?.id)
            .map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.employeeCode} · {agent.name} · {agent.zoneCode ?? "no zone"} ·{" "}
                {agent.availability} · {agent.activeOrderCount} active
              </option>
            ))}
        </select>

        <Button
          variant="secondary"
          disabled={working || agentId === ""}
          onClick={() => send({ mode: "MANUAL", agentId })}
        >
          {working ? "Working…" : "Assign"}
        </Button>

        <Button
          variant="secondary"
          disabled={working}
          onClick={() => send({ mode: "AUTO" })}
          title="Re-run auto-assignment for this order"
        >
          Auto-assign
        </Button>
      </div>
    </div>
  );
}
