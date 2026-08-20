"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ORDER_TYPES, PAYMENT_TYPES } from "@/lib/domain/enums";

import { apiRequest } from "./client";
import { Button, Field, Notice, Panel, Tag, inputClass } from "./ui";

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

/** Waits for typing to stop before spending a request on a half-typed pincode. */
const QUOTE_DEBOUNCE_MS = 450;

export function OrderForm({
  customers,
  createdBy,
}: {
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
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  /**
   * The identity of the priced shipment. Everything that changes the price is
   * in here and nothing that does not — editing a contact name must not throw
   * away a valid quote.
   */
  const priceKey = useMemo(
    () =>
      JSON.stringify({
        p: pickup.pincode.trim(),
        d: drop.pincode.trim(),
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

  const readyToQuote =
    pickup.pincode.trim() !== "" &&
    drop.pincode.trim() !== "" &&
    lengthCm !== "" &&
    breadthCm !== "" &&
    heightCm !== "" &&
    actualWeightKg !== "";

  // Guards against an older in-flight quote overwriting a newer one when the
  // user keeps typing — responses can arrive out of order.
  const requestId = useRef(0);

  const fetchQuote = useCallback(async () => {
    const id = ++requestId.current;
    const keyAtRequest = priceKey;

    setQuoting(true);
    setQuoteError(null);

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

    if (id !== requestId.current) return; // A newer request has superseded this.

    setQuoting(false);
    if (!result.ok || !result.data) {
      setQuote(null);
      setQuotedFor(null);
      setQuoteError(result.error ?? "Could not price this shipment");
      return;
    }
    setQuote(result.data.quote);
    setQuotedFor(keyAtRequest);
  }, [
    priceKey,
    pickup.pincode,
    drop.pincode,
    lengthCm,
    breadthCm,
    heightCm,
    actualWeightKg,
    orderType,
    paymentType,
  ]);

  /** Live quoting: re-prices as the pricing fields are filled in. */
  useEffect(() => {
    if (!readyToQuote) {
      setQuote(null);
      setQuotedFor(null);
      setQuoteError(null);
      return;
    }
    if (quotedFor === priceKey) return;

    const timer = window.setTimeout(fetchQuote, QUOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [readyToQuote, priceKey, quotedFor, fetchQuote]);

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

  async function confirm() {
    if (!quote || !quoteIsCurrent) return;

    setBusy(true);
    setError(null);

    const result = await apiRequest<{
      orderId: string;
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
      // A rejected confirmation invalidates the quote, so the button re-locks
      // until a fresh price has been fetched and seen.
      setQuotedFor(null);
      return;
    }

    const assignment = result.data.assignment;
    setCreated(
      assignment.assigned
        ? `Order ${result.data.orderNumber} created — ${assignment.agentName} (${assignment.employeeCode}) is collecting it.`
        : `Order ${result.data.orderNumber} created. ${assignment.reason} — an admin will assign it.`,
    );
    router.push(`/orders/${result.data.orderId}`);
    router.refresh();
  }

  const canConfirm =
    quoteIsCurrent &&
    !busy &&
    (createdBy !== "ADMIN" || customerId !== "") &&
    (paymentType !== "COD" || codAmount !== "") &&
    isAddressComplete(pickup) &&
    isAddressComplete(drop);

  /**
   * Why the button is disabled, checked in the same order `canConfirm`
   * checks its own conditions, so this always names the actual blocker.
   *
   * Before this existed, a quote showing a real price gave no sign that
   * Confirm was still disabled for an unrelated reason — pickup or drop
   * missing a contact name, phone or address line. The button just sat there
   * looking broken. A visible price is not the only requirement to create an
   * order, so the message has to track all of them, not just the price.
   */
  const confirmBlockedReason = (): string | null => {
    if (!quoteIsCurrent) {
      return "A current quote is required before an order can be created.";
    }
    if (createdBy === "ADMIN" && customerId === "") {
      return "Select which customer this order is for.";
    }
    if (!isAddressComplete(pickup) || !isAddressComplete(drop)) {
      return "Fill in the contact name, phone and address line for both pickup and drop.";
    }
    if (paymentType === "COD" && codAmount === "") {
      return "Enter the amount to collect on delivery.";
    }
    return null;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex flex-col gap-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {created ? <Notice kind="success">{created}</Notice> : null}

        {createdBy === "ADMIN" ? (
          <Panel>
            <p className="mb-4 text-eyebrow uppercase text-signal">Customer</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Search" hint="By name or email">
                <input
                  className={inputClass}
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search"
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
          </Panel>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <AddressFields title="Pickup" value={pickup} onChange={setPickup} />
          <AddressFields title="Drop" value={drop} onChange={setDrop} />
        </div>

        <Panel>
          <p className="mb-4 text-eyebrow uppercase text-signal">Parcel</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Length cm">
              <input className={inputClass} inputMode="decimal" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
            </Field>
            <Field label="Breadth cm">
              <input className={inputClass} inputMode="decimal" value={breadthCm} onChange={(e) => setBreadthCm(e.target.value)} />
            </Field>
            <Field label="Height cm">
              <input className={inputClass} inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </Field>
            <Field label="Weight kg">
              <input className={inputClass} inputMode="decimal" value={actualWeightKg} onChange={(e) => setActualWeightKg(e.target.value)} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
              <Field label="Collect on delivery" hint="Goods value, not freight">
                <input className={inputClass} inputMode="decimal" value={codAmount} onChange={(e) => setCodAmount(e.target.value)} />
              </Field>
            ) : null}
          </div>

          <div className="mt-4">
            <Field label="Notes (optional)">
              <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Panel>
      </div>

      {/* Quote panel. Sticky on desktop so the price stays in view while the
          form is filled; in normal flow on a phone, where sticky would eat the
          viewport. */}
      <div className="lg:sticky lg:top-32">
        <QuotePanel
          quote={quoteIsCurrent ? quote : null}
          quoting={quoting}
          error={quoteError}
          ready={readyToQuote}
          stale={quote !== null && !quoteIsCurrent}
        />

        <Button
          onClick={confirm}
          disabled={!canConfirm}
          className="mt-5 w-full py-3.5"
        >
          {busy ? "Creating…" : "Confirm and create order"}
        </Button>

        <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-muted">
          {confirmBlockedReason() ??
            "The server re-prices this on confirm and rejects it if the total has changed."}
        </p>
      </div>
    </div>
  );
}

function isAddressComplete(address: Address): boolean {
  return (
    address.contactName.trim().length >= 2 &&
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
    <Panel>
      <p className="mb-4 text-eyebrow uppercase text-signal">{title}</p>
      <div className="flex flex-col gap-4">
        <Field label="Contact name">
          <input className={inputClass} value={value.contactName} onChange={set("contactName")} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} inputMode="tel" value={value.phone} onChange={set("phone")} />
        </Field>
        <Field label="Address line 1">
          <input className={inputClass} value={value.addressLine1} onChange={set("addressLine1")} />
        </Field>
        <Field label="Address line 2 (optional)">
          <input className={inputClass} value={value.addressLine2} onChange={set("addressLine2")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City">
            <input className={inputClass} value={value.city} onChange={set("city")} />
          </Field>
          <Field label="Pincode" hint="Sets the zone">
            <input className={inputClass} value={value.pincode} onChange={set("pincode")} />
          </Field>
        </div>
      </div>
    </Panel>
  );
}

/** The itemised quote — every figure the charge was built from, not a total. */
function QuotePanel({
  quote,
  quoting,
  error,
  ready,
  stale,
}: {
  quote: Quote | null;
  quoting: boolean;
  error: string | null;
  ready: boolean;
  stale: boolean;
}) {
  const line = "flex items-baseline justify-between gap-3 py-1.5";

  return (
    <Panel className="relative overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-eyebrow uppercase text-signal">Live quote</p>
        {quoting ? (
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-ink-muted">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-signal" />
            pricing
          </span>
        ) : null}
      </div>

      {!ready ? (
        <p className="mt-4 text-caption text-ink-muted">
          Fill in both pincodes, the dimensions and the weight — the price
          appears here as you type.
        </p>
      ) : error ? (
        <p className="mt-4 rounded-xl border border-signal/40 bg-signal-wash px-3 py-2.5 text-caption text-ink-bright">
          {error}
        </p>
      ) : !quote ? (
        <p className="mt-4 text-caption text-ink-muted">
          {stale ? "Re-pricing…" : "Pricing…"}
        </p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{quote.pickupZone.code}</Tag>
            <span className="text-ink-muted">→</span>
            <Tag>{quote.dropZone.code}</Tag>
            <Tag active>{quote.scope}</Tag>
          </div>
          <p className="mt-2 text-[0.6875rem] text-ink-muted">
            {quote.pickupZone.resolvedArea.name} →{" "}
            {quote.dropZone.resolvedArea.name}
          </p>

          <div className="mt-4 border-t border-ink-line pt-3 text-caption">
            <div className={line}>
              <span className="text-ink-muted">Actual</span>
              <span className="font-mono text-ink-bright">
                {quote.actualWeight} kg
              </span>
            </div>
            <div className={line}>
              <span className="text-ink-muted">
                Volumetric ÷{quote.volumetricDivisor}
              </span>
              <span className="font-mono text-ink-bright">
                {quote.volumetricWeight} kg
              </span>
            </div>
            <div className={line}>
              <span className="text-ink-bright">
                Chargeable
                <span className="ml-1.5 text-[0.6875rem] text-ink-muted">
                  ({quote.chargeableWeightBasis.toLowerCase()})
                </span>
              </span>
              <span className="font-mono text-ink-bright">
                {quote.chargeableWeight} kg
              </span>
            </div>
          </div>

          <div className="mt-3 border-t border-ink-line pt-3 text-caption">
            <div className={line}>
              <span className="text-ink-muted">
                Base (first {quote.freightBreakdown.baseWeightKg} kg)
              </span>
              <span className="font-mono text-ink-bright">
                {quote.freightBreakdown.baseRate}
              </span>
            </div>
            <div className={line}>
              <span className="text-ink-muted">
                {quote.freightBreakdown.billedExcessKg} kg ×{" "}
                {quote.freightBreakdown.perKgRate}
              </span>
              <span className="font-mono text-ink-bright">
                {quote.freightBreakdown.excessCharge}
              </span>
            </div>
            <div className={line}>
              <span className="text-ink-bright">Freight</span>
              <span className="font-mono text-ink-bright">
                {quote.baseCharge}
              </span>
            </div>
            {quote.codBreakdown ? (
              <div className={line}>
                <span className="text-ink-muted">
                  COD{" "}
                  {quote.codBreakdown.mode === "PERCENTAGE"
                    ? `${quote.codBreakdown.percentage}%${quote.codBreakdown.floorApplied ? " (min)" : ""}`
                    : "flat"}
                </span>
                <span className="font-mono text-ink-bright">
                  {quote.codSurcharge}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink-line pt-4">
            <span className="text-body text-ink-bright">Total</span>
            <span className="font-mono text-title text-signal">
              {quote.totalCharge}
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
