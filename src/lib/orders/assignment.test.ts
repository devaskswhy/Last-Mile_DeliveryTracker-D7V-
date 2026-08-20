import { describe, expect, it } from "vitest";

import { selectAgent, type AssignmentCandidate } from "./assignment";

/**
 * The selection policy is pure, so it is tested directly — no database, no
 * fixtures beyond plain objects.
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

describe("selectAgent", () => {
  it("picks the agent with the fewest active orders", () => {
    const result = selectAgent(
      [
        agent({ employeeCode: "AGT-001", activeOrderCount: 5 }),
        agent({ employeeCode: "AGT-002", activeOrderCount: 1 }),
        agent({ employeeCode: "AGT-003", activeOrderCount: 3 }),
      ],
      NORTH,
    );

    expect(result.selected?.employeeCode).toBe("AGT-002");
  });

  it("only considers agents currently in the pickup zone", () => {
    const result = selectAgent(
      [
        // Idle, but in the wrong zone.
        agent({ employeeCode: "AGT-001", currentZoneId: SOUTH, activeOrderCount: 0 }),
        agent({ employeeCode: "AGT-002", currentZoneId: NORTH, activeOrderCount: 4 }),
      ],
      NORTH,
    );

    expect(result.selected?.employeeCode).toBe("AGT-002");
  });

  it("ignores agents who are not AVAILABLE", () => {
    const result = selectAgent(
      [
        agent({ employeeCode: "AGT-001", availability: "BUSY", activeOrderCount: 0 }),
        agent({ employeeCode: "AGT-002", availability: "OFFLINE", activeOrderCount: 0 }),
        agent({ employeeCode: "AGT-003", availability: "AVAILABLE", activeOrderCount: 9 }),
      ],
      NORTH,
    );

    expect(result.selected?.employeeCode).toBe("AGT-003");
  });

  it("ignores agents whose user account is deactivated", () => {
    const result = selectAgent(
      [
        agent({ employeeCode: "AGT-001", isActiveUser: false, activeOrderCount: 0 }),
        agent({ employeeCode: "AGT-002", activeOrderCount: 7 }),
      ],
      NORTH,
    );

    expect(result.selected?.employeeCode).toBe("AGT-002");
  });

  it("breaks ties deterministically by employee code", () => {
    const candidates = [
      agent({ employeeCode: "AGT-003", activeOrderCount: 2 }),
      agent({ employeeCode: "AGT-001", activeOrderCount: 2 }),
      agent({ employeeCode: "AGT-002", activeOrderCount: 2 }),
    ];

    // Same answer regardless of the order the rows arrive in.
    expect(selectAgent(candidates, NORTH).selected?.employeeCode).toBe("AGT-001");
    expect(selectAgent([...candidates].reverse(), NORTH).selected?.employeeCode).toBe(
      "AGT-001",
    );
  });

  it("reports no selection when nobody is eligible", () => {
    const result = selectAgent(
      [
        agent({ employeeCode: "AGT-001", availability: "OFFLINE" }),
        agent({ employeeCode: "AGT-002", currentZoneId: SOUTH }),
      ],
      NORTH,
    );

    expect(result.selected).toBeNull();
    expect(result).toMatchObject({ consideredCount: 2 });
    if (result.selected === null) {
      expect(result.reason).toMatch(/no agent is available/i);
    }
  });

  it("reports no selection for an empty candidate list", () => {
    const result = selectAgent([], NORTH);

    expect(result.selected).toBeNull();
    expect(result.consideredCount).toBe(0);
  });

  it("never invents an agent outside the candidate list", () => {
    const candidates = [agent({ employeeCode: "AGT-001", activeOrderCount: 3 })];
    const result = selectAgent(candidates, NORTH);

    expect(result.selected).toBe(candidates[0]);
  });

  it("self-corrects: the agent who wins a tie loses the next one", () => {
    const first = selectAgent(
      [
        agent({ employeeCode: "AGT-001", activeOrderCount: 2 }),
        agent({ employeeCode: "AGT-002", activeOrderCount: 2 }),
      ],
      NORTH,
    );
    expect(first.selected?.employeeCode).toBe("AGT-001");

    // After taking that order, AGT-001 is one busier.
    const second = selectAgent(
      [
        agent({ employeeCode: "AGT-001", activeOrderCount: 3 }),
        agent({ employeeCode: "AGT-002", activeOrderCount: 2 }),
      ],
      NORTH,
    );
    expect(second.selected?.employeeCode).toBe("AGT-002");
  });
});
