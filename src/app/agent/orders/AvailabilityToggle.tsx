"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiRequest } from "@/components/client";
import { Notice, Panel } from "@/components/ui";
import { AGENT_AVAILABILITIES } from "@/lib/domain/enums";

const COPY: Record<string, string> = {
  AVAILABLE: "New orders in your zone can be auto-assigned to you.",
  BUSY: "You keep current work; auto-assignment skips you.",
  OFFLINE: "Off shift. Auto-assignment skips you.",
};

/**
 * The agent's own availability.
 *
 * Availability governs auto-assignment only. Going off shift never hands back
 * work already assigned — a parcel in a van does not become undelivered
 * because its driver clocked off — so the count of orders still held is shown
 * alongside, rather than letting someone assume switching off cleared it.
 */
export function AvailabilityToggle({
  initial,
  activeOrderCount,
  zoneCode,
  employeeCode,
}: {
  initial: string;
  activeOrderCount: number;
  zoneCode: string | null;
  employeeCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [availability, setAvailability] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const working = busy || pending;

  async function set(next: string) {
    if (next === availability) return;

    const previous = availability;
    setAvailability(next); // Optimistic — the control must feel instant.
    setBusy(true);
    setError(null);

    const result = await apiRequest("/api/agent/availability", {
      method: "PATCH",
      body: JSON.stringify({ availability: next }),
    });

    setBusy(false);
    if (!result.ok) {
      setAvailability(previous); // Roll back rather than show a state the server rejected.
      setError(result.error ?? "Could not update your status");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow uppercase text-signal">Your status</p>
          <p className="mt-2 text-caption text-ink-muted">
            <span className="font-mono text-ink-bright">{employeeCode}</span>
            {zoneCode ? (
              <>
                {" · zone "}
                <span className="font-mono text-ink-bright">{zoneCode}</span>
              </>
            ) : (
              " · no zone set"
            )}
            {" · "}
            <span className="text-ink-bright">{activeOrderCount}</span> active
          </p>
        </div>

        <div
          role="group"
          aria-label="Availability"
          className="flex rounded-full border border-ink-line p-1"
        >
          {AGENT_AVAILABILITIES.map((option) => {
            const selected = availability === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={working}
                onClick={() => set(option)}
                className={`rounded-full px-3.5 py-1.5 font-mono text-[0.6875rem] uppercase tracking-wider transition-colors duration-fast ease-signature disabled:opacity-60 ${
                  selected
                    ? "bg-signal text-ink"
                    : "text-ink-muted hover:text-ink-bright"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-caption text-ink-muted">{COPY[availability]}</p>

      {availability !== "AVAILABLE" && activeOrderCount > 0 ? (
        <p className="mt-2 text-caption text-ink-bright">
          You still hold {activeOrderCount} order(s) — going off shift does not
          reassign them.
        </p>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}
    </Panel>
  );
}
