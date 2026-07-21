import { describe, expect, it } from "vitest";
import { createArenaSystem } from "@arena/core";
import {
  PhysicalAIMissionEnvironment,
  physicalAIPlugin,
  type PhysicalAIState
} from "@arena/plugin-physical-ai";

describe("Physical AI Mission Lab", () => {
  it("truthfully discovers the reference backend when Isaac Sim is unavailable", async () => {
    const previous = process.env.ARENA_ISAAC_AVAILABLE;
    delete process.env.ARENA_ISAAC_AVAILABLE;
    const environment = new PhysicalAIMissionEnvironment();
    await environment.initialize({ episodeId: "capability-test", seed: 606 });
    const reset = await environment.reset({
      episodeId: "capability-test",
      seed: 606,
      scenario: {
        id: "warehouse",
        name: "Warehouse",
        environmentId: "physical-ai-mission-lab-v1",
        parameters: { mode: "single_supervisor", participantIds: ["supervisor"] }
      }
    });
    expect(reset.state.backend.adapter).toBe("arena-reference");
    expect(reset.state.backend.isaacAvailable).toBe(false);
    expect(reset.state.backend.streamingAvailable).toBe(false);
    expect(reset.state.backend.disclosure).toContain("no Isaac video or PhysX result");
    expect(environment.getCapabilities().deterministic).toBe(false);
    expect(reset.observation.availableActions).toEqual(["mission.submit_plan"]);
    expect(reset.observation.data.actionGuidance.nextBestActions[0]).toMatchObject({
      type: "mission.submit_plan"
    });
    if (previous !== undefined) process.env.ARENA_ISAAC_AVAILABLE = previous;
  });

  it("completes the real authoritative Warehouse Rescue Relay with scoring and replay", async () => {
    const run = await runMission(606);
    const state = run.finalState as PhysicalAIState;
    expect(run.status).toBe("completed");
    expect(run.terminationReason).toBe("priority_package_extracted");
    expect(state.result?.success).toBe(true);
    expect(state.objects.find((object) => object.id === "package-p3")?.state).toBe("delivered");
    expect(state.objectives.every((objective) => objective.status === "completed")).toBe(true);
    expect(state.snapshots.map((snapshot) => snapshot.reason)).toEqual(
      expect.arrayContaining([
        "mission_start",
        "plan_accepted",
        "inspection_complete",
        "route_cleared",
        "package_picked",
        "mission_completed"
      ])
    );
    expect(run.replay).toHaveLength(11);
    expect(run.evaluations[0]?.passed).toBe(true);
    expect(run.evaluations[0]?.score).toBeGreaterThan(0.85);
    expect(run.events.some((event) => event.type === "physical_ai.object_delivered")).toBe(true);
  });

  it("enforces participant-to-robot control without crashing the mission", async () => {
    const environment = new PhysicalAIMissionEnvironment();
    await environment.initialize({ episodeId: "routing-test", seed: 707 });
    await environment.reset({
      episodeId: "routing-test",
      seed: 707,
      scenario: {
        id: "cooperation",
        name: "Cooperation",
        environmentId: "physical-ai-mission-lab-v1",
        parameters: {
          mode: "two_agent_cooperation",
          participantIds: ["alpha", "beta"]
        }
      }
    });
    await environment.step({
      id: "plan",
      type: "mission.submit_plan",
      arguments: {
        summary: "Alpha clears the route while Beta inspects.",
        assignments: [
          { robotId: "mobile-01", objective: "clear route" },
          { robotId: "mobile-02", objective: "inspect conveyor" }
        ]
      }
    });
    const rejected = await environment.step({
      id: "wrong-robot",
      type: "robot.navigate",
      arguments: {
        robotId: "mobile-01",
        target: { type: "waypoint", waypointId: "inspection-a" }
      }
    });
    expect(rejected.events?.some((event) => event.type === "physical_ai.action_failed")).toBe(true);
    const state = await environment.getState();
    expect(state.metrics.invalidActions).toBe(1);
    expect(state.robots.find((robot) => robot.id === "mobile-01")?.pose.x).toBe(-5);
  });

  it("replays identical authoritative transforms for the same seed", async () => {
    const first = (await runMission(808)).finalState as PhysicalAIState;
    const second = (await runMission(808)).finalState as PhysicalAIState;
    const snapshot = (state: PhysicalAIState) => ({
      result: state.result,
      metrics: state.metrics,
      robots: state.robots.map((robot) => ({
        id: robot.id,
        pose: robot.pose,
        battery: robot.battery,
        payload: robot.payloadObjectId
      })),
      objects: state.objects.map((object) => ({
        id: object.id,
        pose: object.pose,
        state: object.state
      }))
    });
    expect(snapshot(first)).toEqual(snapshot(second));
  });

  it("gives two independent coordinators exact legal guidance and completes without invalid commands", async () => {
    const system = createArenaSystem();
    await system.plugins.register(physicalAIPlugin);
    const run = await system.orchestrator.runExperiment({
      name: "Two-agent warehouse relay",
      environmentId: "physical-ai-mission-lab-v1",
      agentId: "mission-coordinator",
      participants: [
        { id: "alpha", kind: "agent", agentId: "mission-coordinator", displayName: "ALPHA" },
        { id: "beta", kind: "agent", agentId: "mission-coordinator", displayName: "BETA" }
      ],
      evaluatorIds: ["physical-ai-mission-score"],
      seed: 909,
      scenario: {
        id: "warehouse-team",
        name: "Warehouse team",
        environmentId: "physical-ai-mission-lab-v1",
        parameters: { mode: "two_agent_cooperation", participantIds: ["alpha", "beta"], timeLimitSeconds: 360 }
      },
      episodeLimits: { maxSteps: 28, maxDurationMs: 30_000 }
    });
    const state = run.finalState as PhysicalAIState;
    expect(run.status).toBe("completed");
    expect(state.metrics.invalidActions).toBe(0);
    expect(state.result?.success).toBe(true);
    const routed = run.events
      .filter((event) => event.type === "agent.action_generated")
      .slice(0, 4)
      .map((event) => (event.payload as { participant: { id: string } }).participant.id);
    expect(routed).toEqual(["alpha", "beta", "alpha", "beta"]);
  });
});

async function runMission(seed: number) {
  const system = createArenaSystem();
  await system.plugins.register(physicalAIPlugin);
  return system.orchestrator.runExperiment({
    name: "Warehouse Rescue Relay",
    environmentId: "physical-ai-mission-lab-v1",
    agentId: "mission-coordinator",
    participants: [
      {
        id: "supervisor",
        kind: "agent",
        agentId: "mission-coordinator",
        displayName: "MISSION COORDINATOR",
        role: "supervisor"
      }
    ],
    evaluatorIds: ["physical-ai-mission-score"],
    seed,
    scenario: {
      id: "warehouse-rescue-relay-v1",
      name: "Warehouse Rescue Relay",
      environmentId: "physical-ai-mission-lab-v1",
      parameters: {
        mode: "single_supervisor",
        participantIds: ["supervisor"],
        timeLimitSeconds: 360
      }
    },
    episodeLimits: { maxSteps: 24, maxDurationMs: 30_000 }
  });
}
