import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { InMemoryRunRepository, createArenaSystem } from "@arena/core";
import { buildArenaApi, type ArenaApi } from "../apps/api/src/server.js";
import type { ArenaEvent, RunRecord } from "@arena/contracts";

describe("ArenaOS control API", () => {
  let api: ArenaApi | undefined;

  afterEach(async () => {
    await api?.app.close();
    api = undefined;
  });

  it("creates a background run, streams its events, and serves replay", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });
    const address = await api.app.listen({ host: "127.0.0.1", port: 0 });

    const environmentResponse = await fetch(`${address}/api/environments`);
    expect(environmentResponse.status).toBe(200);
    expect(await environmentResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "headless-grid" }),
        expect.objectContaining({
          id: "royal-chess-v1",
          capabilities: expect.objectContaining({ multiAgent: true })
        }),
        expect.objectContaining({
          id: "biocraft-v1",
          capabilities: expect.objectContaining({
            deterministic: true,
            renderable: true
          })
        }),
        expect.objectContaining({
          id: "chemcraft-v1",
          capabilities: expect.objectContaining({
            deterministic: true,
            renderable: true
          })
        }),
        expect.objectContaining({
          id: "agent-rumble-v1",
          capabilities: expect.objectContaining({
            deterministic: true,
            multiAgent: true,
            renderable: true
          })
        }),
        expect.objectContaining({
          id: "personacraft-v1",
          capabilities: expect.objectContaining({
            deterministic: true,
            multiAgent: true,
            renderable: true
          })
        }),
        expect.objectContaining({
          id: "physical-ai-mission-lab-v1",
          capabilities: expect.objectContaining({
            deterministic: false,
            multiAgent: true,
            renderable: true,
            supportsSnapshots: true
          })
        })
      ])
    );

    const startResponse = await fetch(`${address}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        environmentId: "headless-grid",
        agentId: "scripted-agent"
      })
    });
    expect(startResponse.status).toBe(202);
    const started = (await startResponse.json()) as { runId: string };

    const streamed = await collectRunEvents(
      address.replace("http", "ws"),
      started.runId
    );
    expect(streamed.some((event) => event.type === "agent.action_generated")).toBe(true);
    expect(streamed.some((event) => event.type === "environment.step_completed")).toBe(true);
    expect(streamed.some((event) => event.type === "experiment.completed")).toBe(true);

    const runResponse = await fetch(`${address}/api/runs/${started.runId}`);
    const run = (await runResponse.json()) as RunRecord;
    expect(run.status).toBe("completed");
    expect(run.terminationReason).toBe("goal_reached");
    expect(run.replay).toHaveLength(12);

    const summariesResponse = await fetch(`${address}/api/run-summaries`);
    expect(summariesResponse.status).toBe(200);
    const summaries = (await summariesResponse.json()) as RunRecord[];
    const summary = summaries.find((candidate) => candidate.id === started.runId);
    expect(summary).toMatchObject({
      id: started.runId,
      status: "completed",
      events: [],
      replay: []
    });
    expect(summary?.finalState).toBeUndefined();

    const replayResponse = await fetch(
      `${address}/api/runs/${started.runId}/replay`
    );
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toHaveLength(12);
  });

  it("launches a two-participant Royal Chess match through the public API", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });

    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        name: "API Royal Match",
        environmentId: "royal-chess-v1",
        agentId: "royal-greedy",
        participants: [
          { id: "white", kind: "agent", agentId: "royal-greedy", role: "white" },
          { id: "black", kind: "agent", agentId: "royal-positional", role: "black" }
        ],
        evaluatorIds: ["chess-result", "chess-legal-actions"],
        scenario: {
          id: "api-test",
          name: "API Test",
          environmentId: "royal-chess-v1",
          parameters: {
            whiteParticipantId: "white",
            blackParticipantId: "black",
            maxPlies: 12
          }
        },
        episodeLimits: { maxSteps: 12, maxDurationMs: 30_000 }
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(run?.status).toBe("completed");
    expect(run?.config.participants).toHaveLength(2);
    expect(run?.events.some((event) => event.type === "chess.move_accepted")).toBe(true);
    expect(run?.replay.length).toBe(run?.steps);
  });

  it("accepts a human chess move through the same recorded action pipeline", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });

    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        name: "Human versus agent",
        environmentId: "royal-chess-v1",
        agentId: "royal-positional",
        participants: [
          { id: "white", kind: "human", displayName: "Human", role: "white" },
          { id: "black", kind: "agent", agentId: "royal-positional", role: "black" }
        ],
        evaluatorIds: ["chess-result", "chess-legal-actions"],
        scenario: {
          id: "human-api-test",
          name: "Human API Test",
          environmentId: "royal-chess-v1",
          parameters: {
            whiteParticipantId: "white",
            blackParticipantId: "black",
            maxPlies: 2
          }
        },
        episodeLimits: { maxSteps: 2, maxDurationMs: 30_000 }
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let actionResponse;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      actionResponse = await api.app.inject({
        method: "POST",
        url: `/api/runs/${runId}/actions`,
        payload: {
          participantId: "white",
          action: {
            id: "human-e2-e4",
            type: "chess.move",
            arguments: { from: "e2", to: "e4" },
            summary: "Human played e4"
          }
        }
      });
      if (actionResponse.statusCode === 202) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(actionResponse?.statusCode).toBe(202);

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(run?.status).toBe("completed");
    expect(run?.replay).toHaveLength(2);
    expect(
      run?.events.some(
        (event) =>
          event.type === "agent.action_generated" &&
          event.source === "human:white" &&
          (event.payload as { action?: { id?: string } }).action?.id === "human-e2-e4"
      )
    ).toBe(true);
  });

  it("accepts human Agent Rumble combat through the shared action and replay pipeline", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });

    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        name: "Human Rumble API Test",
        environmentId: "agent-rumble-v1",
        agentId: "rumble-tactician",
        participants: [
          { id: "pink", kind: "human", displayName: "Human Challenger", role: "balanced" },
          { id: "cyan", kind: "agent", agentId: "rumble-tactician", displayName: "Cyan Shift", role: "agile" }
        ],
        evaluatorIds: ["rumble-match-score"],
        seed: 404,
        scenario: {
          id: "human-duel-api-test",
          name: "Human Duel API Test",
          environmentId: "agent-rumble-v1",
          parameters: {
            mode: "duel",
            participantIds: ["pink", "cyan"],
            maxRounds: 8
          }
        },
        episodeLimits: { maxSteps: 2, maxDurationMs: 30_000 }
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let actionResponse;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      actionResponse = await api.app.inject({
        method: "POST",
        url: `/api/runs/${runId}/actions`,
        payload: {
          participantId: "pink",
          action: {
            id: "human-rumble-jab",
            type: "combat.attack",
            arguments: { attack: "jab", targetFighterId: "cyan" },
            summary: "Human throws a jab"
          }
        }
      });
      if (actionResponse.statusCode === 202) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(actionResponse?.statusCode).toBe(202);

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(run?.status).toBe("completed");
    expect(run?.replay).toHaveLength(2);
    expect(
      run?.events.some(
        (event) =>
          event.type === "agent.action_generated" &&
          event.source === "human:pink" &&
          (event.payload as { action?: { id?: string } }).action?.id === "human-rumble-jab"
      )
    ).toBe(true);
    expect(run?.events.some((event) => event.type === "rumble.round_resolved")).toBe(true);
  });

  it("accepts human PersonaCraft language through the same recorded council pipeline", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });
    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        name: "Human PersonaCraft API Test",
        environmentId: "personacraft-v1",
        agentId: "council-strategist",
        participants: [
          { id: "pink", kind: "human", displayName: "Human Delegate", role: "architect" },
          { id: "cyan", kind: "agent", agentId: "council-strategist", displayName: "Sun Tzu", role: "strategist" }
        ],
        evaluatorIds: ["personacraft-council-score"],
        seed: 505,
        scenario: {
          id: "human-council-api-test",
          name: "Human Council API Test",
          environmentId: "personacraft-v1",
          parameters: {
            mode: "debate",
            participantIds: ["pink", "cyan"],
            maxRounds: 1,
            displayNames: { pink: "Human Delegate", cyan: "Sun Tzu" }
          }
        },
        episodeLimits: { maxSteps: 2, maxDurationMs: 30_000 }
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let actionResponse;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      actionResponse = await api.app.inject({
        method: "POST",
        url: `/api/runs/${runId}/actions`,
        payload: {
          participantId: "pink",
          action: {
            id: "human-council-speech",
            type: "persona.speak",
            arguments: {
              message:
                "Because the audit identifies measurable risk, I support safeguards with a reversible review clause.",
              stance: "support",
              rhetoricalMode: "logical",
              targetParticipantId: "cyan",
              evidenceIds: ["audit-forecast"]
            },
            summary: "Human delegate presents an evidence-linked argument."
          }
        }
      });
      if (actionResponse.statusCode === 202) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(actionResponse?.statusCode).toBe(202);

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(run?.status).toBe("completed");
    expect(run?.replay).toHaveLength(2);
    expect(
      run?.events.some(
        (event) =>
          event.type === "agent.action_generated" &&
          event.source === "human:pink" &&
          (event.payload as { action?: { id?: string } }).action?.id ===
            "human-council-speech"
      )
    ).toBe(true);
    expect(
      run?.events.some((event) => event.type === "personacraft.speech")
    ).toBe(true);
  });

  it("accepts a live Human + Agent Physical AI plan and routes the next turn to the teammate", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });
    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        name: "Human Physical AI API Test",
        environmentId: "physical-ai-mission-lab-v1",
        agentId: "mission-coordinator",
        participants: [
          { id: "alpha", kind: "human", displayName: "Human Operator", role: "mobile-01" },
          { id: "beta", kind: "agent", agentId: "mission-coordinator", displayName: "Beta Coordinator", role: "mobile-02" }
        ],
        evaluatorIds: ["physical-ai-mission-score"],
        seed: 606,
        scenario: {
          id: "human-warehouse-api-test",
          name: "Human Warehouse API Test",
          environmentId: "physical-ai-mission-lab-v1",
          parameters: {
            mode: "human_agent_team",
            participantIds: ["alpha", "beta"],
            timeLimitSeconds: 360
          }
        },
        episodeLimits: { maxSteps: 2, maxDurationMs: 30_000 }
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let actionResponse;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      actionResponse = await api.app.inject({
        method: "POST",
        url: `/api/runs/${runId}/actions`,
        payload: {
          participantId: "alpha",
          action: {
            id: "human-warehouse-plan",
            type: "mission.submit_plan",
            arguments: {
              summary: "Inspect, clear O2, transfer P3, and extract through the safe corridor.",
              assignments: [
                { robotId: "mobile-01", objective: "Clear and extract" },
                { robotId: "mobile-02", objective: "Inspect and support" },
                { robotId: "arm-01", objective: "Transfer P3" }
              ]
            },
            summary: "Human authorizes the warehouse plan."
          }
        }
      });
      if (actionResponse.statusCode === 202) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(actionResponse?.statusCode).toBe(202);

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      run = await system.runRepository.get(runId);
      if ((run?.steps ?? 0) >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(run?.events.some((event) => event.type === "physical_ai.plan_submitted")).toBe(true);
    expect(run?.events.some((event) => event.type === "agent.action_generated" && event.source === "human:alpha")).toBe(true);
    expect(run?.events.some((event) => event.type === "agent.action_requested" && (event.payload as { participant?: { id?: string } }).participant?.id === "beta")).toBe(true);
  });

  it("discovers and completes BioCraft through the public API", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });
    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        environmentId: "biocraft-v1",
        agentId: "biocraft-researcher"
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(run?.status).toBe("completed");
    expect(run?.terminationReason).toBe("submission_evaluated");
    expect(run?.events.some((event) => event.type === "biocraft.tool_completed")).toBe(true);
    expect(run?.events.some((event) => event.type === "biocraft.evaluation_completed")).toBe(true);
    expect(run?.evaluations[0]?.score).toBeGreaterThanOrEqual(0.9);
    expect(run?.replay.length).toBe(run?.steps);
  });

  it("accepts a human BioCraft tool call without an agent participant", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });
    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        name: "Human BioCraft research",
        environmentId: "biocraft-v1",
        participants: [
          { id: "primary", kind: "human", displayName: "Researcher", role: "researcher" }
        ],
        evaluatorIds: ["biocraft-scientific-score"],
        episodeLimits: { maxSteps: 1, maxDurationMs: 30_000 }
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let actionResponse;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      actionResponse = await api.app.inject({
        method: "POST",
        url: `/api/runs/${runId}/actions`,
        payload: {
          participantId: "primary",
          action: {
            id: "human-inspect-reference",
            type: "biology.inspect_sequence",
            arguments: {
              sequenceId: "1UBQ_A",
              analyses: ["composition", "molecular_weight", "charge", "hydropathy"]
            },
            summary: "Inspect the bundled reference sequence."
          }
        }
      });
      if (actionResponse.statusCode === 202) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(actionResponse?.statusCode).toBe(202);

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(run?.status).toBe("completed");
    expect(run?.steps).toBe(1);
    expect(run?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent.action_generated",
          source: "human:primary"
        }),
        expect.objectContaining({ type: "biocraft.tool_completed" })
      ])
    );
  });

  it("completes ChemCraft through the public API with real RDKit artifacts", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });
    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        environmentId: "chemcraft-v1",
        agentId: "chemcraft-researcher"
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed" || run?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(run?.status).toBe("completed");
    expect(run?.terminationReason).toBe("submission_evaluated");
    expect(run?.events.some((event) => event.type === "chemcraft.tool_completed")).toBe(
      true
    );
    expect(
      run?.events.some((event) => event.type === "chemcraft.evaluation_completed")
    ).toBe(true);
    expect(
      (run?.finalState as { artifacts?: unknown[] } | undefined)?.artifacts?.length
    ).toBeGreaterThan(0);
    expect(run?.evaluations[0]?.score).toBeGreaterThanOrEqual(0.9);
    expect(run?.replay.length).toBe(run?.steps);
  }, 120_000);

  it("accepts a human ChemCraft RDKit action through the shared pipeline", async () => {
    const system = createArenaSystem(new InMemoryRunRepository());
    api = await buildArenaApi({ system });
    const response = await api.app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        name: "Human ChemCraft inspection",
        environmentId: "chemcraft-v1",
        participants: [
          { id: "primary", kind: "human", displayName: "Human Chemist", role: "researcher" }
        ],
        evaluatorIds: ["chemcraft-scientific-score"],
        episodeLimits: { maxSteps: 1, maxDurationMs: 60_000 }
      }
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();

    let actionResponse;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      actionResponse = await api.app.inject({
        method: "POST",
        url: `/api/runs/${runId}/actions`,
        payload: {
          participantId: "primary",
          action: {
            id: "human-chem-inspect",
            type: "chemistry.inspect_molecule",
            arguments: { moleculeId: "lead-lidocaine" },
            summary: "Inspect the bundled lead with RDKit."
          }
        }
      });
      if (actionResponse.statusCode === 202) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(actionResponse?.statusCode).toBe(202);

    let run: RunRecord | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      run = await system.runRepository.get(runId);
      if (run?.status === "completed" || run?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(run?.status).toBe("completed");
    expect(run?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent.action_generated",
          source: "human:primary"
        }),
        expect.objectContaining({ type: "chemcraft.tool_completed" })
      ])
    );
    expect(
      (run?.finalState as { artifacts?: unknown[] } | undefined)?.artifacts?.length
    ).toBe(1);
  }, 120_000);
});

function collectRunEvents(baseUrl: string, runId: string): Promise<ArenaEvent[]> {
  return new Promise((resolve, reject) => {
    const events = new Map<string, ArenaEvent>();
    const socket = new WebSocket(`${baseUrl}/ws/runs/${runId}`);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for the ArenaOS run to complete."));
    }, 5_000);

    socket.on("message", (data) => {
      const packet = JSON.parse(String(data)) as
        | { type: "snapshot"; run: RunRecord }
        | { type: "event"; event: ArenaEvent };
      if (packet.type === "snapshot") {
        for (const event of packet.run.events) events.set(event.id, event);
        if (packet.run.status === "completed") finish();
        return;
      }
      events.set(packet.event.id, packet.event);
      if (packet.event.type === "experiment.completed") finish();
    });
    socket.on("error", reject);

    function finish() {
      clearTimeout(timeout);
      socket.close();
      resolve([...events.values()]);
    }
  });
}
