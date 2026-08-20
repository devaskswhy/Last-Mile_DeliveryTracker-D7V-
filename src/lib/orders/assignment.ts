import type { Prisma } from "@prisma/client";

import type { AgentAvailability } from "@/lib/domain/enums";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain/order-status";

/**
 * Agent auto-assignment.
 *
 * ## Strategy: fewest active orders, not nearest by coordinates
 *
 * The schema carries `currentLat` / `currentLng`, so proximity was available.
 * Load balancing was chosen instead, for three reasons:
 *
 * 1. **The data is always true.** An active-order count is derived from the
 *    orders table, so it cannot be stale. Coordinates are nullable and only as
 *    fresh as the last time an agent's device reported in — `lastLocationAt`
 *    exists precisely because they go stale. Assigning on a stale position
 *    fails silently: the dispatch looks reasonable and the parcel is simply
 *    late.
 * 2. **Straight-line distance is not travel distance.** Great-circle metres
 *    ignore rivers, one-way systems and the fact that the nearest agent may be
 *    heading the other way. Proximity that ignores the road network is a
 *    confident-looking guess.
 * 3. **Proximity alone overloads people.** The closest agent to a busy
 *    catchment is closest to *every* order in it, so nearest-first piles work
 *    on one person while colleagues idle. Balancing on load is self-correcting:
 *    whoever gets an order becomes less eligible for the next one.
 *
 * Zone membership already provides the geographic constraint — an agent is only
 * a candidate if their current zone is the order's pickup zone — so distance
 * would be refining a choice that is geographically sound to begin with.
 *
 * The coordinates remain in the schema. A future dispatcher with a routing
 * service can use them to break ties on real travel time, which is the point at
 * which proximity starts being worth more than it costs.
 */

export type AssignmentStrategy = "FEWEST_ACTIVE_ORDERS";

export const ASSIGNMENT_STRATEGY: AssignmentStrategy = "FEWEST_ACTIVE_ORDERS";

export interface AssignmentCandidate {
  agentId: string;
  employeeCode: string;
  agentName: string;
  availability: AgentAvailability;
  currentZoneId: string | null;
  /** Orders already on this agent in a status that still needs work. */
  activeOrderCount: number;
  /** False when the underlying user account has been deactivated. */
  isActiveUser: boolean;
}

export type AssignmentSelection =
  | { selected: AssignmentCandidate; consideredCount: number }
  | { selected: null; reason: string; consideredCount: number };

/**
 * Picks the agent for an order. Pure: no I/O, so the policy can be tested
 * exhaustively without a database.
 *
 * Ties are broken by `employeeCode` so the same inputs always give the same
 * agent — an assignment that varied run to run would be untestable and
 * unexplainable to whoever asks why they got the job. The bias this introduces
 * is self-correcting: the agent who wins a tie is one order busier and loses
 * the next one.
 */
export function selectAgent(
  candidates: readonly AssignmentCandidate[],
  pickupZoneId: string,
): AssignmentSelection {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.isActiveUser &&
      candidate.availability === "AVAILABLE" &&
      candidate.currentZoneId === pickupZoneId,
  );

  if (eligible.length === 0) {
    return {
      selected: null,
      reason: "No agent is available in the pickup zone",
      consideredCount: candidates.length,
    };
  }

  const ranked = [...eligible].sort(
    (a, b) =>
      a.activeOrderCount - b.activeOrderCount ||
      a.employeeCode.localeCompare(b.employeeCode),
  );

  return { selected: ranked[0], consideredCount: candidates.length };
}

// ---------------------------------------------------------------------------
// Database side
// ---------------------------------------------------------------------------

type Client = Prisma.TransactionClient;

/**
 * Loads every agent currently sitting in `pickupZoneId` with their active-order
 * count.
 *
 * Counting is delegated to Prisma's `_count` with a status filter rather than
 * being tallied in application code, so the number reflects the database at the
 * moment of the read.
 *
 * Note on concurrency: two orders created at the same instant can both see an
 * agent at the same count and both pick them. Under the default read-committed
 * isolation neither transaction sees the other's uncommitted assignment. The
 * outcome is that one agent receives two orders instead of one — undesirable
 * but not corrupting, and self-correcting on the next assignment once both
 * commit. Serialising every assignment behind a lock would cost far more than
 * the imbalance it prevents at this volume.
 */
export async function loadAssignmentCandidates(
  client: Client,
  pickupZoneId: string,
): Promise<AssignmentCandidate[]> {
  const agents = await client.agent.findMany({
    where: { currentZoneId: pickupZoneId },
    select: {
      id: true,
      employeeCode: true,
      availability: true,
      currentZoneId: true,
      user: { select: { name: true, isActive: true } },
      _count: {
        select: {
          orders: {
            where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
          },
        },
      },
    },
  });

  return agents.map((agent) => ({
    agentId: agent.id,
    employeeCode: agent.employeeCode,
    agentName: agent.user.name,
    availability: agent.availability,
    currentZoneId: agent.currentZoneId,
    activeOrderCount: agent._count.orders,
    isActiveUser: agent.user.isActive,
  }));
}

/** Loads candidates and applies the policy in one step. */
export async function chooseAgentForZone(
  client: Client,
  pickupZoneId: string,
): Promise<AssignmentSelection> {
  const candidates = await loadAssignmentCandidates(client, pickupZoneId);
  return selectAgent(candidates, pickupZoneId);
}
