import { describe, expect, it } from "vitest";
import { createArenaSystem } from "@arena/core";
import {
  PersonaCraftEnvironment,
  personaCraftPlugin,
  type PersonaCraftAction,
  type PersonaCraftState,
  type PersonaMode
} from "@arena/plugin-personacraft";

const participants = [
  { id: "pink", kind: "agent" as const, agentId: "council-visionary", displayName: "Ada Lovelace" },
  { id: "cyan", kind: "agent" as const, agentId: "council-strategist", displayName: "Sun Tzu" },
  { id: "gold", kind: "agent" as const, agentId: "council-diplomat", displayName: "Cleopatra" },
  { id: "violet", kind: "agent" as const, agentId: "council-skeptic", displayName: "Alan Turing" }
];

describe("PersonaCraft", () => {
  it("keeps private objectives out of public reset state and rejects phase-invalid actions", async () => {
    const environment = new PersonaCraftEnvironment();
    await environment.initialize({ episodeId: "privacy-test" });
    const reset = await environment.reset({
      episodeId: "privacy-test",
      seed: 505,
      scenario: {
        id: "privacy",
        name: "Privacy",
        environmentId: "personacraft-v1",
        parameters: {
          mode: "debate",
          participantIds: ["pink", "cyan", "gold", "violet"],
          maxRounds: 1
        }
      }
    });

    expect(reset.observation.data.privateObjective).toContain("Secure the council choice");
    expect(reset.observation.data.actionGuidance).toMatchObject({
      instruction: expect.stringContaining("exact participant"),
      exactIds: { participantIds: ["cyan", "gold", "violet"] }
    });
    expect(reset.state.revealedObjectives).toEqual({});
    expect(JSON.stringify(reset.state)).not.toContain("Win support without sacrificing");
    await expect(
      environment.step({
        id: "early-vote",
        type: "persona.vote",
        arguments: { choiceId: "adopt_safeguards", rationale: "Too early." }
      } as PersonaCraftAction)
    ).rejects.toThrow("unavailable during speaking");
    expect((await environment.getState()).actedThisPhase).toEqual([]);
  });

  it("routes four personas through every council phase and produces explainable scoring", async () => {
    const run = await runMode("debate", 505);
    const state = run.finalState as PersonaCraftState;

    expect(run.status).toBe("completed");
    expect(run.terminationReason).toBe("council_completed");
    expect(state.phase).toBe("completed");
    expect(state.winner).toBeDefined();
    expect(state.finalRanking).toHaveLength(4);
    expect(Object.keys(state.revealedObjectives)).toHaveLength(4);
    expect(state.transcript.length).toBeGreaterThanOrEqual(8);
    expect(state.eventHistory.some((event) => event.type === "alliance_formed")).toBe(true);
    expect(run.replay).toHaveLength(run.steps);
    expect(run.evaluations[0]?.passed).toBe(true);
    expect(run.evaluations[0]?.score).toBeGreaterThan(0.5);
    const firstSpeakers = run.events
      .filter((event) => event.type === "agent.action_generated")
      .slice(0, 4)
      .map((event) => (event.payload as { participant: { id: string } }).participant.id);
    expect(firstSpeakers).toEqual(["pink", "cyan", "gold", "violet"]);

    const firstAcceptedState = (run.events.find(
      (event) => event.type === "environment.step_completed"
    )?.payload as { state?: PersonaCraftState } | undefined)?.state;
    expect(firstAcceptedState?.activeParticipantId).toBe("cyan");
    expect(firstAcceptedState?.transcript.at(-1)?.speakerId).toBe("pink");
  });

  it("runs debate, negotiation, crisis, trial, and social deduction through one shared engine", async () => {
    const modes: PersonaMode[] = [
      "debate",
      "negotiation",
      "crisis",
      "trial",
      "social_deduction"
    ];
    for (const [index, mode] of modes.entries()) {
      const run = await runMode(mode, 700 + index);
      const state = run.finalState as PersonaCraftState;
      expect(state.mode).toBe(mode);
      expect(state.status).toBe("completed");
      expect(state.world.decision).toBeTruthy();
      expect(state.winner?.participantId).toBeTruthy();
      expect(run.events.some((event) => event.type === "personacraft.match_completed")).toBe(true);
    }
  });

  it("replays deterministically for the same seed and participant configuration", async () => {
    const first = (await runMode("crisis", 909)).finalState as PersonaCraftState;
    const second = (await runMode("crisis", 909)).finalState as PersonaCraftState;
    expect(snapshot(first)).toEqual(snapshot(second));
  });
});

async function runMode(mode: PersonaMode, seed: number) {
  const system = createArenaSystem();
  await system.plugins.register(personaCraftPlugin);
  return system.orchestrator.runExperiment({
    name: `PersonaCraft ${mode}`,
    environmentId: "personacraft-v1",
    agentId: "council-strategist",
    participants,
    evaluatorIds: ["personacraft-council-score"],
    seed,
    scenario: {
      id: `${mode}-test`,
      name: `${mode} test`,
      environmentId: "personacraft-v1",
      parameters: {
        mode,
        participantIds: participants.map((participant) => participant.id),
        maxRounds: 1
      }
    },
    episodeLimits: { maxSteps: 18, maxDurationMs: 30_000 }
  });
}

function snapshot(state: PersonaCraftState) {
  return {
    mode: state.mode,
    decision: state.world.decision,
    winner: state.winner,
    ranking: state.finalRanking,
    personas: state.personas.map((persona) => ({
      id: persona.id,
      metrics: persona.metrics,
      alliances: persona.alliances
    })),
    transcript: state.transcript.map(({ id: _id, ...statement }) => statement),
    events: state.eventHistory.map(({ id: _id, ...event }) => event)
  };
}
