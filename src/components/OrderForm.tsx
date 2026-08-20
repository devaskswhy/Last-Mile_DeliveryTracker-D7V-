"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ORDER_TYPES, PAYMENT_TYPES } from "@/lib/domain/enums";

import { apiRequest } from "./client";
import { Button, Field, Notice, inputClass } from "./ui";

/** Mirrors the quote payload the rate engine returns. */
interface Quote {
  pickupZone: { code: string; name: string; resolvedArea: { name: string } };
  dropZone: { code: string; name: string; resolvedArea: { name: string } };
  scope: string;
  actualWeight: string;
  volumetricWeight: string;
  chargeableWeight: string;
  chargeableWeightBasis: string;
  baseCharge: string;
  codSurcharge: string;
  totalCharge: string;
  volumetricDivisor: number;
  freightBreakdown: {
    baseRate: string;
    baseWeightKg: string;
    excessWeightKg: string;
    billedExcessKg: number;
    perKgRate: string;
    excessCharge: string;
  };
  codBreakdown:
    | { mode: "FIXED"; amount: string }
    | {
        mode: "PERCENTAGE";
        percentage: string;
        computed: string;
        minAmount: string | null;
        floorApplied: boolean;
      }
    | null;
}

export interface CustomerOption {
  id: string;
  name: string;
  email: string;
}

const emptyAddress = {
  contactName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  pincode: "",
};

type Address = typeof emptyAddress;

/**
 * Order form with a live quote and an explicit confirmation step.
 *
 * The quote is bound to the exact inputs that produced it. Editing any field
 * that affects the price clears it, so the confirm button can never submit a
 * total the customer is no longer looking at — and the server independently
 * refuses a confirmation whose total does not match what it recomputes.
 */
export function OrderForm({
  customers,
  createdBy,
}: {
  /** Present only for the admin "create on behalf of" flow. */
  customers?: CustomerOption[];
  createdBy: "CUSTOMER" | "ADMIN";
}) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [pickup, setPickup] = useState<Address>({ ...emptyAddress });
  const [drop, setDrop] = useState<Address>({ ...emptyAddress });
  const [lengthCm, setLengthCm] = useState("");
  const [breadthCm, setBreadthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [actualWeightKg, setActualWeightKg] = useState("");
  const [orderType, setOrderType] = useState<string>(ORDER_TYPES[0]);
  const [paymentType, setPaymentType] = useState<string>(PAYMENT_TYPES[0]);
  const [codAmount, setCodAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // Identity of the priced shipment. If this changes, the quote on screen no
  // longer describes what the form says, so it stops counting as confirmed.
  const priceKey = useMemo(
    () =>
      JSON.stringify({
        p: pickup.pincode,
        d: drop.pincode,
        lengthCm,
        breadthCm,
        heightCm,
        actualWeightKg,
        orderType,
        paymentType,
      }),
    [
      pickup.pincode,
      drop.pincode,
      lengthCm,
      breadthCm,
      heightCm,
      actualWeightKg,
      orderType,
      paymentType,
    ],
  );

  const quoteIsCurrent = quote !== null && quotedFor === priceKey;

  const customerOptions = useMemo(() => {
    if (!customers) return [];
    const needle = customerQuery.trim().toLowerCase();
    if (!needle) return customers.slice(0, 20);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.email.toLowerCase().includes(needle),
      )
      .slice(0, 20);
  }, [customers, customerQuery]);

  async function getQuote() {
    setBusy(true);
    setError(null);
    setCreated(null);

    const result = await apiRequest<{ quote: Quote }>("/api/orders/quote", {
      method: "POST",
      body: JSON.stringify({
        pickupPincode: pickup.pincode,
        dropPincode: drop.pincode,
        lengthCm,
        breadthCm,
        heightCm,
        actualWeightKg,
        orderType,
        paymentType,
      }),
    });

    setBusy(false);
    if (!result.ok || !result.data) {
      setQuote(null);
      setQuotedFor(null);
      setError(result.error ?? "Could not price this shipment");
      return;
    }

    setQuote(result.data.quote);
    setQuotedFor(priceKey);
  }

  async function confirm() {
    if (!quote || !quoteIsCurrent) return;

    setBusy(true);
    setError(null);

    const result = await apiRequest<{
      orderNumber: string;
      assignment:
        | { assigned: true; agentName: string; employeeCode: string }
        | { assigned: false; reason: string };
    }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        ...(createdBy === "ADMIN" ? { customerId } : {}),
        pickup: { ...pickup, addressLine2: pickup.addressLine2 || null },
        drop: { ...drop, addressLine2: drop.addressLine2 || null },
        lengthCm,
        breadthCm,
        heightCm,
        actualWeightKg,
        orderType,
        paymentType,
        ...(paymentType === "COD" ? { codAmount } : {}),
        ...(notes ? { notes } : {}),
        // The figure on screen, sent to be checked — never used as the price.
        acknowledgedTotal: quote.totalCharge,
      }),
    });

    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not create the order");
      // A stale quote must be re-fetched before the button works again.
      setQuotedFor(null);
      return;
    }

    const assignment = result.data.assignment;
    setCreated(
      assignment.assigned
        ? `Order ${result.data.orderNumber} created and auto-assigned to ${assignment.agentName} (${assignment.employeeCode}).`
        : `Order ${result.data.orderNumber} created. ${assignment.reason} — an admin will assign it.`,
    );
    setQuote(null);
    setQuotedFor(null);
    router.refresh();
  }

  const canQuote =
    pickup.pincode.trim() !== "" &&
    drop.pincode.trim() !== "" &&
    lengthCm !== "" &&
    breadthCm !== "" &&
    heightCm !== "" &&
    actualWeightKg !== "";

  const canConfirm =
    quoteIsCurrent &&
    !busy &&
    (createdBy !== "ADMIN" || customerId !== "") &&
    (paymentType !== "COD" || codAmount !== "") &&
    isAddressComplete(pickup) &&
    isAddressComplete(drop);

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {created ? <Notice kind="success">{created}</Notice> : null}

      {createdBy === "ADMIN" ? (
        <section className="rounded border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="mb-3 text-sm font-medium">Customer</h3>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Search" hint="By name or email">
              <input
                className={inputClass}
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search customers"
              />
            </Field>
            <Field label="Order is for">
              <select
                className={inputClass}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                <option value="">Select a customer…</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.email}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <AddressFields title="Pickup" value={pickup} onChange={setPickup} />
        <AddressFields title="Drop" value={drop} onChange={setDrop} />
      </div>

      <section className="rounded border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="mb-3 text-sm font-medium">Parcel</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Length (cm)">
            <input className={`${inputClass} w-24`} value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
          </Field>
          <Field label="Breadth (cm)">
            <input className={`${inputClass} w-24`} value={breadthCm} onChange={(e) => setBreadthCm(e.target.value)} />
          </Field>
          <Field label="Height (cm)">
            <input className={`${inputClass} w-24`} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </Field>
          <Field label="Actual weight (kg)">
            <input className={`${inputClass} w-28`} value={actualWeightKg} onChange={(e) => setActualWeightKg(e.target.value)} />
          </Field>
          <Field label="Order type">
            <select className={inputClass} value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Payment">
            <select className={inputClass} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          {paymentType === "COD" ? (
            <Field label="Collect from consignee" hint="Goods value, not freight">
              <input className={`${inputClass} w-32`} value={codAmount} onChange={(e) => setCodAmount(e.target.value)} />
            </Field>
          ) : null}
        </div>
        <div className="mt-3">
          <Field label="Notes (optional)">
            <input className={`${inputClass} w-full`} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={!canQuote || busy} onClick={getQuote}>
          {busy ? "Working…" : quoteIsCurrent ? "Refresh quote" : "Get quote"}
        </Button>
        {quote && !quoteIsCurrent ? (
          <span className="text-sm text-amber-700 dark:text-amber-400">
            The parcel changed — get a new quote before confirming.
          </span>
        ) : null}
      </div>

      {quote && quoteIsCurrent ? (
        <QuoteBreakdown quote={quote} />
      ) : null}

      <div>
        <Button disabled={!canConfirm} onClick={confirm}>
          {busy ? "Creating…" : "Confirm and create order"}
        </Button>
        {!quoteIsCurrent ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            A current quote is required before an order can be created.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function isAddressComplete(address: Address): boolean {
  return (
    address.contactName.trim() !== "" &&
    address.phone.trim() !== "" &&
    address.addressLine1.trim() !== "" &&
    address.city.trim() !== "" &&
    address.pincode.trim() !== ""
  );
}

function AddressFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: Address;
  onChange: (next: Address) => void;
}) {
  const set = (key: keyof Address) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: event.target.value });

  return (
    <section className="rounded border border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <div className="flex flex-col gap-3">
        <Field label="Contact name">
          <input className={inputClass} value={value.contactName} onChange={set("contactName")} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={value.phone} onChange={set("phone")} />
        </Field>
        <Field label="Address line 1">
          <input className={inputClass} value={value.addressLine1} onChange={set("addressLine1")} />
        </Field>
        <Field label="Address line 2 (optional)">
          <input className={inputClass} value={value.addressLine2} onChange={set("addressLine2")} />
        </Field>
        <Field label="City">
          <input className={inputClass} value={value.city} onChange={set("city")} />
        </Field>
        <Field label="Pincode" hint="Resolves the delivery zone">
          <input className={inputClass} value={value.pincode} onChange={set("pincode")} />
        </Field>
      </div>
    </section>
  );
}

/** The itemised quote — every figure the charge was built from, not just a total. */
function QuoteBreakdown({ quote }: { quote: Quote }) {
  const row = "flex justify-between gap-4 py-1";

  return (
    <section className="rounded border border-gray-300 p-4 dark:border-gray-700">
      <h3 className="text-sm font-medium">Quote</h3>

      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Route
          </div>
          <div className={row}>
            <span>Pickup zone</span>
            <span className="font-mono">
              {quote.pickupZone.code} ({quote.pickupZone.resolvedArea.name})
            </span>
          </div>
          <div className={row}>
            <span>Drop zone</span>
            <span className="font-mono">
              {quote.dropZone.code} ({quote.dropZone.resolvedArea.name})
            </span>
          </div>
          <div className={row}>
            <span>Scope</span>
            <span className="font-mono">{quote.scope}</span>
          </div>
        </div>

        <div className="text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Weight
          </div>
          <div className={row}>
            <span>Actual</span>
            <span className="font-mono">{quote.actualWeight} kg</span>
          </div>
          <div className={row}>
            <span>Volumetric (÷{quote.volumetricDivisor})</span>
            <span className="font-mono">{quote.volumetricWeight} kg</span>
          </div>
          <div className={`${row} font-medium`}>
            <span>Chargeable ({quote.chargeableWeightBasis.toLowerCase()})</span>
            <span className="font-mono">{quote.chargeableWeight} kg</span>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-200 pt-3 text-sm dark:border-gray-800">
        <div className={row}>
          <span>
            Base rate (first {quote.freightBreakdown.baseWeightKg} kg)
          </span>
          <span className="font-mono">{quote.freightBreakdown.baseRate}</span>
        </div>
        <div className={row}>
          <span>
            Excess {quote.freightBreakdown.excessWeightKg} kg → billed{" "}
            {quote.freightBreakdown.billedExcessKg} kg × {quote.freightBreakdown.perKgRate}
          </span>
          <span className="font-mono">{quote.freightBreakdown.excessCharge}</span>
        </div>
        <div className={`${row} border-t border-gray-100 pt-2 dark:border-gray-900`}>
          <span>Freight</span>
          <span className="font-mono">{quote.baseCharge}</span>
        </div>

        {quote.codBreakdown ? (
          <div className={row}>
            <span>
              COD surcharge (
              {quote.codBreakdown.mode === "FIXED"
                ? "flat"
                : `${quote.codBreakdown.percentage}%${quote.codBreakdown.floorApplied ? `, minimum ${quote.codBreakdown.minAmount} applied` : ""}`}
              )
            </span>
            <span className="font-mono">{quote.codSurcharge}</span>
          </div>
        ) : null}

        <div className={`${row} border-t border-gray-300 pt-2 text-base font-semibold dark:border-gray-700`}>
          <span>Total</span>
          <span className="font-mono">{quote.totalCharge}</span>
        </div>
      </div>
    </section>
  );
}
