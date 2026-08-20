import type { Prisma } from "@prisma/client";

import type { OrderStatus } from "@/lib/domain/enums";
import type { Role } from "@/lib/auth/roles";

/**
 * The one place that writes to `order_status_history`.
 *
 * It only ever calls `create`. The table is append-only: a Postgres trigger
 * (migration `order_status_history_append_only`) raises on UPDATE, DELETE and
 * TRUNCATE, so a stray `update` would fail at the database rather than quietly
 * rewriting an audit trail — but funnelling every write through one function
 * means that safety net should never be touched in the first place.
 *
 * A correction is a *new* row recording the corrected status, never an edit to
 * the row that was wrong.
 */
export interface StatusHistoryEntry {
  orderId: string;
  status: OrderStatus;
  /** Previous status; null only for the row recorded at creation. */
  fromStatus?: OrderStatus | null;
  actorId: string | null;
  actorRole: Role;
  note?: string | null;
}

/** Accepts a transaction client so history is written atomically with the change. */
type Client = Prisma.TransactionClient;

export function appendStatusHistory(client: Client, entry: StatusHistoryEntry) {
  return client.orderStatusHistory.create({
    data: {
      orderId: entry.orderId,
      status: entry.status,
      fromStatus: entry.fromStatus ?? null,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      note: entry.note ?? null,
    },
  });
}
