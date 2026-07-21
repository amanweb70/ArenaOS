import { describe, expect, it } from "vitest";
import { InMemoryRunRepository, createArenaSystem } from "@arena/core";
import { headlessGridPlugin } from "@arena/plugin-headless-grid";
import { scriptedAgentPlugin } from "@arena/plugin-scripted-agent";
import { nativeEvaluatorsPlugin } from "@arena/plugin-native-evaluators";

async function createTestSystem() {
  const repository = new InMemoryRunRepository();
  const system = createArenaSystem(repository);
  await system.plugins.register(headlessGridPlugin);
  await system.plugins.register(scriptedAgentPlugin);
  await system.plugins.register(nativeEvaluatorsPlugin);
  return system;
}

describe("ArenaOS platform spine", () => {
  it("registers components through plugins", async () => {
    const system = await createTestSystem();

    expect(system.registries.environments.has("headless-grid")).toBe(true);
    expect(system.registries.agents.has("scripted-agent")).toBe(true);
    expect(system.registries.evaluators.has("success")).toBe(true);
    expect(system.plugins.list()).toHaveLength(3);
  });

  it("runs a deterministic episode, evaluates it, and records replay", async () => {
    const system = await createTestSystem();
    const streamedEvents: string[] = [];
    system.eventBus.subscribe({}, (event) => {
      streamedEvents.push(event.type);
    });

    const run = await system.orchestrator.runExperiment({
      name: "Core integration test",
      environmentId: "headless-grid",
      agentId: "scripted-agent",
      evaluatorIds: [
        "success",
        "step-efficiency",
        "invalid-actions",
        "collisions"
      ],
      seed: 42,
      episodeLimits: { maxSteps: 30 }
    });

    expect(run.status).toBe("completed");
    expect(run.terminationReason).toBe("goal_reached");
    expect(run.steps).toBeGreaterThan(0);
    expect(run.steps).toBeLessThanOrEqual(30);
    expect(run.replay).toHaveLength(run.steps);
    expect(run.events.some((event) => event.type === "agent.action_validated")).toBe(
      true
    );
    expect(
      run.events.some((event) => event.type === "environment.step_completed")
    ).toBe(true);
    expect(run.events.at(-1)?.type).toBe("runtime.terminated");
    expect(streamedEvents).toEqual(run.events.map((event) => event.type));

    const success = run.evaluations.find(
      (evaluation) => evaluation.evaluatorId === "success"
    );
    const invalidActions = run.evaluations.find(
      (evaluation) => evaluation.evaluatorId === "invalid-actions"
    );
    const collisions = run.evaluations.find(
      (evaluation) => evaluation.evaluatorId === "collisions"
    );
    expect(success?.passed).toBe(true);
    expect(invalidActions?.passed).toBe(true);
    expect(collisions?.passed).toBe(true);

    const persisted = await system.runRepository.get(run.id);
    expect(persisted).toEqual(run);
  });
});
