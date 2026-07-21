import { describe, expect, it } from "vitest";
import { InMemoryRunRepository, createArenaSystem } from "@arena/core";
import {
  ChemCraftEnvironment,
  chemCraftPlugin,
  chemCraftScientific,
  type ChemCraftState
} from "@arena/plugin-chemcraft";
import { buildChemCraftTasks } from "../apps/web/features/environments/chemcraft/chemcraft-progress.js";
import {
  buildChemCraftReplayFrames,
  chemCraftProgressIndex
} from "../apps/web/features/environments/chemcraft/chemcraft-replay.js";

describe("ChemCraft scientific environment", () => {
  it("uses the real local RDKit worker for graph chemistry and seeded conformers", () => {
    const capabilities = chemCraftScientific.discoverCapabilities();
    expect(capabilities.rdkit.available).toBe(true);
    expect(capabilities.networkAccess).toBe(false);

    const parsed = chemCraftScientific.callWorker<{
      canonicalSmiles: string;
      atomCount: number;
      formula: string;
      depictionSvg: string;
    }>("inspect", { smiles: "CCO" });
    expect(parsed).toEqual(
      expect.objectContaining({
        canonicalSmiles: "CCO",
        atomCount: 3,
        formula: "C2H6O"
      })
    );
    expect(parsed.depictionSvg).toContain("<svg");
    expect(() =>
      chemCraftScientific.callWorker("inspect", { smiles: "C1=CC" })
    ).toThrow(/could not parse or sanitize/i);

    const descriptors = chemCraftScientific.callWorker<{
      descriptors: { molecularWeight: number; calculatedLogP: number; tpsa: number };
    }>("descriptors", { smiles: "CCO" });
    expect(descriptors.descriptors.molecularWeight).toBeCloseTo(46.069, 2);
    expect(descriptors.descriptors.tpsa).toBeCloseTo(20.23, 2);
    expect(
      chemCraftScientific.callWorker<{ similarity: number }>("similarity", {
        smiles: "CCO",
        referenceSmiles: "CCO"
      }).similarity
    ).toBe(1);

    const first = chemCraftScientific.callWorker<{
      conformer: { atoms: unknown[]; forceFieldEnergy: number; seed: number };
    }>("conformer", { smiles: "CCO", seed: 1701 });
    const second = chemCraftScientific.callWorker<typeof first>("conformer", {
      smiles: "CCO",
      seed: 1701
    });
    expect(first).toEqual(second);
    expect(first.conformer.atoms.length).toBeGreaterThan(3);
  }, 30_000);

  it("isolates hidden scoring and completes a genuine RDKit investigation with replay", async () => {
    const environment = new ChemCraftEnvironment();
    await environment.initialize({ episodeId: "chem-isolation", seed: 1701 });
    const reset = await environment.reset({
      episodeId: "chem-isolation",
      seed: 1701,
      scenario: {
        id: "balanced-lead-001",
        name: "ChemCraft isolation",
        environmentId: "chemcraft-v1"
      }
    });
    expect(JSON.stringify(reset.state)).not.toContain("recommendedMoleculeId");
    expect(JSON.stringify(reset.state)).not.toContain("candidateUtilities");
    expect(reset.state.reproducibility.networkAccess).toBe(false);
    expect(reset.state.reproducibility.rdkitVersion).toMatch(/^2025/);
    await environment.close();

    const repository = new InMemoryRunRepository();
    const system = createArenaSystem(repository);
    await system.plugins.register(chemCraftPlugin);
    const run = await system.orchestrator.runExperiment({
      name: "ChemCraft deterministic molecular optimization",
      environmentId: "chemcraft-v1",
      agentId: "chemcraft-researcher",
      evaluatorIds: ["chemcraft-scientific-score"],
      seed: 1701,
      scenario: {
        id: "balanced-lead-001",
        name: "Balanced Local-Anesthetic Lead Optimization",
        environmentId: "chemcraft-v1",
        parameters: { maxToolCalls: 18 }
      },
      episodeLimits: {
        maxSteps: 12,
        maxDurationMs: 120_000,
        maxToolCalls: 18
      }
    });

    const state = run.finalState as ChemCraftState;
    expect(run.status).toBe("completed");
    expect(run.terminationReason).toBe("submission_evaluated");
    expect(state.evaluation?.overallScore).toBeGreaterThanOrEqual(0.9);
    expect(state.evaluation?.groundTruth.recommendedMoleculeId).toBe(
      "candidate-secondary-amide"
    );
    expect(
      state.toolHistory.some((item) => item.tool === "chemistry.calculate_descriptors")
    ).toBe(true);
    expect(
      state.toolHistory.some((item) => item.tool === "chemistry.calculate_similarity")
    ).toBe(true);
    expect(
      state.toolHistory.some((item) => item.tool === "chemistry.generate_conformers")
    ).toBe(true);
    expect(
      state.artifacts.some(
        (artifact) => artifact.mediaType === "chemical/x-mdl-sdfile"
      )
    ).toBe(true);
    expect(run.events.some((event) => event.type === "chemcraft.tool_completed")).toBe(
      true
    );
    expect(
      run.events.some((event) => event.type === "chemcraft.evaluation_completed")
    ).toBe(true);
    expect(run.replay).toHaveLength(run.steps);
    expect(run.evaluations[0]?.evaluatorId).toBe("chemcraft-scientific-score");

    const replayFrames = buildChemCraftReplayFrames([
      reset.state,
      ...run.replay.map((frame) => frame.state),
      run.finalState
    ]);
    expect(replayFrames[0]).toMatchObject({ status: "ready", toolHistory: [] });
    expect(replayFrames.at(-1)?.evaluation?.overallScore).toBeGreaterThanOrEqual(0.9);
    expect(replayFrames.map(chemCraftProgressIndex)).toEqual(
      [...replayFrames.map(chemCraftProgressIndex)].sort((left, right) => left - right)
    );
    expect(buildChemCraftTasks(state).every((task) => task.status === "completed")).toBe(true);
  }, 120_000);
});
