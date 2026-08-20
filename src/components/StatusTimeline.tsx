import type { OrderStatus } from "@/lib/domain/enums";
import { isClosedStatus } from "@/lib/domain/order-status";

/**
 * The order's progress, two ways.
 *
 * A **stepper** for the shape of the journey — where this order is on the
 * happy path — and a **timeline** underneath for what actually happened,
 * rendered from every `order_status_history` row in order.
 *
 * The two are deliberately different things. The stepper is an idealised five
 * stops; the trail is the record, including the reassignments, overrides and
 * failed attempts that the stepper has no place for. Showing only the stepper
 * would quietly hide the interesting half.
 */

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: "CREATED", label: "Placed" },
  { status: "ASSIGNED", label: "Assigned" },
  { status: "PICKED_UP", label: "Picked up" },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { status: "DELIVERED", label: "Delivered" },
];

/** Which step a status sits at. IN_TRANSIT shares a stop with PICKED_UP. */
const STEP_INDEX: Partial<Record<OrderStatus, number>> = {
  CREATED: 0,
  ASSIGNED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

export interface TimelineRow {
  id: string;
  status: OrderStatus;
  fromStatus: OrderStatus | null;
  note: string | null;
  at: string;
  actorName: string | null;
  actorRole: string;
}

export function StatusStepper({
  status,
  reachedStatuses,
}: {
  status: OrderStatus;
  /** Every status the order has actually held, from its history. */
  reachedStatuses: OrderStatus[];
}) {
  const current = STEP_INDEX[status];
  const failed = status === "FAILED";
  const cancelled = status === "CANCELLED";

  return (
    <div className="flex flex-col gap-4">
      {/* Horizontal on desktop, vertical on a phone — a five-stop stepper
          squeezed into 360px is unreadable. */}
      <ol className="flex flex-col gap-4 md:flex-row md:items-start md:gap-0">
        {STEPS.map((step, index) => {
          // A step counts as done only if the order genuinely held that status,
          // or has moved past it — not merely because the current status
          // outranks it, so a stepper never claims a stop that was skipped.
          const reached =
            reachedStatuses.includes(step.status) ||
            (current !== undefined && index < current);
          const isCurrent = current === index && !failed && !cancelled;

          return (
            <li
              key={step.status}
              className="flex items-start gap-3 md:flex-1 md:flex-col md:gap-2"
            >
              <div className="flex items-center gap-0 md:w-full">
                <span
                  aria-hidden="true"
                  className={`relative z-10 flex h-3 w-3 shrink-0 items-center justify-center rounded-full transition-colors duration-base ease-signature ${
                    reached || isCurrent ? "bg-signal" : "bg-ink-line"
                  }`}
                >
                  {isCurrent ? (
                    <span className="absolute h-3 w-3 animate-ping rounded-full bg-signal opacity-70" />
                  ) : null}
                </span>
                {index < STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`hidden h-px flex-1 md:block ${
                      reached ? "bg-signal" : "bg-ink-line"
                    }`}
                  />
                ) : null}
              </div>

              <span
                className={`text-caption ${
                  isCurrent
                    ? "text-signal"
                    : reached
                      ? "text-ink-bright"
                      : "text-ink-muted"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {failed ? (
        <p className="rounded-xl border border-signal/40 bg-signal-wash px-4 py-3 text-caption text-ink-bright">
          The last delivery attempt failed. Choose a new date below and the
          order rejoins the run.
        </p>
      ) : null}
      {cancelled ? (
        <p className="rounded-xl border border-ink-line px-4 py-3 text-caption text-ink-muted">
          This order was cancelled.
        </p>
      ) : null}
    </div>
  );
}

export function StatusTimeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <ol className="relative flex flex-col gap-0">
      {rows.map((row, index) => {
        const last = index === rows.length - 1;

        return (
          <li key={row.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Rail + node. A pseudo-element rail would be cheaper but this
                stops at the final row instead of dangling past it. */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  last ? "bg-signal" : "bg-ink-line"
                }`}
              />
              {!last ? <span className="w-px flex-1 bg-ink-line" /> : null}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-caption text-ink-bright">
                  {row.fromStatus ? `${row.fromStatus} → ` : ""}
                  {row.status}
                </span>
                <time
                  dateTime={row.at}
                  className="font-mono text-[0.6875rem] text-ink-muted"
                >
                  {new Date(row.at).toLocaleString()}
                </time>
              </div>

              {row.note ? (
                <p className="mt-1.5 break-words text-body text-ink-muted">
                  {row.note}
                </p>
              ) : null}

              <p className="mt-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-muted/70">
                {row.actorName ?? "System"} · {row.actorRole}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { isClosedStatus };
