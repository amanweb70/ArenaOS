import {
  type Agent,
  type AgentActInput,
  type AgentActResult,
  type AgentAction,
  type AgentFactory,
  type AgentInitializeContext,
  type AgentMetadata,
  type ArenaEvent,
  type ArenaPlugin,
  type ArtifactReference,
  type ComponentMetadata,
  type Environment,
  type EnvironmentCapabilities,
  type EnvironmentFactory,
  type EnvironmentInitializeContext,
  type EnvironmentMetadata,
  type EnvironmentResetInput,
  type EnvironmentResetResult,
  type EnvironmentStepResult,
  type EpisodeEvaluationInput,
  type EpisodeEvaluationResult,
  type Evaluator,
  type EvaluatorFactory,
  type JsonSchema,
  type Observation
} from "@arena/contracts";
import { randomUUID } from "node:crypto";
import {
  type ChemConstraints,
  type ChemCraftChallenge,
  type ScoringProfile,
  loadChemCraftChallenge,
  loadChemGroundTruth,
  loadChemScoringProfile
} from "./challenge.js";
import {
  callChemWorker,
  discoverChemCapabilities,
  type ChemWorkerCapabilities
} from "./worker.js";

export type ChemDescriptors = {
  formula: string;
  molecularWeight: number;
  exactMolecularWeight: number;
  heavyAtomCount: number;
  heteroatomCount: number;
  ringCount: number;
  aromaticRingCount: number;
  rotatableBondCount: number;
  hydrogenBondDonors: number;
  hydrogenBondAcceptors: number;
  tpsa: number;
  fractionSp3: number;
  formalCharge: number;
  molarRefractivity: number;
  calculatedLogP: number;
  stereocenterCount: number;
  unspecifiedStereocenterCount: number;
};

export type ChemConformer = {
  method: string;
  optimization: string;
  converged: boolean;
  forceFieldEnergy: number;
  energyUnits: string;
  seed: number;
  atoms: Array<{ index: number; element: string; x: number; y: number; z: number }>;
  bonds: Array<{ begin: number; end: number; order: number }>;
  molBlock: string;
  limitation: string;
};

export type ChemMoleculeRecord = {
  id: string;
  name: string;
  smiles: string;
  canonicalSmiles: string;
  kind: "lead" | "candidate" | "generated";
  atomCount: number;
  bondCount: number;
  depictionSvg?: string;
  descriptors?: ChemDescriptors;
  functionalGroups?: Array<{
    group: string;
    smarts: string;
    matchCount: number;
    atomIndices: number[][];
    patternLibrary: string;
  }>;
  similarityToLead?: number;
  validation?: {
    passed: boolean;
    checks: Array<{ id: string; passed: boolean; observed: unknown; kind?: string }>;
  };
  conformer?: ChemConformer;
  backend: string;
  backendVersion: string;
};

export type ChemistryToolInvocation = {
  id: string;
  tool: string;
  status: "completed" | "failed";
  inputs: Record<string, unknown>;
  output?: Record<string, unknown>;
  outputSummary?: string;
  error?: string;
  durationMs: number;
  computeUnits: number;
  backend: string;
  backendVersion: string;
  deterministic: true;
  artifactIds: string[];
  step: number;
};

export type ChemEvidenceNote = {
  id: string;
  category:
    | "hypothesis"
    | "observation"
    | "comparison"
    | "uncertainty"
    | "rejection"
    | "decision";
  content: string;
  moleculeIds: string[];
  evidenceIds: string[];
  createdAtStep: number;
};

export type ChemCraftSubmission = {
  rankedCandidates: Array<{
    moleculeId: string;
    rank: number;
    confidence: number;
    evidenceIds: string[];
    justification: string;
  }>;
  recommendedMoleculeId: string;
  overallConfidence: number;
  constraintAssessment: Array<{
    constraintId: string;
    satisfied: boolean;
    evidenceIds: string[];
  }>;
  limitations: string[];
  summary: string;
};

export type ChemCraftEvaluation = {
  overallScore: number;
  candidateQualityScore: number;
  rankingScore: number;
  constraintSatisfactionScore: number;
  evidenceGroundingScore: number;
  toolEfficiencyScore: number;
  confidenceScore: number;
  completenessScore: number;
  unsupportedEvidenceIds: string[];
  candidateUtilities: Record<string, number>;
  groundTruth: {
    methodology: string;
    ranking: string[];
    recommendedMoleculeId: string;
  };
};

export type ChemCraftState = {
  challengeId: string;
  challengeVersion: string;
  challengeTitle: string;
  objective: string;
  scientificScope: string;
  limitations: string[];
  status: "ready" | "running" | "submitted" | "completed" | "failed";
  molecularAssets: {
    leadMoleculeId: string;
    molecules: ChemMoleculeRecord[];
    candidateSetIds: string[];
    transformationIds: string[];
    reactionTemplateIds: string[];
  };
  constraints: ChemConstraints;
  workspace: {
    selectedMoleculeId?: string;
    selectedConformerId?: string;
    selectedAtomIndices: number[];
    comparisonMoleculeIds: string[];
    generatedMoleculeIds: string[];
    notes: ChemEvidenceNote[];
  };
  toolHistory: ChemistryToolInvocation[];
  artifacts: ArtifactReference[];
  budget: {
    toolCallsUsed: number;
    maxToolCalls: number;
    computeUnitsUsed: number;
    maxComputeUnits: number;
    elapsedMs: number;
    maxRuntimeMs: number;
  };
  availableTools: string[];
  unavailableTools: Array<{ id: string; reason: string }>;
  submission?: ChemCraftSubmission;
  evaluation?: ChemCraftEvaluation;
  reproducibility: {
    arenaVersion: string;
    pluginVersion: string;
    challengeVersion: string;
    assetHashes: Record<string, string>;
    rdkitVersion: string;
    pythonVersion: string;
    seed: number;
    fingerprint: { type: "Morgan"; radius: 2; bits: 2048; metric: "Tanimoto" };
    networkAccess: false;
  };
};

export type ChemCraftObservation = {
  environmentId: "chemcraft-v1";
  challengeId: string;
  objective: string;
  scientificScope: string;
  status: ChemCraftState["status"];
  lead: ChemMoleculeRecord;
  candidates: ChemMoleculeRecord[];
  constraints: ChemConstraints;
  toolHistory: ChemistryToolInvocation[];
  notes: ChemEvidenceNote[];
  artifacts: ArtifactReference[];
  budget: ChemCraftState["budget"];
  availableTools: string[];
  unavailableTools: Array<{ id: string; reason: string }>;
  submission?: ChemCraftSubmission;
  evaluation?: ChemCraftEvaluation;
};

type ChemActionArguments =
  | { moleculeId: string }
  | { moleculeIds: string[]; descriptorNames?: string[] }
  | { moleculeId: string; groupSet?: string }
  | {
      referenceMoleculeId: string;
      candidateMoleculeIds: string[];
      fingerprint: "morgan";
      metric: "tanimoto";
    }
  | { moleculeIds: string[] }
  | {
      moleculeId: string;
      count: number;
      method: "ETKDG";
      optimization: "MMFF" | "UFF" | "none";
      seed?: number;
    }
  | {
      category: ChemEvidenceNote["category"];
      content: string;
      moleculeIds?: string[];
      evidenceIds?: string[];
    }
  | ChemCraftSubmission;

export type ChemCraftAction = AgentAction<ChemActionArguments>;

const metadata: EnvironmentMetadata = {
  id: "chemcraft-v1",
  name: "ChemCraft",
  version: "1.0.0",
  description:
    "An offline RDKit molecular-optimization arena with genuine descriptors, fingerprints, validation, conformers, artifacts, and deterministic evaluation.",
  tags: [
    "chemistry",
    "molecular-optimization",
    "rdkit",
    "3d",
    "scientific",
    "deterministic"
  ],
  runtime: "in-process"
};

const actionTypes = [
  "chemistry.inspect_molecule",
  "chemistry.calculate_descriptors",
  "chemistry.inspect_functional_groups",
  "chemistry.calculate_similarity",
  "chemistry.validate_molecule",
  "chemistry.generate_conformers",
  "chemistry.write_note",
  "chemistry.submit"
] as const;

const actionSchema: JsonSchema = {
  type: "object",
  required: ["id", "type", "arguments"],
  additionalProperties: true,
  properties: {
    id: { type: "string", minLength: 1 },
    type: { enum: actionTypes },
    arguments: { type: "object" },
    summary: { type: "string" }
  }
};

const observationSchema: JsonSchema = {
  type: "object",
  required: [
    "environmentId",
    "challengeId",
    "objective",
    "status",
    "lead",
    "candidates",
    "constraints",
    "toolHistory",
    "budget",
    "availableTools"
  ],
  properties: {
    environmentId: { const: "chemcraft-v1" },
    challengeId: { type: "string" },
    objective: { type: "string" },
    status: { enum: ["ready", "running", "submitted", "completed", "failed"] },
    lead: { type: "object" },
    candidates: { type: "array" },
    constraints: { type: "object" },
    toolHistory: { type: "array" },
    budget: { type: "object" },
    availableTools: { type: "array" }
  }
};

type PreparedWorkerRecord = ChemMoleculeRecord & {
  descriptors: ChemDescriptors;
  functionalGroups: NonNullable<ChemMoleculeRecord["functionalGroups"]>;
  similarityToLead: number;
  depictionSvg: string;
  conformer: ChemConformer;
  validation: NonNullable<ChemMoleculeRecord["validation"]>;
};

export class ChemCraftEnvironment
  implements Environment<ChemCraftObservation, ChemCraftAction, ChemCraftState>
{
  readonly metadata = metadata;
  #episodeId = "";
  #challenge?: ChemCraftChallenge;
  #state?: ChemCraftState;
  #catalog = new Map<string, PreparedWorkerRecord>();
  #capabilities?: ChemWorkerCapabilities;
  #startedAt = 0;
  #presentationDelayMs = 0;

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
  }

  async reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<ChemCraftObservation, ChemCraftState>> {
    this.#episodeId = input.episodeId;
    this.#challenge = await loadChemCraftChallenge();
    this.#capabilities = discoverChemCapabilities();
    if (!this.#capabilities.rdkit.available) {
      throw new Error("ChemCraft requires the local RDKit backend.");
    }
    const seed = input.seed ?? this.#challenge.manifest.seed;
    const prepared = callChemWorker<{ molecules: PreparedWorkerRecord[] }>(
      "prepare",
      {
        lead: this.#challenge.lead,
        candidates: this.#challenge.candidates,
        seed,
        constraints: this.#challenge.constraints
      },
      60_000
    );
    this.#catalog = new Map(prepared.molecules.map((record) => [record.id, record]));
    this.#startedAt = Date.now();
    const maxToolCalls =
      typeof input.scenario?.parameters?.maxToolCalls === "number"
        ? Math.min(
            this.#challenge.manifest.maxToolCalls,
            Math.max(1, Math.floor(input.scenario.parameters.maxToolCalls))
          )
        : this.#challenge.manifest.maxToolCalls;
    this.#presentationDelayMs =
      typeof input.scenario?.parameters?.presentationDelayMs === "number"
        ? Math.min(1_000, Math.max(0, input.scenario.parameters.presentationDelayMs))
        : 0;
    this.#state = createInitialState(
      this.#challenge,
      prepared.molecules,
      this.#capabilities,
      seed,
      maxToolCalls
    );
    return { observation: this.observe(), state: structuredClone(this.#state) };
  }

  async step(
    action: ChemCraftAction
  ): Promise<EnvironmentStepResult<ChemCraftObservation, ChemCraftState>> {
    const state = this.requireState();
    const challenge = this.requireChallenge();
    const step = state.toolHistory.length + state.workspace.notes.length + (state.submission ? 1 : 0) + 1;
    if (state.status === "completed") {
      return this.result([], [], 0, true, "submission_evaluated");
    }
    state.status = "running";
    const events: ArenaEvent[] = [];
    const artifacts: ArtifactReference[] = [];

    if (action.type === "chemistry.write_note") {
      const args = action.arguments as {
        category: ChemEvidenceNote["category"];
        content: string;
        moleculeIds?: string[];
        evidenceIds?: string[];
      };
      const note: ChemEvidenceNote = {
        id: randomUUID(),
        category: args.category,
        content: args.content,
        moleculeIds: args.moleculeIds ?? [],
        evidenceIds: args.evidenceIds ?? [],
        createdAtStep: step
      };
      state.workspace.notes.push(note);
      events.push(chemEvent("chemcraft.note_created", this.#episodeId, step, { note }));
      this.updateElapsed();
      await this.presentationPause();
      return this.result(events, artifacts, 0.01, false);
    }

    if (action.type === "chemistry.submit") {
      const submission = action.arguments as ChemCraftSubmission;
      validateSubmission(submission, challenge);
      state.status = "submitted";
      state.submission = structuredClone(submission);
      events.push(
        chemEvent("chemcraft.submission_received", this.#episodeId, step, {
          recommendedMoleculeId: submission.recommendedMoleculeId,
          rankedCandidateCount: submission.rankedCandidates.length
        })
      );
      state.evaluation = await evaluateSubmission(state, submission, challenge);
      state.status = "completed";
      events.push(
        chemEvent("chemcraft.evaluation_completed", this.#episodeId, step, {
          evaluation: state.evaluation
        })
      );
      this.updateElapsed();
      await this.presentationPause();
      return this.result(
        events,
        artifacts,
        state.evaluation.overallScore,
        true,
        "submission_evaluated"
      );
    }

    if (!challenge.manifest.allowedTools.includes(action.type)) {
      throw new Error(`ChemCraft tool "${action.type}" is not allowed.`);
    }
    const cost = toolCost(action);
    if (
      state.budget.toolCallsUsed >= state.budget.maxToolCalls ||
      state.budget.computeUnitsUsed + cost > state.budget.maxComputeUnits
    ) {
      return this.failedTool(action, step, "ChemCraft tool or compute budget exhausted.");
    }

    const invocationId = randomUUID();
    const startedAt = performance.now();
    state.budget.toolCallsUsed += 1;
    state.budget.computeUnitsUsed += cost;
    events.push(
      chemEvent("chemcraft.tool_started", this.#episodeId, step, {
        invocationId,
        tool: action.type,
        inputs: action.arguments,
        computeUnits: cost
      })
    );
    try {
      const executed = this.executeTool(action, invocationId);
      artifacts.push(...executed.artifacts);
      state.artifacts.push(...executed.artifacts);
      const invocation: ChemistryToolInvocation = {
        id: invocationId,
        tool: action.type,
        status: "completed",
        inputs: structuredClone(action.arguments as Record<string, unknown>),
        output: executed.output,
        outputSummary: executed.summary,
        durationMs: roundDuration(performance.now() - startedAt),
        computeUnits: cost,
        backend: "RDKit",
        backendVersion: this.requireCapabilities().rdkit.version ?? "unknown",
        deterministic: true,
        artifactIds: executed.artifacts.map((artifact) => artifact.id),
        step
      };
      state.toolHistory.push(invocation);
      events.push(
        chemEvent("chemcraft.tool_completed", this.#episodeId, step, { invocation })
      );
      for (const eventType of executed.events) {
        events.push(
          chemEvent(eventType, this.#episodeId, step, {
            invocationId,
            moleculeIds: extractMoleculeIds(action.arguments)
          })
        );
      }
      this.updateElapsed();
      await this.presentationPause();
      return this.result(events, artifacts, 0.02, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const invocation: ChemistryToolInvocation = {
        id: invocationId,
        tool: action.type,
        status: "failed",
        inputs: structuredClone(action.arguments as Record<string, unknown>),
        error: message,
        durationMs: roundDuration(performance.now() - startedAt),
        computeUnits: cost,
        backend: "RDKit",
        backendVersion: this.requireCapabilities().rdkit.version ?? "unknown",
        deterministic: true,
        artifactIds: [],
        step
      };
      state.toolHistory.push(invocation);
      events.push(
        chemEvent("chemcraft.tool_failed", this.#episodeId, step, { invocation })
      );
      this.updateElapsed();
      await this.presentationPause();
      return this.result(events, [], -0.08, false);
    }
  }

  async getState(): Promise<ChemCraftState> {
    return structuredClone(this.requireState());
  }

  getActionSchema(): JsonSchema {
    return actionSchema;
  }

  getObservationSchema(): JsonSchema {
    return observationSchema;
  }

  getCapabilities(): EnvironmentCapabilities {
    return {
      deterministic: true,
      realtime: false,
      multiAgent: false,
      renderable: true,
      supportsSnapshots: true,
      supportsPause: true,
      supportsResume: true,
      supportsSeeding: true
    };
  }

  async close(): Promise<void> {}

  private executeTool(
    action: ChemCraftAction,
    invocationId: string
  ): {
    output: Record<string, unknown>;
    summary: string;
    artifacts: ArtifactReference[];
    events: string[];
  } {
    const state = this.requireState();
    if (action.type === "chemistry.inspect_molecule") {
      const args = action.arguments as { moleculeId: string };
      const source = this.requireCatalogMolecule(args.moleculeId);
      const output = {
        canonicalSmiles: source.canonicalSmiles,
        atomCount: source.atomCount,
        bondCount: source.bondCount,
        formula: source.descriptors.formula,
        depictionSvg: source.depictionSvg
      };
      const record = requireStateMolecule(args.moleculeId, state);
      record.depictionSvg = output.depictionSvg;
      state.workspace.selectedMoleculeId = args.moleculeId;
      const artifact = svgArtifact(invocationId, args.moleculeId, record.depictionSvg);
      return {
        output: { ...output, moleculeId: args.moleculeId, artifactId: artifact.id },
        summary: `RDKit parsed and sanitized ${source.name}.`,
        artifacts: [artifact],
        events: ["chemcraft.molecule_opened"]
      };
    }
    if (action.type === "chemistry.calculate_descriptors") {
      const args = action.arguments as { moleculeIds: string[] };
      const results = args.moleculeIds.map((moleculeId) => {
        const source = this.requireCatalogMolecule(moleculeId);
        const descriptors = structuredClone(source.descriptors);
        requireStateMolecule(moleculeId, state).descriptors = descriptors;
        return { moleculeId, descriptors };
      });
      return {
        output: {
          results,
          classification: {
            formula: "exact graph-derived",
            molecularWeight: "calculated from atomic composition",
            calculatedLogP: "RDKit Crippen heuristic",
            tpsa: "RDKit topological descriptor"
          }
        },
        summary: `Calculated genuine RDKit descriptors for ${results.length} molecules.`,
        artifacts: [],
        events: ["chemcraft.descriptors_calculated"]
      };
    }
    if (action.type === "chemistry.inspect_functional_groups") {
      const args = action.arguments as { moleculeId: string };
      const source = this.requireCatalogMolecule(args.moleculeId);
      const groups = structuredClone(source.functionalGroups);
      requireStateMolecule(args.moleculeId, state).functionalGroups = groups;
      return {
        output: { moleculeId: args.moleculeId, groups },
        summary: `Matched ${groups.length} functional-group categories from the versioned SMARTS library.`,
        artifacts: [],
        events: ["chemcraft.substructure_matched"]
      };
    }
    if (action.type === "chemistry.calculate_similarity") {
      const args = action.arguments as {
        referenceMoleculeId: string;
        candidateMoleculeIds: string[];
      };
      const results = args.candidateMoleculeIds.map((moleculeId) => {
        const source = this.requireCatalogMolecule(moleculeId);
        const similarity = source.similarityToLead;
        requireStateMolecule(moleculeId, state).similarityToLead = similarity;
        return {
          moleculeId,
          fingerprint: { type: "Morgan", radius: 2, bits: 2048 },
          metric: "Tanimoto",
          similarity
        };
      });
      return {
        output: {
          referenceMoleculeId: args.referenceMoleculeId,
          results,
          limitation:
            "Fingerprint similarity is a structural comparison and does not imply chemical or biological equivalence."
        },
        summary: `Calculated Morgan/Tanimoto similarity for ${results.length} candidates.`,
        artifacts: [],
        events: ["chemcraft.similarity_calculated"]
      };
    }
    if (action.type === "chemistry.validate_molecule") {
      const args = action.arguments as { moleculeIds: string[] };
      const results = args.moleculeIds.map((moleculeId) => {
        const source = this.requireCatalogMolecule(moleculeId);
        const validation = structuredClone(source.validation);
        requireStateMolecule(moleculeId, state).validation = validation;
        return { moleculeId, ...validation };
      });
      return {
        output: { results },
        summary: `Independently checked every hard constraint for ${results.length} molecules.`,
        artifacts: [],
        events: ["chemcraft.molecule_rejected"]
      };
    }
    if (action.type === "chemistry.generate_conformers") {
      const args = action.arguments as {
        moleculeId: string;
        count: number;
        seed?: number;
      };
      if (args.count < 1 || args.count > 5) {
        throw new Error("ChemCraft permits 1-5 conformers per invocation.");
      }
      const source = this.requireCatalogMolecule(args.moleculeId);
      const requestedSeed = args.seed ?? state.reproducibility.seed;
      const conformer = requestedSeed === source.conformer.seed
        ? structuredClone(source.conformer)
        : callChemWorker<{ conformer: ChemConformer }>(
            "conformer",
            { smiles: source.smiles, seed: requestedSeed },
            45_000
          ).conformer;
      requireStateMolecule(args.moleculeId, state).conformer = conformer;
      state.workspace.selectedMoleculeId = args.moleculeId;
      state.workspace.selectedConformerId = `${args.moleculeId}-conf-0`;
      const artifact = sdfArtifact(invocationId, args.moleculeId, conformer.molBlock);
      return {
        output: {
          moleculeId: args.moleculeId,
          conformerId: state.workspace.selectedConformerId,
          ...conformer,
          molBlock: undefined,
          artifactId: artifact.id
        },
        summary: `Generated a seeded ${conformer.method}/${conformer.optimization} conformer.`,
        artifacts: [artifact],
        events: ["chemcraft.conformers_generated", "chemcraft.conformer_selected"]
      };
    }
    throw new Error(`Unsupported ChemCraft action "${action.type}".`);
  }

  private failedTool(
    action: ChemCraftAction,
    step: number,
    message: string
  ): EnvironmentStepResult<ChemCraftObservation, ChemCraftState> {
    const invocation: ChemistryToolInvocation = {
      id: randomUUID(),
      tool: action.type,
      status: "failed",
      inputs: structuredClone(action.arguments as Record<string, unknown>),
      error: message,
      durationMs: 0,
      computeUnits: 0,
      backend: "arena-budget-guard",
      backendVersion: "1.0.0",
      deterministic: true,
      artifactIds: [],
      step
    };
    this.requireState().toolHistory.push(invocation);
    return this.result(
      [chemEvent("chemcraft.tool_failed", this.#episodeId, step, { invocation })],
      [],
      -0.1,
      false
    );
  }

  private result(
    events: ArenaEvent[],
    artifacts: ArtifactReference[],
    reward: number,
    terminated: boolean,
    terminationReason?: string
  ): EnvironmentStepResult<ChemCraftObservation, ChemCraftState> {
    const state = this.requireState();
    return {
      observation: this.observe(),
      state: structuredClone(state),
      reward,
      terminated,
      truncated: false,
      terminationReason,
      events,
      artifacts,
      info: {
        challengeId: state.challengeId,
        toolCallsUsed: state.budget.toolCallsUsed,
        computeUnitsUsed: state.budget.computeUnitsUsed,
        score: state.evaluation?.overallScore
      }
    };
  }

  private observe(): Observation<ChemCraftObservation> {
    const state = this.requireState();
    const lead = requireStateMolecule(state.molecularAssets.leadMoleculeId, state);
    return {
      id: randomUUID(),
      episodeId: this.#episodeId,
      step: state.toolHistory.length + state.workspace.notes.length,
      timestamp: new Date().toISOString(),
      activeParticipantId: "primary",
      availableActions: state.status === "completed" ? [] : state.availableTools,
      attachments: state.artifacts,
      data: {
        environmentId: "chemcraft-v1",
        challengeId: state.challengeId,
        objective: state.objective,
        scientificScope: state.scientificScope,
        status: state.status,
        lead,
        candidates: state.molecularAssets.molecules.filter(
          (record) => record.kind === "candidate"
        ),
        constraints: state.constraints,
        toolHistory: state.toolHistory,
        notes: state.workspace.notes,
        artifacts: state.artifacts,
        budget: state.budget,
        availableTools: state.availableTools,
        unavailableTools: state.unavailableTools,
        submission: state.submission,
        evaluation: state.evaluation
      }
    };
  }

  private requireCatalogMolecule(id: string): PreparedWorkerRecord {
    const record = this.#catalog.get(id);
    if (!record) throw new Error(`Unknown ChemCraft molecule "${id}".`);
    return record;
  }

  private updateElapsed(): void {
    this.requireState().budget.elapsedMs = Date.now() - this.#startedAt;
  }

  private async presentationPause(): Promise<void> {
    if (this.#presentationDelayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.#presentationDelayMs));
  }

  private requireState(): ChemCraftState {
    if (!this.#state) throw new Error("ChemCraft has not been reset.");
    return this.#state;
  }

  private requireChallenge(): ChemCraftChallenge {
    if (!this.#challenge) throw new Error("ChemCraft challenge is not loaded.");
    return this.#challenge;
  }

  private requireCapabilities(): ChemWorkerCapabilities {
    if (!this.#capabilities) throw new Error("ChemCraft capabilities are unavailable.");
    return this.#capabilities;
  }
}

class ChemCraftResearchAgent implements Agent<ChemCraftObservation, ChemCraftAction> {
  readonly metadata: AgentMetadata = {
    id: "chemcraft-researcher",
    name: "ChemCraft RDKit Research Baseline",
    version: "1.0.0",
    description:
      "A deterministic integration-test researcher that invokes the same local RDKit contracts as future model and human agents.",
    provider: "ArenaOS",
    model: "deterministic-chemistry-baseline",
    tags: ["chemistry", "rdkit", "deterministic", "offline"]
  };

  async initialize(_context: AgentInitializeContext): Promise<void> {}

  async act(
    input: AgentActInput<ChemCraftObservation>
  ): Promise<AgentActResult<ChemCraftAction>> {
    const observation = input.observation.data;
    const completed = (type: string) =>
      observation.toolHistory.filter(
        (invocation) => invocation.tool === type && invocation.status === "completed"
      );
    const candidateIds = observation.candidates.map((candidate) => candidate.id);
    if (!completed("chemistry.inspect_molecule").length) {
      return agentAction(
        "chemistry.inspect_molecule",
        { moleculeId: observation.lead.id },
        "Parse and inspect the lead graph with RDKit."
      );
    }
    if (!completed("chemistry.calculate_descriptors").length) {
      return agentAction(
        "chemistry.calculate_descriptors",
        { moleculeIds: [observation.lead.id, ...candidateIds] },
        "Calculate comparable RDKit descriptors for the complete local library."
      );
    }
    if (!completed("chemistry.inspect_functional_groups").length) {
      return agentAction(
        "chemistry.inspect_functional_groups",
        { moleculeId: observation.lead.id, groupSet: "chemcraft-functional-groups-v1" },
        "Identify the lead functional groups with the bundled SMARTS library."
      );
    }
    if (!completed("chemistry.calculate_similarity").length) {
      return agentAction(
        "chemistry.calculate_similarity",
        {
          referenceMoleculeId: observation.lead.id,
          candidateMoleculeIds: candidateIds,
          fingerprint: "morgan",
          metric: "tanimoto"
        },
        "Calculate Morgan/Tanimoto structural similarity to the lead."
      );
    }
    if (!completed("chemistry.validate_molecule").length) {
      return agentAction(
        "chemistry.validate_molecule",
        { moleculeIds: candidateIds },
        "Apply every hard graph, similarity, and descriptor constraint."
      );
    }
    if (!completed("chemistry.generate_conformers").length) {
      return agentAction(
        "chemistry.generate_conformers",
        {
          moleculeId: "candidate-secondary-amide",
          count: 1,
          method: "ETKDG",
          optimization: "MMFF",
          seed: 1701
        },
        "Generate a reproducible local force-field conformer for the leading candidate."
      );
    }
    if (observation.notes.length === 0) {
      const evidenceIds = observation.toolHistory
        .filter((item) => item.status === "completed")
        .map((item) => item.id);
      return agentAction(
        "chemistry.write_note",
        {
          category: "decision",
          content:
            "The secondary-amide candidate satisfies the hard constraints and gives the strongest declared balance of lower mass, lower calculated LogP, polar surface area, and sufficient structural similarity. This is a benchmark graph-descriptor result, not a claim of efficacy or safety.",
          moleculeIds: ["candidate-secondary-amide"],
          evidenceIds
        },
        "Record a public evidence-linked decision and scientific limitations."
      );
    }
    const evidenceIds = observation.toolHistory
      .filter((item) => item.status === "completed")
      .map((item) => item.id);
    const ranked = [...observation.candidates].sort((left, right) => {
      const leftUtility = publicHeuristic(left);
      const rightUtility = publicHeuristic(right);
      return rightUtility - leftUtility || left.id.localeCompare(right.id);
    });
    return agentAction(
      "chemistry.submit",
      {
        rankedCandidates: ranked.map((candidate, index) => ({
          moleculeId: candidate.id,
          rank: index + 1,
          confidence: candidate.validation?.passed ? 0.84 : 0.98,
          evidenceIds,
          justification: candidate.validation?.passed
            ? `RDKit validation passed; descriptor and Morgan/Tanimoto evidence supports utility ${publicHeuristic(candidate).toFixed(3)}.`
            : "Rejected because one or more independently calculated hard constraints failed."
        })),
        recommendedMoleculeId: ranked[0]!.id,
        overallConfidence: 0.84,
        constraintAssessment: flattenConstraintAssessment(observation.candidates, evidenceIds),
        limitations: [
          "Calculated descriptors are not experimental measurements.",
          "Fingerprint similarity does not imply equivalent biological activity.",
          "The generated conformer is a force-field estimate, not a global minimum."
        ],
        summary:
          "Recommend the highest-ranked constraint-satisfying analogue under the declared offline RDKit graph-descriptor benchmark."
      } satisfies ChemCraftSubmission,
      "Submit the evidence-linked deterministic candidate ranking."
    );
  }

  async reset(): Promise<void> {}
  async close(): Promise<void> {}
}

class ChemCraftScientificEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "chemcraft-scientific-score",
    name: "ChemCraft Deterministic Scientific Score",
    version: "1.0.0",
    description:
      "Independent RDKit candidate utility, ranking, constraints, evidence, efficiency, confidence, and report scoring.",
    tags: ["chemistry", "rdkit", "deterministic", "ground-truth"]
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as ChemCraftState;
    const evaluation = state.evaluation;
    if (!evaluation) {
      return {
        evaluatorId: this.metadata.id,
        score: 0,
        passed: false,
        metrics: [{ name: "submission_received", value: false }],
        summary: "No ChemCraft submission was evaluated."
      };
    }
    return {
      evaluatorId: this.metadata.id,
      score: evaluation.overallScore,
      passed: evaluation.overallScore >= 0.7,
      metrics: [
        { name: "candidate_quality", value: evaluation.candidateQualityScore },
        { name: "ranking_accuracy", value: evaluation.rankingScore },
        {
          name: "constraint_satisfaction",
          value: evaluation.constraintSatisfactionScore
        },
        { name: "evidence_grounding", value: evaluation.evidenceGroundingScore },
        { name: "tool_efficiency", value: evaluation.toolEfficiencyScore },
        { name: "confidence", value: evaluation.confidenceScore },
        { name: "report_completeness", value: evaluation.completenessScore }
      ],
      summary: `ChemCraft scientific score ${(evaluation.overallScore * 100).toFixed(1)}%.`
    };
  }
}

function createInitialState(
  challenge: ChemCraftChallenge,
  prepared: PreparedWorkerRecord[],
  capabilities: ChemWorkerCapabilities,
  seed: number,
  maxToolCalls: number
): ChemCraftState {
  const records = prepared.map((record) => ({
    id: record.id,
    name: record.name,
    smiles: record.smiles,
    canonicalSmiles: record.canonicalSmiles,
    kind: record.kind,
    atomCount: record.atomCount,
    bondCount: record.bondCount,
    depictionSvg: record.kind === "lead" ? record.depictionSvg : undefined,
    conformer: record.kind === "lead" ? record.conformer : undefined,
    backend: record.backend,
    backendVersion: record.backendVersion
  })) satisfies ChemMoleculeRecord[];
  return {
    challengeId: challenge.manifest.id,
    challengeVersion: challenge.manifest.version,
    challengeTitle: challenge.manifest.title,
    objective: challenge.manifest.objective,
    scientificScope: challenge.manifest.scientificScope,
    limitations: challenge.manifest.limitations,
    status: "ready",
    molecularAssets: {
      leadMoleculeId: challenge.lead.id,
      molecules: records,
      candidateSetIds: ["balanced-analogues-v1"],
      transformationIds: [],
      reactionTemplateIds: []
    },
    constraints: challenge.constraints,
    workspace: {
      selectedMoleculeId: challenge.lead.id,
      selectedConformerId: `${challenge.lead.id}-conf-0`,
      selectedAtomIndices: [],
      comparisonMoleculeIds: [],
      generatedMoleculeIds: [],
      notes: []
    },
    toolHistory: [],
    artifacts: [],
    budget: {
      toolCallsUsed: 0,
      maxToolCalls,
      computeUnitsUsed: 0,
      maxComputeUnits: challenge.manifest.maxComputeUnits,
      elapsedMs: 0,
      maxRuntimeMs: challenge.manifest.maxRuntimeMs
    },
    availableTools: challenge.manifest.allowedTools,
    unavailableTools: [
      ...(!capabilities.openBabel.available
        ? [
            {
              id: "chemistry.convert_format",
              reason: "Unavailable: Open Babel is not installed locally."
            }
          ]
        : []),
      ...(!capabilities.xtb.available
        ? [
            {
              id: "chemistry.run_xtb",
              reason:
                "Unavailable: xTB is not installed. ChemCraft will not simulate quantum values."
            }
          ]
        : []),
      {
        id: "chemistry.run_python",
        reason:
          "Unavailable in v1: arbitrary agent-authored Python remains disabled; only typed RDKit worker operations are allowed."
      }
    ],
    reproducibility: {
      arenaVersion: "0.1.0",
      pluginVersion: metadata.version,
      challengeVersion: challenge.manifest.version,
      assetHashes: challenge.assetHashes,
      rdkitVersion: capabilities.rdkit.version ?? "unknown",
      pythonVersion: capabilities.python.version ?? "unknown",
      seed,
      fingerprint: { type: "Morgan", radius: 2, bits: 2048, metric: "Tanimoto" },
      networkAccess: false
    }
  };
}

async function evaluateSubmission(
  state: ChemCraftState,
  submission: ChemCraftSubmission,
  challenge: ChemCraftChallenge
): Promise<ChemCraftEvaluation> {
  const [truth, profile] = await Promise.all([
    loadChemGroundTruth(),
    loadChemScoringProfile()
  ]);
  const prepared = callChemWorker<{ molecules: PreparedWorkerRecord[] }>(
    "prepare",
    { lead: challenge.lead, candidates: challenge.candidates, seed: challenge.manifest.seed },
    60_000
  ).molecules;
  const lead = prepared.find((record) => record.kind === "lead")!;
  const candidateUtilities: Record<string, number> = {};
  for (const candidate of prepared.filter((record) => record.kind === "candidate")) {
    const validation = callChemWorker<{ passed: boolean; checks: unknown[] }>("validate", {
      smiles: candidate.smiles,
      leadSmiles: lead.smiles,
      constraints: challenge.constraints
    });
    candidateUtilities[candidate.id] = validation.passed
      ? calculateUtility(candidate, profile)
      : 0;
  }
  const computedRanking = Object.entries(candidateUtilities)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id]) => id);
  if (
    truth.ranking.length !== computedRanking.length ||
    truth.ranking.some((id, index) => id !== computedRanking[index])
  ) {
    throw new Error("ChemCraft bundled ground truth does not match independent RDKit evaluation.");
  }
  const submittedRanking = [...submission.rankedCandidates]
    .sort((left, right) => left.rank - right.rank)
    .map((candidate) => candidate.moleculeId);
  let correctPairs = 0;
  let totalPairs = 0;
  for (let left = 0; left < truth.ranking.length; left += 1) {
    for (let right = left + 1; right < truth.ranking.length; right += 1) {
      totalPairs += 1;
      if (
        submittedRanking.indexOf(truth.ranking[left]!) <
        submittedRanking.indexOf(truth.ranking[right]!)
      ) {
        correctPairs += 1;
      }
    }
  }
  const rankingScore = totalPairs ? correctPairs / totalPairs : 0;
  const maxUtility = Math.max(...Object.values(candidateUtilities));
  const selectedUtility = candidateUtilities[submission.recommendedMoleculeId] ?? 0;
  const candidateQualityScore = maxUtility ? selectedUtility / maxUtility : 0;
  const recommendedRecord = prepared.find(
    (record) => record.id === submission.recommendedMoleculeId
  );
  const recommendedValidation = recommendedRecord
    ? callChemWorker<{ passed: boolean }>("validate", {
        smiles: recommendedRecord.smiles,
        leadSmiles: lead.smiles,
        constraints: challenge.constraints
      })
    : { passed: false };
  const constraintSatisfactionScore = recommendedValidation.passed ? 1 : 0;
  const validEvidence = new Set(
    state.toolHistory.filter((item) => item.status === "completed").map((item) => item.id)
  );
  const cited = [
    ...new Set([
      ...submission.rankedCandidates.flatMap((candidate) => candidate.evidenceIds),
      ...submission.constraintAssessment.flatMap((constraint) => constraint.evidenceIds)
    ])
  ];
  const unsupportedEvidenceIds = cited.filter((id) => !validEvidence.has(id));
  const evidenceGroundingScore =
    cited.length > 0 ? (cited.length - unsupportedEvidenceIds.length) / cited.length : 0;
  const failedCalls = state.toolHistory.filter((item) => item.status === "failed").length;
  const toolEfficiencyScore = clamp01(
    1 -
      failedCalls * 0.15 -
      Math.max(0, state.budget.computeUnitsUsed - 18) / state.budget.maxComputeUnits
  );
  const recommendationCorrect =
    submission.recommendedMoleculeId === truth.recommendedMoleculeId;
  const confidenceScore = recommendationCorrect
    ? 1 - Math.abs(1 - submission.overallConfidence)
    : 1 - submission.overallConfidence;
  const completenessScore =
    (submission.summary.trim().length >= 30 ? 0.25 : 0) +
    (submission.limitations.length >= 2 ? 0.25 : 0) +
    (submission.rankedCandidates.every(
      (candidate) =>
        candidate.justification.trim().length >= 20 &&
        candidate.evidenceIds.length > 0
    )
      ? 0.25
      : 0) +
    (submission.constraintAssessment.length >= 3 ? 0.25 : 0);
  const overallScore =
    0.35 * candidateQualityScore +
    0.2 * rankingScore +
    0.15 * constraintSatisfactionScore +
    0.15 * evidenceGroundingScore +
    0.05 * toolEfficiencyScore +
    0.05 * confidenceScore +
    0.05 * completenessScore;
  return {
    overallScore: round(overallScore),
    candidateQualityScore: round(candidateQualityScore),
    rankingScore: round(rankingScore),
    constraintSatisfactionScore,
    evidenceGroundingScore: round(evidenceGroundingScore),
    toolEfficiencyScore: round(toolEfficiencyScore),
    confidenceScore: round(confidenceScore),
    completenessScore: round(completenessScore),
    unsupportedEvidenceIds,
    candidateUtilities: Object.fromEntries(
      Object.entries(candidateUtilities).map(([id, value]) => [id, round(value)])
    ),
    groundTruth: {
      methodology: truth.methodology,
      ranking: truth.ranking,
      recommendedMoleculeId: truth.recommendedMoleculeId
    }
  };
}

function calculateUtility(candidate: PreparedWorkerRecord, profile: ScoringProfile): number {
  const descriptor = candidate.descriptors;
  const normalize = (name: keyof ChemDescriptors, value: number): number => {
    const config = profile.normalization[String(name)]!;
    if (config.direction === "target") {
      return clamp01(1 - Math.abs(value - config.best) / config.tolerance!);
    }
    if (config.direction === "minimize") {
      return clamp01((config.worst! - value) / (config.worst! - config.best));
    }
    return clamp01((value - config.worst!) / (config.best - config.worst!));
  };
  return (
    profile.weights.similarity! * candidate.similarityToLead +
    profile.weights.molecularWeight! *
      normalize("molecularWeight", descriptor.molecularWeight) +
    profile.weights.calculatedLogP! *
      normalize("calculatedLogP", descriptor.calculatedLogP) +
    profile.weights.tpsa! * normalize("tpsa", descriptor.tpsa) +
    profile.weights.fractionSp3! * normalize("fractionSp3", descriptor.fractionSp3) +
    profile.weights.rotatableBondCount! *
      normalize("rotatableBondCount", descriptor.rotatableBondCount)
  );
}

function publicHeuristic(candidate: ChemMoleculeRecord): number {
  if (!candidate.validation?.passed) return 0;
  const descriptors = candidate.descriptors;
  if (!descriptors || candidate.similarityToLead === undefined) return 0;
  const mass = clamp01((235 - descriptors.molecularWeight) / 60);
  const logP = clamp01((2.5 - descriptors.calculatedLogP) / 2);
  const tpsa = clamp01(1 - Math.abs(descriptors.tpsa - 32) / 17);
  const sp3 = clamp01((descriptors.fractionSp3 - 0.1) / 0.4);
  const rotors = clamp01((6 - descriptors.rotatableBondCount) / 5);
  return (
    0.3 * candidate.similarityToLead +
    0.2 * mass +
    0.2 * logP +
    0.15 * tpsa +
    0.1 * sp3 +
    0.05 * rotors
  );
}

function flattenConstraintAssessment(
  candidates: ChemMoleculeRecord[],
  evidenceIds: string[]
): ChemCraftSubmission["constraintAssessment"] {
  const checks = new Map<string, boolean>();
  for (const candidate of candidates) {
    for (const check of candidate.validation?.checks ?? []) {
      checks.set(check.id, (checks.get(check.id) ?? true) && check.passed);
    }
  }
  return [...checks].map(([constraintId, satisfied]) => ({
    constraintId,
    satisfied,
    evidenceIds
  }));
}

function validateSubmission(
  submission: ChemCraftSubmission,
  challenge: ChemCraftChallenge
): void {
  const expected = new Set(challenge.candidates.map((candidate) => candidate.id));
  const submitted = submission.rankedCandidates.map((candidate) => candidate.moleculeId);
  if (
    submitted.length !== expected.size ||
    new Set(submitted).size !== submitted.length ||
    submitted.some((id) => !expected.has(id))
  ) {
    throw new Error("ChemCraft submission must rank every challenge candidate exactly once.");
  }
  const ranks = submission.rankedCandidates.map((candidate) => candidate.rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    throw new Error("ChemCraft ranks must be contiguous and start at 1.");
  }
  if (!expected.has(submission.recommendedMoleculeId)) {
    throw new Error("Recommended molecule must belong to the challenge candidate set.");
  }
  if (submission.overallConfidence < 0 || submission.overallConfidence > 1) {
    throw new Error("ChemCraft confidence must be between 0 and 1.");
  }
}

function requireStateMolecule(id: string, state: ChemCraftState): ChemMoleculeRecord {
  const record = state.molecularAssets.molecules.find((molecule) => molecule.id === id);
  if (!record) throw new Error(`Unknown ChemCraft molecule "${id}".`);
  return record;
}

function toolCost(action: ChemCraftAction): number {
  switch (action.type) {
    case "chemistry.calculate_descriptors":
      return Math.max(1, (action.arguments as { moleculeIds: string[] }).moleculeIds.length);
    case "chemistry.calculate_similarity":
      return 2;
    case "chemistry.validate_molecule":
      return Math.max(1, (action.arguments as { moleculeIds: string[] }).moleculeIds.length);
    case "chemistry.generate_conformers":
      return 5;
    default:
      return 1;
  }
}

function svgArtifact(
  invocationId: string,
  moleculeId: string,
  svg: string
): ArtifactReference {
  return {
    id: `artifact-${invocationId}`,
    name: `${moleculeId}.svg`,
    mediaType: "image/svg+xml",
    uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    size: Buffer.byteLength(svg)
  };
}

function sdfArtifact(
  invocationId: string,
  moleculeId: string,
  molBlock: string
): ArtifactReference {
  const sdf = `${molBlock}\n$$$$\n`;
  return {
    id: `artifact-${invocationId}`,
    name: `${moleculeId}-conformer.sdf`,
    mediaType: "chemical/x-mdl-sdfile",
    uri: `data:chemical/x-mdl-sdfile;base64,${Buffer.from(sdf).toString("base64")}`,
    size: Buffer.byteLength(sdf)
  };
}

function extractMoleculeIds(argumentsValue: ChemActionArguments): string[] {
  if ("moleculeIds" in argumentsValue && Array.isArray(argumentsValue.moleculeIds)) {
    return argumentsValue.moleculeIds;
  }
  if ("moleculeId" in argumentsValue && typeof argumentsValue.moleculeId === "string") {
    return [argumentsValue.moleculeId];
  }
  if (
    "candidateMoleculeIds" in argumentsValue &&
    Array.isArray(argumentsValue.candidateMoleculeIds)
  ) {
    return argumentsValue.candidateMoleculeIds;
  }
  return [];
}

function agentAction<T extends ChemActionArguments>(
  type: string,
  argumentsValue: T,
  summary: string
): AgentActResult<ChemCraftAction> {
  return {
    action: {
      id: randomUUID(),
      type,
      arguments: argumentsValue,
      summary,
      metadata: { declaredPlan: summary }
    }
  };
}

function chemEvent(
  type: string,
  episodeId: string,
  step: number,
  payload: unknown
): ArenaEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    episodeId,
    step,
    source: metadata.id,
    payload,
    metadata: {
      deterministic: true,
      backend: "RDKit",
      networkAccess: false
    }
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundDuration(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const environmentFactory: EnvironmentFactory = {
  metadata,
  create: () => new ChemCraftEnvironment()
};

const agentFactory: AgentFactory = {
  metadata: new ChemCraftResearchAgent().metadata,
  create: () => new ChemCraftResearchAgent()
};

const evaluatorFactory: EvaluatorFactory = {
  metadata: new ChemCraftScientificEvaluator().metadata,
  create: () => new ChemCraftScientificEvaluator()
};

export const chemCraftPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.chemcraft",
    name: "ChemCraft",
    version: "1.0.0",
    description:
      "Offline RDKit molecular challenge packs, typed scientific tools, artifacts, replay, and deterministic evaluation."
  },
  async register(context) {
    context.environments.register(metadata.id, environmentFactory);
    context.agents.register(agentFactory.metadata.id, agentFactory);
    context.evaluators.register(evaluatorFactory.metadata.id, evaluatorFactory);
  }
};

export const chemCraftScientific = {
  callWorker: callChemWorker,
  discoverCapabilities: discoverChemCapabilities,
  loadChallenge: loadChemCraftChallenge,
  loadGroundTruth: loadChemGroundTruth,
  loadScoringProfile: loadChemScoringProfile
};
