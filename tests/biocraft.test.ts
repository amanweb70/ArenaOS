import { describe, expect, it } from "vitest";
import { InMemoryRunRepository, createArenaSystem } from "@arena/core";
import {
  BioCraftEnvironment,
  bioCraftPlugin,
  bioCraftScientific,
  type BioCraftState
} from "@arena/plugin-biocraft";
import { buildBioCraftTasks } from "../apps/web/features/environments/biocraft/biocraft-progress.js";
import {
  bioCraftProgressIndex,
  buildBioCraftReplayFrames
} from "../apps/web/features/environments/biocraft/biocraft-replay.js";

describe("BioCraft scientific environment", () => {
  it("runs genuine deterministic sequence, mutation, alignment, and structure calculations", async () => {
    const challenge = await bioCraftScientific.loadChallenge();
    const sequence = challenge.reference.sequence;

    expect(sequence).toHaveLength(76);
    expect(bioCraftScientific.inspectSequence(sequence)).toEqual(
      expect.objectContaining({
        length: 76,
        molecularWeightDa: expect.any(Number),
        meanHydropathy: expect.any(Number),
        estimatedIsoelectricPoint: expect.any(Number)
      })
    );
    expect(
      bioCraftScientific.substitutionEvidence("I", "V")
    ).toEqual(expect.objectContaining({ blosum62: 3, classification: "conservative" }));
    expect(
      bioCraftScientific.applyMutation(sequence, "I13V").sequence[12]
    ).toBe("V");
    expect(() => bioCraftScientific.applyMutation(sequence, "A13V")).toThrow(
      /reference contains I/
    );

    const conservation = bioCraftScientific.conservationProfile(challenge.homologs);
    expect(conservation).toHaveLength(76);
    expect(conservation[12]).toEqual(
      expect.objectContaining({ position: 13, conservation: 1 })
    );
    const structure = bioCraftScientific.inspectStructure(
      challenge.structure,
      13,
      8
    );
    expect(structure.target.position).toBe(13);
    expect(structure.neighbors.length).toBeGreaterThan(0);
    expect(structure.approximationNotice).toContain("not a solvent-accessible");
  });

  it("keeps ground truth hidden until submission and persists a complete research replay", async () => {
    const environment = new BioCraftEnvironment();
    await environment.initialize({ episodeId: "isolation-check", seed: 7 });
    const reset = await environment.reset({
      episodeId: "isolation-check",
      seed: 7,
      scenario: {
        id: "ubiquitin-preservation-001",
        name: "Isolation check",
        environmentId: "biocraft-v1"
      }
    });
    expect(JSON.stringify(reset.state)).not.toContain("rankedCandidates");
    expect(JSON.stringify(reset.observation.data)).not.toContain("recommendedMutation");
    await environment.close();

    const repository = new InMemoryRunRepository();
    const system = createArenaSystem(repository);
    await system.plugins.register(bioCraftPlugin);
    const run = await system.orchestrator.runExperiment({
      name: "BioCraft deterministic research",
      environmentId: "biocraft-v1",
      agentId: "biocraft-researcher",
      evaluatorIds: ["biocraft-scientific-score"],
      seed: 7,
      scenario: {
        id: "ubiquitin-preservation-001",
        name: "Ubiquitin Functional Preservation",
        environmentId: "biocraft-v1",
        parameters: { maxToolCalls: 12 }
      },
      episodeLimits: {
        maxSteps: 16,
        maxDurationMs: 90_000,
        maxToolCalls: 12
      }
    });

    const state = run.finalState as BioCraftState;
    expect(run.status).toBe("completed");
    expect(run.terminationReason).toBe("submission_evaluated");
    expect(state.status).toBe("completed");
    expect(state.evaluation?.overallScore).toBeGreaterThanOrEqual(0.9);
    expect(state.evaluation?.groundTruth.recommendedMutation).toBe("I13V");
    expect(state.toolHistory.some((item) => item.tool === "biology.align_sequences")).toBe(true);
    expect(state.toolHistory.some((item) => item.tool === "biology.inspect_structure")).toBe(true);
    expect(state.artifacts.some((artifact) => artifact.mediaType === "text/x-fasta")).toBe(true);
    expect(run.events.some((event) => event.type === "biocraft.evaluation_completed")).toBe(true);
    expect(run.replay).toHaveLength(run.steps);
    expect(run.evaluations[0]?.evaluatorId).toBe("biocraft-scientific-score");

    const replayFrames = buildBioCraftReplayFrames([
      reset.state,
      ...run.replay.map((frame) => frame.state),
      run.finalState
    ]);
    expect(replayFrames[0]).toMatchObject({ status: "ready", toolHistory: [] });
    expect(replayFrames.at(-1)?.evaluation?.overallScore).toBeGreaterThanOrEqual(0.9);
    expect(replayFrames.map(bioCraftProgressIndex)).toEqual(
      [...replayFrames.map(bioCraftProgressIndex)].sort((left, right) => left - right)
    );
    expect(buildBioCraftTasks(state).every((task) => task.status === "completed")).toBe(true);
  });
});
