import { describe, expect, it } from "vitest";

import type { OrderStatus } from "@/lib/domain/enums";
import {
  agentCanTransition,
  canTransition,
  isActiveStatus,
  isClosedStatus,
} from "@/lib/domain/order-status";

import { selectAgent, type AssignmentCandidate } from "./assignment";

/**
 * Edge cases found while building phases 4 and 5, pinned so they cannot regress.
 *
 * Both are whole-journey behaviours rather than single functions: an order
 * created with nobody available, and the failure → reschedule → reassignment
 * cycle. They are exercised against the pure policy and the pure state machine,
 * which is where the decisions actually live — the database layer only carries
 * them out.
 */

const NORTH = "z-north";
const SOUTH = "z-south";

const agent = (
  overrides: Partial<AssignmentCandidate> & { employeeCode: string },
): AssignmentCandidate => ({
  agentId: `agent-${overrides.employeeCode}`,
  agentName: `Agent ${overrides.employeeCode}`,
  availability: "AVAILABLE",
  currentZoneId: NORTH,
  activeOrderCount: 0,
  isActiveUser: true,
  ...overrides,
});

/** Mirrors what `createOrder` does with a selection result. */
function statusAfterCreation(candidates: AssignmentCandidate[]): OrderStatus {
  return selectAgent(candidates, NORTH).selected ? "ASSIGNED" : "CREATED";
}

/** Mirrors what `rescheduleDelivery` does after a failure. */
function statusAfterReschedule(candidates: AssignmentCandidate[]): OrderStatus {
  return selectAgent(candidates, NORTH).selected ? "ASSIGNED" : "CREATED";
}

describe("order creation with no agent available", () => {
  it("leaves the order CREATED rather than inventing an assignment", () => {
    // Nobody in the zone at all — a new region, or the first order of the day.
    expect(statusAfterCreation([])).toBe("CREATED");
  });

  it("stays CREATED when everyone in the zone is off shift", () => {
    const candidates = [
      agent({ employeeCode: "AGT-001", availability: "OFFLINE" }),
      agent({ employeeCode: "AGT-002", availability: "BUSY" }),
    ];
    expect(statusAfterCreation(candidates)).toBe("CREATED");
  });

  it("stays CREATED when the only free agent is in another zone", () => {
    const candidates = [
      agent({ employeeCode: "AGT-009", currentZoneId: SOUTH }),
    ];
    expect(statusAfterCreation(candidates)).toBe("CREATED");
  });

  it("stays CREATED when the only candidate's account is deactivated", () => {
    const candidates = [agent({ employeeCode: "AGT-001", isActiveUser: false })];
    expect(statusAfterCreation(candidates)).toBe("CREATED");
  });

  it("reports why, so the order screen can explain the wait", () => {
    const result = selectAgent([], NORTH);
    expect(result.selected).toBeNull();
    if (result.selected === null) {
      expect(result.reason).toMatch(/no agent is available/i);
    }
  });

  it("an unassigned order is nobody's workload", () => {
    // CREATED must not count toward any agent's active total, or the very
    // first unassigned order would skew the next assignment.
    expect(isActiveStatus("CREATED")).toBe(false);
  });

  it("can still be picked up later, once somebody frees up", () => {
    // The retry path an admin triggers from the orders screen.
    expect(canTransition("CREATED", "ASSIGNED")).toBe(true);
    expect(statusAfterCreation([agent({ employeeCode: "AGT-001" })])).toBe(
      "ASSIGNED",
    );
  });
});

describe("failed → reschedule → reassign cycle", () => {
  it("walks the full cycle and returns to the delivery path", () => {
    // Out for delivery, nobody home.
    expect(agentCanTransition("OUT_FOR_DELIVERY", "FAILED")).toBe(true);

    // FAILED is not the end — this is the regression this test exists for.
    expect(isClosedStatus("FAILED")).toBe(false);

    // The customer picks a date; assignment runs again and finds someone.
    const rescheduled = statusAfterReschedule([
      agent({ employeeCode: "AGT-002", activeOrderCount: 1 }),
    ]);
    expect(rescheduled).toBe("ASSIGNED");
    expect(canTransition("FAILED", "ASSIGNED")).toBe(true);

    // And the second attempt runs the normal course.
    expect(agentCanTransition("ASSIGNED", "PICKED_UP")).toBe(true);
    expect(agentCanTransition("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(agentCanTransition("IN_TRANSIT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(agentCanTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("falls back to CREATED when the reschedule finds nobody free", () => {
    // A second failure mode: the date is booked but no agent is available yet.
    expect(statusAfterReschedule([])).toBe("CREATED");
    expect(canTransition("FAILED", "CREATED")).toBe(true);
  });

  it("can fail a second time and be rescheduled again", () => {
    // Nothing about the cycle is single-use.
    expect(agentCanTransition("OUT_FOR_DELIVERY", "FAILED")).toBe(true);
    expect(canTransition("FAILED", "ASSIGNED")).toBe(true);
    expect(agentCanTransition("OUT_FOR_DELIVERY", "FAILED")).toBe(true);
  });

  it("does not reuse the failed agent by default", () => {
    // Reassignment re-runs the policy rather than handing it back. The agent
    // who just failed now carries one more active order than an idle
    // colleague, so the colleague wins on load.
    const failedAgent = agent({
      employeeCode: "AGT-001",
      activeOrderCount: 3,
    });
    const idleColleague = agent({
      employeeCode: "AGT-002",
      activeOrderCount: 0,
    });

    const result = selectAgent([failedAgent, idleColleague], NORTH);
    expect(result.selected?.employeeCode).toBe("AGT-002");
  });

  it("will reuse the failed agent when they are genuinely the best choice", () => {
    // Not a rule against them — just load balancing. Alone in the zone, they
    // get it back, which is correct: the alternative is nobody.
    const result = selectAgent(
      [agent({ employeeCode: "AGT-001", activeOrderCount: 4 })],
      NORTH,
    );
    expect(result.selected?.employeeCode).toBe("AGT-001");
  });

  it("cannot be rescheduled by an agent — only the customer picks the date", () => {
    expect(agentCanTransition("FAILED", "ASSIGNED")).toBe(false);
    expect(agentCanTransition("FAILED", "PICKED_UP")).toBe(false);
  });

  it("a delivered order never re-enters the cycle", () => {
    expect(isClosedStatus("DELIVERED")).toBe(true);
    expect(canTransition("DELIVERED", "FAILED")).toBe(false);
    expect(canTransition("DELIVERED", "ASSIGNED")).toBe(false);
  });
});
