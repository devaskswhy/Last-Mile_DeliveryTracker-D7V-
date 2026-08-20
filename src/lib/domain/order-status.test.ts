import { describe, expect, it } from "vitest";

import { ORDER_STATUSES, type OrderStatus } from "./enums";
import {
  ALLOWED_TRANSITIONS,
  AGENT_TRANSITIONS,
  agentCanTransition,
  agentNextStatuses,
  canTransition,
  isActiveStatus,
  isClosedStatus,
} from "./order-status";

/** The happy path the business describes, end to end. */
const HAPPY_PATH: OrderStatus[] = [
  "CREATED",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

describe("state machine shape", () => {
  it("declares a transition list for every status", () => {
    for (const status of ORDER_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status], `missing ${status}`).toBeDefined();
    }
  });

  it("never allows a transition to a status that does not exist", () => {
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const target of targets) {
        expect(ORDER_STATUSES).toContain(target);
      }
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(targets, `${from} loops to itself`).not.toContain(from);
    }
  });

  it("keeps the agent's moves a strict subset of what the domain allows", () => {
    for (const [from, targets] of Object.entries(AGENT_TRANSITIONS)) {
      for (const target of targets ?? []) {
        expect(
          canTransition(from as OrderStatus, target),
          `agent may do ${from} → ${target} but the domain does not allow it`,
        ).toBe(true);
      }
    }
  });
});

describe("the happy path", () => {
  it("walks CREATED through to DELIVERED", () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i += 1) {
      expect(
        canTransition(HAPPY_PATH[i], HAPPY_PATH[i + 1]),
        `${HAPPY_PATH[i]} → ${HAPPY_PATH[i + 1]}`,
      ).toBe(true);
    }
  });

  it("lets an agent drive every step from ASSIGNED onward", () => {
    // CREATED → ASSIGNED is assignment, not an agent action.
    for (let i = 1; i < HAPPY_PATH.length - 1; i += 1) {
      expect(
        agentCanTransition(HAPPY_PATH[i], HAPPY_PATH[i + 1]),
        `agent: ${HAPPY_PATH[i]} → ${HAPPY_PATH[i + 1]}`,
      ).toBe(true);
    }
  });

  it("does not let an agent skip a step", () => {
    expect(agentCanTransition("ASSIGNED", "DELIVERED")).toBe(false);
    expect(agentCanTransition("ASSIGNED", "OUT_FOR_DELIVERY")).toBe(false);
    expect(agentCanTransition("PICKED_UP", "DELIVERED")).toBe(false);
  });

  it("does not let an agent move an order backwards", () => {
    expect(agentCanTransition("IN_TRANSIT", "PICKED_UP")).toBe(false);
    expect(agentCanTransition("OUT_FOR_DELIVERY", "IN_TRANSIT")).toBe(false);
    expect(agentCanTransition("DELIVERED", "OUT_FOR_DELIVERY")).toBe(false);
  });

  it("does not let an agent cancel an order", () => {
    for (const status of ORDER_STATUSES) {
      expect(
        agentCanTransition(status, "CANCELLED"),
        `agent cancelled from ${status}`,
      ).toBe(false);
    }
  });
});

describe("failure", () => {
  it("is reachable from IN_TRANSIT and OUT_FOR_DELIVERY", () => {
    expect(canTransition("IN_TRANSIT", "FAILED")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "FAILED")).toBe(true);
    expect(agentCanTransition("IN_TRANSIT", "FAILED")).toBe(true);
    expect(agentCanTransition("OUT_FOR_DELIVERY", "FAILED")).toBe(true);
  });

  it("is not reachable before the parcel is moving", () => {
    // A delivery cannot fail before it has been attempted.
    expect(canTransition("CREATED", "FAILED")).toBe(false);
    expect(canTransition("ASSIGNED", "FAILED")).toBe(false);
    expect(canTransition("PICKED_UP", "FAILED")).toBe(false);
  });

  it("is not the end of the order — reschedule re-enters the pipeline", () => {
    expect(isClosedStatus("FAILED")).toBe(false);
    expect(canTransition("FAILED", "ASSIGNED")).toBe(true);
    expect(canTransition("FAILED", "CREATED")).toBe(true);
  });

  it("cannot be resumed by an agent — rescheduling is the customer's call", () => {
    expect(agentCanTransition("FAILED", "ASSIGNED")).toBe(false);
    expect(agentCanTransition("FAILED", "PICKED_UP")).toBe(false);
    expect(agentNextStatuses("FAILED")).toEqual([]);
  });

  it("does not count as active workload", () => {
    expect(isActiveStatus("FAILED")).toBe(false);
  });
});

describe("closed statuses", () => {
  it("are DELIVERED and CANCELLED only", () => {
    expect(isClosedStatus("DELIVERED")).toBe(true);
    expect(isClosedStatus("CANCELLED")).toBe(true);
    for (const status of ORDER_STATUSES) {
      if (status !== "DELIVERED" && status !== "CANCELLED") {
        expect(isClosedStatus(status), `${status} should be open`).toBe(false);
      }
    }
  });

  it("accept no further transition at all", () => {
    expect(ALLOWED_TRANSITIONS.DELIVERED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
    for (const status of ORDER_STATUSES) {
      expect(canTransition("DELIVERED", status)).toBe(false);
      expect(canTransition("CANCELLED", status)).toBe(false);
    }
  });

  it("are unreachable as agent moves out of a closed state", () => {
    expect(agentNextStatuses("DELIVERED")).toEqual([]);
    expect(agentNextStatuses("CANCELLED")).toEqual([]);
  });
});

describe("active workload", () => {
  it("counts exactly the statuses where an agent owes work", () => {
    expect(isActiveStatus("ASSIGNED")).toBe(true);
    expect(isActiveStatus("PICKED_UP")).toBe(true);
    expect(isActiveStatus("IN_TRANSIT")).toBe(true);
    expect(isActiveStatus("OUT_FOR_DELIVERY")).toBe(true);

    // An unassigned order is nobody's workload.
    expect(isActiveStatus("CREATED")).toBe(false);
    expect(isActiveStatus("DELIVERED")).toBe(false);
    expect(isActiveStatus("CANCELLED")).toBe(false);
  });
});

describe("cancellation", () => {
  it("is available while the order is still open, but not from OUT_FOR_DELIVERY", () => {
    expect(canTransition("CREATED", "CANCELLED")).toBe(true);
    expect(canTransition("ASSIGNED", "CANCELLED")).toBe(true);
    expect(canTransition("PICKED_UP", "CANCELLED")).toBe(true);
    expect(canTransition("IN_TRANSIT", "CANCELLED")).toBe(true);
    // Once it is on the doorstep the outcome is delivered or failed.
    expect(canTransition("OUT_FOR_DELIVERY", "CANCELLED")).toBe(false);
  });
});
