"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ORDER_TYPES, SURCHARGE_MODES } from "@/lib/domain/enums";

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

export interface SurchargeRow {
  orderType: string;
  mode: string;
  amount: string | null;
  percentage: string | null;
  minAmount: string | null;
  isActive: boolean;
}

export function CodSurchargeManager({
  surcharges,
}: {
  surcharges: SurchargeRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<string>(ORDER_TYPES[0]);
  const [mode, setMode] = useState<string>(SURCHARGE_MODES[0]);
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState("");
  const [minAmount, setMinAmount] = useState("");

  const refresh = () => startTransition(() => router.refresh());
  const working = busy || pending;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    // Only the fields belonging to the chosen mode are sent. The API rejects a
    // payload carrying both, and the column has a CHECK constraint saying the
    // same thing.
    const body =
      mode === "FIXED"
        ? { orderType, mode, amount }
        : {
            orderType,
            mode,
            percentage,
            ...(minAmount ? { minAmount } : {}),
          };

    const result = await apiRequest("/api/admin/cod-surcharges", {
      method: "PUT",
      body: JSON.stringify(body),
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the surcharge");
      return;
    }
    setNotice(`Saved the ${orderType} COD surcharge.`);
    refresh();
  }

  async function remove(row: SurchargeRow) {
    if (!confirm(`Remove the ${row.orderType} COD surcharge?`)) return;
    setBusy(true);
    setError(null);
    const result = await apiRequest(
      `/api/admin/cod-surcharges/${row.orderType}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not remove the surcharge");
    else refresh();
  }

  const configured = new Set(surcharges.map((s) => s.orderType));
  const missing = ORDER_TYPES.filter((t) => !configured.has(t));

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {notice ? <Notice kind="success">{notice}</Notice> : null}
      {missing.length > 0 ? (
        <Notice kind="warn">
          No COD surcharge configured for: {missing.join(", ")}. COD orders of
          that type have no surcharge rule — that is treated as a gap, not as
          &ldquo;charge nothing&rdquo;.
        </Notice>
      ) : null}

      <form
        onSubmit={save}
        className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-gray-800"
      >
        <Field label="Order type">
          <select
            className={inputClass}
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
          >
            {ORDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode">
          <select
            className={inputClass}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {SURCHARGE_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        {mode === "FIXED" ? (
          <Field label="Amount" hint="Flat charge added to freight">
            <input
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </Field>
        ) : (
          <>
            <Field label="Percentage" hint="Percent of freight, 0–100">
              <input
                className={inputClass}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="0.00"
                required
              />
            </Field>
            <Field label="Minimum amount" hint="Optional floor">
              <input
                className={inputClass}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          </>
        )}

        <Button type="submit" disabled={working}>
          {working ? "Saving…" : "Save surcharge"}
        </Button>
      </form>

      <Table headers={["Order type", "Mode", "Value", "Minimum", "Status", ""]}>
        {surcharges.map((row) => (
          <tr key={row.orderType} className={rowClass}>
            <td className={`${cellClass} font-mono text-xs`}>{row.orderType}</td>
            <td className={`${cellClass} font-mono text-xs`}>{row.mode}</td>
            <td className={cellClass}>
              {row.mode === "FIXED" ? row.amount : `${row.percentage}%`}
            </td>
            <td className={cellClass}>{row.minAmount ?? "—"}</td>
            <td className={cellClass}>{row.isActive ? "Active" : "Inactive"}</td>
            <td className={cellClass}>
              <Button variant="danger" disabled={working} onClick={() => remove(row)}>
                Remove
              </Button>
            </td>
          </tr>
        ))}
        {surcharges.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-4 text-gray-500 dark:text-gray-400">
              Nothing configured yet.
            </td>
          </tr>
        ) : null}
      </Table>
    </div>
  );
}
