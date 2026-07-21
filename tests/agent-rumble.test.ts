import { describe, expect, it, vi } from "vitest";
import { createArenaSystem } from "@arena/core";
import { OpenRouterArenaAgent } from "@arena/plugin-openrouter-agent";
import {
  agentRumblePlugin,
  RumbleCoreEnvironment,
  type RumbleAction,
  type RumbleState
} from "@arena/plugin-agent-rumble";

const participants = [
  { id: "pink", kind: "agent" as const, agentId: "rumble-tactician", displayName: "Pink Pulse" },
  { id: "cyan", kind: "agent" as const, agentId: "rumble-skirmisher", displayName: "Cyan Shift" },
  { id: "gold", kind: "agent" as const, agentId: "rumble-guardian", displayName: "Gold Crush" },
  { id: "lime", kind: "agent" as const, agentId: "rumble-vanguard", displayName: "Lime Byte" }
];

function action(id: string, type: string, argumentsValue: Record<string, unknown>): RumbleAction {
  return { id, type, arguments: argumentsValue } as RumbleAction;
}

describe("Agent Rumble", () => {
  it("buffers every active fighter and resolves a deterministic combat round", async () => {
    const first = await playOpeningRound(404);
    const second = await playOpeningRound(404);

    expect(first.round).toBe(2);
    expect(first.eventHistory.length).toBeGreaterThan(0);
    expect(first.fighters.some((fighter) => fighter.stats.attacksAttempted > 0)).toBe(true);
    expect(snapshot(first)).toEqual(snapshot(second));
  });

  it("rejects friendly fire in team battle before mutating the round", async () => {
    const environment = new RumbleCoreEnvironment();
    await environment.initialize({ episodeId: "team-test" });
    await environment.reset({
      episodeId: "team-test",
      scenario: {
        id: "teams",
        name: "Teams",
        environmentId: "agent-rumble-v1",
        parameters: {
          mode: "team_battle",
          participantIds: ["pink", "cyan", "gold", "lime"]
        }
      }
    });

    await expect(
      environment.step(
        action("friendly-fire", "combat.attack", {
          attack: "jab",
          targetFighterId: "cyan"
        })
      )
    ).rejects.toThrow("Friendly fire");
    expect((await environment.getState()).actedThisRound).toEqual([]);
  });

  it("publishes an LLM-readable action guide and rejects malformed targeted actions", async () => {
    const environment = new RumbleCoreEnvironment();
    await environment.initialize({ episodeId: "contract-test" });
    const reset = await environment.reset({ episodeId: "contract-test" });

    expect(reset.observation.data.actionGuide).toHaveLength(6);
    expect(reset.observation.data.actionGuide.find((entry) => entry.type === "combat.attack")?.arguments).toEqual({
      attack: "jab | heavy | sweep | dash_attack",
      targetFighterId: "fighter-id"
    });
    expect((environment.getActionSchema().oneOf as unknown[])).toHaveLength(6);
    await expect(
      environment.step(action("bad-attack", "combat.attack", { attack: "jab" }))
    ).rejects.toThrow("targetFighterId");
    expect((await environment.getState()).actedThisRound).toEqual([]);
  });

  it("accepts a mocked OpenRouter model decision through the real Rumble action pipeline", async () => {
    const requests: Array<{ messages?: Array<{ content?: string }> }> = [];
    const fetchMock = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        id: "rumble-generation",
        model: "openai/test-rumble-model",
        provider: "Test Provider",
        choices: [{ message: { content: '{"type":"combat.move_to","arguments":{"target":{"type":"opponent","fighterId":"cyan"},"desiredDistance":1.6},"summary":"Close safely"}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 80, completion_tokens: 24, total_tokens: 104, cost: 0.001 }
      });
    }) as unknown as typeof fetch;
    const environment = new RumbleCoreEnvironment();
    await environment.initialize({ episodeId: "llm-rumble" });
    const reset = await environment.reset({
      episodeId: "llm-rumble",
      scenario: { id: "duel", name: "Duel", environmentId: "agent-rumble-v1", parameters: { mode: "duel", participantIds: ["pink", "cyan"] } }
    });
    const agent = new OpenRouterArenaAgent({ model: "openai/test-rumble-model", apiKey: "test-key" }, fetchMock);
    await agent.initialize({ episodeId: "llm-rumble", environment: environment.metadata, actionSchema: environment.getActionSchema(), participant: { id: "pink", kind: "agent", agentId: "openrouter:test" } });
    const result = await agent.act({ observation: reset.observation, actionSchema: environment.getActionSchema(), step: 0 });

    await environment.step(result.action as RumbleAction);
    expect((await environment.getState()).actedThisRound).toEqual(["pink"]);
    expect(requests[0]?.messages?.at(-1)?.content).toContain("targetFighterId");
    expect(result.action.metadata).toMatchObject({ provider: "openrouter", model: "openai/test-rumble-model" });
  });

  it("runs four independently routed participants to a scored, replayable result", async () => {
    const system = createArenaSystem();
    await system.plugins.register(agentRumblePlugin);
    const run = await system.orchestrator.runExperiment({
      name: "Test Royal Rumble",
      environmentId: "agent-rumble-v1",
      agentId: "rumble-tactician",
      participants,
      evaluatorIds: ["rumble-match-score"],
      seed: 404,
      scenario: {
        id: "royal-rumble-test",
        name: "Royal Rumble Test",
        environmentId: "agent-rumble-v1",
        parameters: {
          mode: "royal_rumble",
          participantIds: participants.map((participant) => participant.id),
          maxRounds: 12
        }
      },
      episodeLimits: { maxSteps: 52, maxDurationMs: 30_000 }
    });

    expect(run.status).toBe("completed");
    expect((run.finalState as RumbleState).winner).toBeDefined();
    expect(run.replay).toHaveLength(run.steps);
    expect(run.events.some((event) => event.type === "rumble.round_resolved")).toBe(true);
    expect(run.events.some((event) => event.type === "rumble.match_completed")).toBe(true);
    expect(run.evaluations).toHaveLength(1);
    expect(run.evaluations[0]?.score).toBeGreaterThanOrEqual(0);
    const finalState = run.finalState as RumbleState;
    expect(finalState.fighters.reduce((sum, fighter) => sum + fighter.stats.damageDealt, 0)).toBeGreaterThan(140);
    expect(finalState.fighters.reduce((sum, fighter) => sum + fighter.stats.hitsLanded, 0)).toBeGreaterThan(8);
    const routed = run.events
      .filter((event) => event.type === "agent.action_generated")
      .slice(0, 4)
      .map((event) => (event.payload as { participant: { id: string } }).participant.id);
    expect(routed).toEqual(["pink", "cyan", "gold", "lime"]);
    const policies = run.events
      .filter((event) => event.type === "agent.action_generated")
      .slice(0, 4)
      .map((event) => event.source);
    expect(policies).toEqual([
      "rumble-tactician",
      "rumble-skirmisher",
      "rumble-guardian",
      "rumble-vanguard"
    ]);
  });

  it("completes a two-team match with an authoritative team winner", async () => {
    const system = createArenaSystem();
    await system.plugins.register(agentRumblePlugin);
    const run = await system.orchestrator.runExperiment({
      name: "Team Clash",
      environmentId: "agent-rumble-v1",
      agentId: "rumble-tactician",
      participants,
      evaluatorIds: ["rumble-match-score"],
      seed: 909,
      scenario: {
        id: "team-clash-test",
        name: "Team Clash Test",
        environmentId: "agent-rumble-v1",
        parameters: {
          mode: "team_battle",
          participantIds: participants.map((participant) => participant.id),
          maxRounds: 8
        }
      },
      episodeLimits: { maxSteps: 36, maxDurationMs: 30_000 }
    });

    const state = run.finalState as RumbleState;
    expect(run.status).toBe("completed");
    expect(state.mode).toBe("team_battle");
    expect(["sun", "moon"]).toContain(state.winner?.teamId);
    expect(Object.keys(state.teamScores)).toEqual(["sun", "moon"]);
    expect(run.events.some((event) => event.type === "rumble.match_completed")).toBe(true);
  });
});

async function playOpeningRound(seed: number) {
  const environment = new RumbleCoreEnvironment();
  await environment.initialize({ episodeId: `opening-${seed}` });
  await environment.reset({
    episodeId: `opening-${seed}`,
    seed,
    scenario: {
      id: "opening",
      name: "Opening",
      environmentId: "agent-rumble-v1",
      parameters: {
        mode: "royal_rumble",
        participantIds: ["pink", "cyan", "gold", "lime"],
        maxRounds: 8
      }
    }
  });
  await environment.step(action("p", "combat.move_to", { target: { type: "opponent", fighterId: "cyan" }, desiredDistance: 1.2 }));
  await environment.step(action("c", "combat.attack", { attack: "dash_attack", targetFighterId: "pink" }));
  await environment.step(action("g", "combat.defend", { defense: "guard" }));
  await environment.step(action("l", "combat.move_to", { target: { type: "position", x: 0, z: 0 }, desiredDistance: 0 }));
  return environment.getState();
}

function snapshot(state: RumbleState) {
  return {
    round: state.round,
    fighters: state.fighters.map((fighter) => ({
      id: fighter.id,
      position: fighter.position,
      health: fighter.health,
      stamina: fighter.stamina,
      knockback: fighter.knockback,
      stats: fighter.stats
    })),
    events: state.eventHistory.map(({ id: _id, ...event }) => event)
  };
}
