"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ORDER_TYPES, deriveScope } from "@/lib/domain/enums";

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

export interface RateCardRow {
  id: string;
  orderType: string;
  scope: string;
  baseRate: string | null;
  baseWeightKg: string | null;
  perKgRate: string | null;
  isActive: boolean;
  fromZone: { id: string; code: string };
  toZone: { id: string; code: string };
}

export interface Gap {
  orderType: string;
  scope: string;
  fromZone: { id: string; code: string };
  toZone: { id: string; code: string };
  reason: string;
}

export interface ZoneOption {
  id: string;
  code: string;
  name: string;
}

export function RateCardManager({
  rateCards,
  zones,
  gaps,
}: {
  rateCards: RateCardRow[];
  zones: ZoneOption[];
  gaps: Gap[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<string>(ORDER_TYPES[0]);
  const [fromZoneId, setFromZoneId] = useState(zones[0]?.id ?? "");
  const [toZoneId, setToZoneId] = useState(zones[0]?.id ?? "");
  const [baseRate, setBaseRate] = useState("");
  const [baseWeightKg, setBaseWeightKg] = useState("1");
  const [perKgRate, setPerKgRate] = useState("");

  // Gap-fill inputs — the rates applied to every missing combination.
  const [fillBase, setFillBase] = useState("");
  const [fillWeight, setFillWeight] = useState("1");
  const [fillPerKg, setFillPerKg] = useState("");

  const refresh = () => startTransition(() => router.refresh());
  const working = busy || pending;

  // Shown live so it is obvious the scope follows the zone pair rather than
  // being an independent choice.
  const derivedScope =
    fromZoneId && toZoneId ? deriveScope(fromZoneId, toZoneId) : "—";

  const missingOnly = gaps.filter((g) => g.reason === "missing");

  async function createCard(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await apiRequest("/api/admin/rate-cards", {
      method: "POST",
      body: JSON.stringify({
        orderType,
        fromZoneId,
        toZoneId,
        baseRate,
        baseWeightKg,
        perKgRate,
      }),
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create the rate card");
      return;
    }
    setBaseRate("");
    setPerKgRate("");
    refresh();
  }

  /** Creates one card per missing combination, in a single transaction. */
  async function fillGaps(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const cards = missingOnly.map((gap) => ({
      orderType: gap.orderType,
      fromZoneId: gap.fromZone.id,
      toZoneId: gap.toZone.id,
      baseRate: fillBase,
      baseWeightKg: fillWeight,
      perKgRate: fillPerKg,
    }));

    const result = await apiRequest<{ created: number }>(
      "/api/admin/rate-cards/bulk",
      { method: "POST", body: JSON.stringify({ cards }) },
    );

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create the missing cards");
      return;
    }
    setNotice(`Created ${result.data?.created ?? cards.length} rate card(s).`);
    setFillBase("");
    setFillPerKg("");
    refresh();
  }

  async function toggleActive(card: RateCardRow) {
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/admin/rate-cards/${card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !card.isActive }),
    });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not update the card");
    else refresh();
  }

  async function remove(card: RateCardRow) {
    if (!confirm("Delete this rate card?")) return;
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/admin/rate-cards/${card.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not delete the card");
    else refresh();
  }

  if (zones.length === 0) {
    return <Notice kind="warn">Create at least one zone first.</Notice>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {notice ? <Notice kind="success">{notice}</Notice> : null}

      {gaps.length > 0 ? (
        <div className="rounded border border-amber-300 p-4 dark:border-amber-900">
          <Notice kind="warn">
            {gaps.length} zone pair/order-type combination(s) have no usable
            rate card. An order matching one of these cannot be priced.
          </Notice>

          <ul className="mt-3 max-h-40 overflow-y-auto text-sm text-gray-700 dark:text-gray-300">
            {gaps.map((gap) => (
              <li
                key={`${gap.orderType}-${gap.fromZone.id}-${gap.toZone.id}`}
                className="font-mono text-xs"
              >
                {gap.orderType} · {gap.scope} · {gap.fromZone.code} →{" "}
                {gap.toZone.code}
                {gap.reason === "inactive" ? " (card exists but is inactive)" : ""}
              </li>
            ))}
          </ul>

          {missingOnly.length > 0 ? (
            <form
              onSubmit={fillGaps}
              className="mt-4 flex flex-wrap items-end gap-3 border-t border-amber-200 pt-4 dark:border-amber-900"
            >
              <Field label="Base rate" hint={`Applied to all ${missingOnly.length} missing`}>
                <input
                  className={inputClass}
                  value={fillBase}
                  onChange={(e) => setFillBase(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </Field>
              <Field label="Base weight (kg)">
                <input
                  className={inputClass}
                  value={fillWeight}
                  onChange={(e) => setFillWeight(e.target.value)}
                  required
                />
              </Field>
              <Field label="Per-kg rate">
                <input
                  className={inputClass}
                  value={fillPerKg}
                  onChange={(e) => setFillPerKg(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </Field>
              <Button type="submit" disabled={working}>
                {working ? "Creating…" : `Create ${missingOnly.length} missing card(s)`}
              </Button>
            </form>
          ) : null}
        </div>
      ) : (
        <Notice kind="success">
          Every active zone pair has a usable rate card for both order types.
        </Notice>
      )}

      <form
        onSubmit={createCard}
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
        <Field label="From zone">
          <select
            className={inputClass}
            value={fromZoneId}
            onChange={(e) => setFromZoneId(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To zone">
          <select
            className={inputClass}
            value={toZoneId}
            onChange={(e) => setToZoneId(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scope" hint="Derived from the zone pair">
          <input className={`${inputClass} w-24`} value={derivedScope} readOnly disabled />
        </Field>
        <Field label="Base rate">
          <input
            className={`${inputClass} w-28`}
            value={baseRate}
            onChange={(e) => setBaseRate(e.target.value)}
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Base wt (kg)">
          <input
            className={`${inputClass} w-24`}
            value={baseWeightKg}
            onChange={(e) => setBaseWeightKg(e.target.value)}
            required
          />
        </Field>
        <Field label="Per-kg rate">
          <input
            className={`${inputClass} w-28`}
            value={perKgRate}
            onChange={(e) => setPerKgRate(e.target.value)}
            placeholder="0.00"
            required
          />
        </Field>
        <Button type="submit" disabled={working}>
          {working ? "Saving…" : "Add rate card"}
        </Button>
      </form>

      <Table
        headers={["Type", "Scope", "Route", "Base", "Base wt", "Per kg", "Status", ""]}
      >
        {rateCards.map((card) => (
          <tr key={card.id} className={rowClass}>
            <td className={`${cellClass} font-mono text-xs`}>{card.orderType}</td>
            <td className={`${cellClass} font-mono text-xs`}>{card.scope}</td>
            <td className={`${cellClass} font-mono text-xs`}>
              {card.fromZone.code} → {card.toZone.code}
            </td>
            <td className={cellClass}>{card.baseRate}</td>
            <td className={cellClass}>{card.baseWeightKg}</td>
            <td className={cellClass}>{card.perKgRate}</td>
            <td className={cellClass}>{card.isActive ? "Active" : "Inactive"}</td>
            <td className={cellClass}>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={working}
                  onClick={() => toggleActive(card)}
                >
                  {card.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="danger" disabled={working} onClick={() => remove(card)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
        {rateCards.length === 0 ? (
          <tr>
            <td colSpan={8} className="py-4 text-gray-500 dark:text-gray-400">
              No rate cards yet.
            </td>
          </tr>
        ) : null}
      </Table>
    </div>
  );
}
