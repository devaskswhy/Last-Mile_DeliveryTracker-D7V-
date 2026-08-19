"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiRequest } from "../_components/client";
import {
  Button,
  Field,
  Notice,
  Table,
  cellClass,
  inputClass,
  rowClass,
} from "../_components/ui";

export interface ZoneRow {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  dependents: { areas: number; rateCards: number; agents: number; orders: number };
}

export function ZoneManager({ zones }: { zones: ZoneRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const refresh = () => startTransition(() => router.refresh());
  const working = busy || pending;

  async function createZone(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest("/api/admin/zones", {
      method: "POST",
      body: JSON.stringify({ name, code }),
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create the zone");
      return;
    }
    setName("");
    setCode("");
    refresh();
  }

  async function toggleActive(zone: ZoneRow) {
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/admin/zones/${zone.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !zone.isActive }),
    });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not update the zone");
    else refresh();
  }

  async function remove(zone: ZoneRow) {
    if (!confirm(`Delete zone ${zone.code}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/admin/zones/${zone.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not delete the zone");
    else refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice kind="error">{error}</Notice> : null}

      <form
        onSubmit={createZone}
        className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-gray-800"
      >
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zone name"
            required
          />
        </Field>
        <Field label="Code" hint="Letters, digits, underscores">
          <input
            className={`${inputClass} uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ZONE_CODE"
            required
          />
        </Field>
        <Button type="submit" disabled={working}>
          {working ? "Saving…" : "Add zone"}
        </Button>
      </form>

      <Table headers={["Code", "Name", "Status", "Referenced by", ""]}>
        {zones.map((zone) => {
          const { areas, rateCards, agents, orders } = zone.dependents;
          const refs = [
            areas && `${areas} area(s)`,
            rateCards && `${rateCards} rate card(s)`,
            agents && `${agents} agent(s)`,
            orders && `${orders} order(s)`,
          ].filter(Boolean) as string[];

          return (
            <tr key={zone.id} className={rowClass}>
              <td className={`${cellClass} font-mono text-xs`}>{zone.code}</td>
              <td className={cellClass}>{zone.name}</td>
              <td className={cellClass}>
                {zone.isActive ? "Active" : "Inactive"}
              </td>
              <td className={`${cellClass} text-gray-500 dark:text-gray-400`}>
                {refs.length ? refs.join(", ") : "—"}
              </td>
              <td className={cellClass}>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={working}
                    onClick={() => toggleActive(zone)}
                  >
                    {zone.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={working}
                    onClick={() => remove(zone)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}
        {zones.length === 0 ? (
          <tr>
            <td colSpan={5} className="py-4 text-gray-500 dark:text-gray-400">
              No zones yet. Add one above.
            </td>
          </tr>
        ) : null}
      </Table>
    </div>
  );
}
