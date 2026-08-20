"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiRequest } from "@/components/client";
import {
  Button,
  Field,
  Notice,
  Table,
  cellClass,
  inputClass,
  rowClass,
} from "@/components/ui";

export interface AreaRow {
  id: string;
  name: string;
  pincode: string;
  isActive: boolean;
  zone: { id: string; code: string; name: string };
}

export interface ZoneOption {
  id: string;
  code: string;
  name: string;
}

export function AreaManager({
  areas,
  zones,
}: {
  areas: AreaRow[];
  zones: ZoneOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pincode, setPincode] = useState("");
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");

  const refresh = () => startTransition(() => router.refresh());
  const working = busy || pending;

  async function createArea(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest("/api/admin/areas", {
      method: "POST",
      body: JSON.stringify({ name, pincode, zoneId }),
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create the area");
      return;
    }
    setName("");
    setPincode("");
    refresh();
  }

  async function reassign(area: AreaRow, nextZoneId: string) {
    if (nextZoneId === area.zone.id) return;
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/admin/areas/${area.id}`, {
      method: "PATCH",
      body: JSON.stringify({ zoneId: nextZoneId }),
    });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not move the area");
    else refresh();
  }

  async function remove(area: AreaRow) {
    if (!confirm(`Delete area ${area.name}?`)) return;
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/admin/areas/${area.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not delete the area");
    else refresh();
  }

  if (zones.length === 0) {
    return (
      <Notice kind="warn">
        Create a zone first — every area must belong to exactly one.
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice kind="error">{error}</Notice> : null}

      <form
        onSubmit={createArea}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-line bg-ink-soft p-5"
      >
        <Field label="Area name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Area name"
            required
          />
        </Field>
        <Field label="Pincode" hint="Must be unique across zones">
          <input
            className={inputClass}
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            placeholder="Pincode"
            required
          />
        </Field>
        <Field label="Zone">
          <select
            className={inputClass}
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            required
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.code} — {zone.name}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={working}>
          {working ? "Saving…" : "Add area"}
        </Button>
      </form>

      <Table headers={["Pincode", "Area", "Zone", "Status", ""]}>
        {areas.map((area) => (
          <tr key={area.id} className={rowClass}>
            <td className={`${cellClass} font-mono text-caption`}>{area.pincode}</td>
            <td className={cellClass}>{area.name}</td>
            <td className={cellClass}>
              <select
                className={inputClass}
                value={area.zone.id}
                disabled={working}
                onChange={(e) => reassign(area, e.target.value)}
              >
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.code}
                  </option>
                ))}
              </select>
            </td>
            <td className={cellClass}>{area.isActive ? "Active" : "Inactive"}</td>
            <td className={cellClass}>
              <Button
                variant="danger"
                disabled={working}
                onClick={() => remove(area)}
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
        {areas.length === 0 ? (
          <tr>
            <td colSpan={5} className="py-4 text-ink-muted">
              No areas yet.
            </td>
          </tr>
        ) : null}
      </Table>
    </div>
  );
}
