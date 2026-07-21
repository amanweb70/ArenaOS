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
import { createHash, randomUUID } from "node:crypto";
import {
  type BioAnnotation,
  type BioCraftChallenge,
  type MutationCandidate,
  loadBioCraftChallenge,
  loadBioCraftGroundTruth
} from "./challenge.js";
import {
  applyMutation,
  conservationProfile,
  globalAlignment,
  hydropathyProfile,
  inspectSequence,
  inspectStructure,
  substitutionEvidence
} from "./scientific.js";

export type EvidenceNote = {
  id: string;
  category: "hypothesis" | "observation" | "uncertainty" | "decision";
  content: string;
  evidenceIds: string[];
  createdAtStep: number;
};

export type BiologyToolInvocation = {
  id: string;
  tool: string;
  status: "completed" | "failed";
  inputs: Record<string, unknown>;
  output?: Record<string, unknown>;
  outputSummary?: string;
  error?: string;
  durationMs: number;
  backend: string;
  backendVersion: string;
  deterministic: true;
  artifactIds: string[];
  step: number;
};

export type BioCraftRankedCandidate = {
  mutation: string;
  rank: number;
  predictedEffect: string;
  confidence: number;
  evidenceIds: string[];
  justification: string;
};

export type BioCraftSubmission = {
  rankedCandidates: BioCraftRankedCandidate[];
  recommendedMutation: string;
  overallConfidence: number;
  limitations: string[];
  summary: string;
};

export type BioCraftEvaluation = {
  overallScore: number;
  rankingScore: number;
  recommendationScore: number;
  evidenceGroundingScore: number;
  constraintComplianceScore: number;
  toolEfficiencyScore: number;
  confidenceScore: number;
  completenessScore: number;
  pairwiseCorrect: number;
  pairwiseTotal: number;
  citedEvidenceIds: string[];
  unsupportedEvidenceIds: string[];
  groundTruth: {
    labelType: string;
    methodology: string;
    rankedCandidates: string[];
    recommendedMutation: string;
  };
};

export type BioCraftState = {
  challengeId: string;
  challengeVersion: string;
  challengeTitle: string;
  objective: string;
  status: "ready" | "running" | "submitted" | "completed" | "failed";
  biologicalAssets: {
    sequences: Array<{
      id: string;
      description: string;
      sequence: string;
      length: number;
      kind: "reference" | "homolog" | "generated";
    }>;
    structures: Array<{
      id: string;
      format: "pdb";
      residueCount: number;
      source: string;
      residues: Array<{
        position: number;
        name: string;
        x: number;
        y: number;
        z: number;
      }>;
    }>;
    annotations: BioAnnotation[];
    candidateMutations: MutationCandidate[];
  };
  workspace: {
    selectedSequenceId?: string;
    selectedResidue?: number;
    activeStructureId?: string;
    generatedMutationIds: string[];
    notes: EvidenceNote[];
  };
  toolHistory: BiologyToolInvocation[];
  artifacts: ArtifactReference[];
  budget: {
    toolCallsUsed: number;
    maxToolCalls: number;
    elapsedMs: number;
    maxRuntimeMs: number;
  };
  availableTools: string[];
  unavailableTools: Array<{ id: string; reason: string }>;
  submission?: BioCraftSubmission;
  evaluation?: BioCraftEvaluation;
  reproducibility: {
    pluginVersion: string;
    challengeVersion: string;
    backend: string;
    backendVersion: string;
    seed?: number;
    networkAccess: false;
  };
};

export type BioCraftObservation = {
  environmentId: "biocraft-v1";
  challengeId: string;
  objective: string;
  status: BioCraftState["status"];
  reference: BioCraftState["biologicalAssets"]["sequences"][number];
  homologs: BioCraftState["biologicalAssets"]["sequences"];
  candidates: MutationCandidate[];
  annotations: BioAnnotation[];
  toolHistory: BiologyToolInvocation[];
  notes: EvidenceNote[];
  artifacts: ArtifactReference[];
  budget: BioCraftState["budget"];
  availableTools: string[];
  unavailableTools: BioCraftState["unavailableTools"];
  submission?: BioCraftSubmission;
  evaluation?: BioCraftEvaluation;
};

type InspectSequenceArguments = { sequenceId: string; analyses: string[] };
type AlignSequencesArguments = {
  sequenceIds: string[];
  mode: "global" | "local" | "multiple";
};
type ScoreSubstitutionArguments = {
  sequenceId: string;
  position: number;
  alternateResidue: string;
};
type ApplyMutationArguments = { sequenceId: string; mutation: string };
type InspectStructureArguments = {
  structureId: string;
  residuePosition: number;
  radiusAngstroms?: number;
};
type InspectAnnotationsArguments = {
  sequenceId: string;
  start?: number;
  end?: number;
};
type WriteNoteArguments = {
  category: EvidenceNote["category"];
  content: string;
  evidenceIds?: string[];
};

export type BioCraftAction = AgentAction<
  | InspectSequenceArguments
  | AlignSequencesArguments
  | ScoreSubstitutionArguments
  | ApplyMutationArguments
  | InspectStructureArguments
  | InspectAnnotationsArguments
  | WriteNoteArguments
  | BioCraftSubmission
>;

const metadata: EnvironmentMetadata = {
  id: "biocraft-v1",
  name: "BioCraft",
  version: "1.0.0",
  description:
    "A verifiable computational biology workbench where agents investigate protein mutations with deterministic local tools.",
  tags: [
    "biology",
    "protein",
    "scientific-tools",
    "evidence",
    "deterministic",
    "offline"
  ],
  runtime: "in-process"
};

const actionSchema: JsonSchema = {
  type: "object",
  required: ["id", "type", "arguments"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    type: {
      enum: [
        "biology.inspect_sequence",
        "biology.align_sequences",
        "biology.score_substitution",
        "biology.apply_mutation",
        "biology.inspect_structure",
        "biology.inspect_annotations",
        "biology.write_note",
        "biology.submit"
      ]
    },
    summary: { type: "string" },
    metadata: { type: "object" },
    arguments: { type: "object" }
  },
  allOf: [
    actionArgumentsSchema("biology.inspect_sequence", ["sequenceId", "analyses"], {
      sequenceId: { type: "string" },
      analyses: { type: "array", items: { type: "string" }, minItems: 1 }
    }),
    actionArgumentsSchema("biology.align_sequences", ["sequenceIds", "mode"], {
      sequenceIds: { type: "array", items: { type: "string" }, minItems: 2 },
      mode: { enum: ["global", "local", "multiple"] }
    }),
    actionArgumentsSchema(
      "biology.score_substitution",
      ["sequenceId", "position", "alternateResidue"],
      {
        sequenceId: { type: "string" },
        position: { type: "integer", minimum: 1 },
        alternateResidue: { type: "string", pattern: "^[ACDEFGHIKLMNPQRSTVWY]$" }
      }
    ),
    actionArgumentsSchema("biology.apply_mutation", ["sequenceId", "mutation"], {
      sequenceId: { type: "string" },
      mutation: { type: "string", pattern: "^[ACDEFGHIKLMNPQRSTVWY][1-9][0-9]*[ACDEFGHIKLMNPQRSTVWY]$" }
    }),
    actionArgumentsSchema(
      "biology.inspect_structure",
      ["structureId", "residuePosition"],
      {
        structureId: { type: "string" },
        residuePosition: { type: "integer", minimum: 1 },
        radiusAngstroms: { type: "number", minimum: 2, maximum: 20 }
      }
    ),
    actionArgumentsSchema("biology.inspect_annotations", ["sequenceId"], {
      sequenceId: { type: "string" },
      start: { type: "integer", minimum: 1 },
      end: { type: "integer", minimum: 1 }
    }),
    actionArgumentsSchema("biology.write_note", ["category", "content"], {
      category: { enum: ["hypothesis", "observation", "uncertainty", "decision"] },
      content: { type: "string", minLength: 3 },
      evidenceIds: { type: "array", items: { type: "string" } }
    }),
    actionArgumentsSchema(
      "biology.submit",
      [
        "rankedCandidates",
        "recommendedMutation",
        "overallConfidence",
        "limitations",
        "summary"
      ],
      {
        rankedCandidates: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: [
              "mutation",
              "rank",
              "predictedEffect",
              "confidence",
              "evidenceIds",
              "justification"
            ],
            properties: {
              mutation: { type: "string" },
              rank: { type: "integer", minimum: 1 },
              predictedEffect: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              evidenceIds: { type: "array", items: { type: "string" } },
              justification: { type: "string" }
            }
          }
        },
        recommendedMutation: { type: "string" },
        overallConfidence: { type: "number", minimum: 0, maximum: 1 },
        limitations: { type: "array", items: { type: "string" } },
        summary: { type: "string", minLength: 3 }
      }
    )
  ]
};

const observationSchema: JsonSchema = {
  type: "object",
  required: [
    "environmentId",
    "challengeId",
    "objective",
    "status",
    "reference",
    "homologs",
    "candidates",
    "toolHistory",
    "budget",
    "availableTools"
  ],
  properties: {
    environmentId: { const: "biocraft-v1" },
    challengeId: { type: "string" },
    objective: { type: "string" },
    status: { enum: ["ready", "running", "submitted", "completed", "failed"] },
    reference: { type: "object" },
    homologs: { type: "array" },
    candidates: { type: "array" },
    toolHistory: { type: "array" },
    budget: { type: "object" },
    availableTools: { type: "array" }
  }
};

export class BioCraftEnvironment
  implements Environment<BioCraftObservation, BioCraftAction, BioCraftState>
{
  readonly metadata = metadata;
  #episodeId = "";
  #seed?: number;
  #challenge?: BioCraftChallenge;
  #state?: BioCraftState;
  #startedAt = 0;
  #presentationDelayMs = 0;

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
    this.#seed = context.seed;
  }

  async reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<BioCraftObservation, BioCraftState>> {
    this.#episodeId = input.episodeId;
    this.#seed = input.seed;
    this.#challenge = await loadBioCraftChallenge();
    this.#startedAt = Date.now();
    this.#presentationDelayMs =
      typeof input.scenario?.parameters?.presentationDelayMs === "number"
        ? Math.max(0, Math.min(1_000, Math.floor(input.scenario.parameters.presentationDelayMs)))
        : 0;
    const maxToolCalls =
      typeof input.scenario?.parameters?.maxToolCalls === "number"
        ? Math.min(
            this.#challenge.manifest.maxToolCalls,
            Math.max(1, Math.floor(input.scenario.parameters.maxToolCalls))
          )
        : this.#challenge.manifest.maxToolCalls;
    this.#state = createInitialState(this.#challenge, maxToolCalls, input.seed);
    return { observation: this.observe(), state: structuredClone(this.#state) };
  }

  async step(
    action: BioCraftAction
  ): Promise<EnvironmentStepResult<BioCraftObservation, BioCraftState>> {
    const state = this.requireState();
    const challenge = this.requireChallenge();
    const step = state.toolHistory.length + state.workspace.notes.length + (state.submission ? 1 : 0) + 1;
    if (state.status === "completed") {
      return {
        observation: this.observe(),
        state: structuredClone(state),
        reward: 0,
        terminated: true,
        truncated: false,
        terminationReason: "submission_evaluated"
      };
    }
    state.status = "running";
    const events: ArenaEvent[] = [];
    const artifacts: ArtifactReference[] = [];

    if (action.type === "biology.write_note") {
      const args = action.arguments as WriteNoteArguments;
      const note: EvidenceNote = {
        id: randomUUID(),
        category: args.category,
        content: args.content,
        evidenceIds: args.evidenceIds ?? [],
        createdAtStep: step
      };
      state.workspace.notes.push(note);
      events.push(bioEvent("biocraft.note_created", this.#episodeId, step, { note }));
      this.updateElapsed();
      await this.presentationPause();
      return this.result(events, artifacts, 0.02, false);
    }

    if (action.type === "biology.submit") {
      const submission = action.arguments as BioCraftSubmission;
      validateSubmission(submission, challenge.candidates);
      state.submission = structuredClone(submission);
      state.status = "submitted";
      events.push(
        bioEvent("biocraft.submission_received", this.#episodeId, step, {
          submission
        })
      );
      state.evaluation = await evaluateSubmission(state, submission);
      state.status = "completed";
      events.push(
        bioEvent("biocraft.evaluation_completed", this.#episodeId, step, {
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
      throw new Error(`BioCraft tool "${action.type}" is not allowed for this challenge.`);
    }
    if (state.budget.toolCallsUsed >= state.budget.maxToolCalls) {
      return this.failedToolResult(action, step, "Tool-call budget exhausted.");
    }
    if (Date.now() - this.#startedAt > state.budget.maxRuntimeMs) {
      return this.failedToolResult(action, step, "Scientific runtime budget exhausted.");
    }

    const invocationId = randomUUID();
    const startedAt = performance.now();
    state.budget.toolCallsUsed += 1;
    events.push(
      bioEvent("biocraft.tool_started", this.#episodeId, step, {
        tool: action.type,
        invocationId,
        inputs: action.arguments
      })
    );
    try {
      const executed = this.executeTool(action, challenge, invocationId, step);
      artifacts.push(...executed.artifacts);
      state.artifacts.push(...executed.artifacts);
      const invocation: BiologyToolInvocation = {
        id: invocationId,
        tool: action.type,
        status: "completed",
        inputs: structuredClone(action.arguments as Record<string, unknown>),
        output: executed.output,
        outputSummary: executed.summary,
        durationMs: roundDuration(performance.now() - startedAt),
        backend: executed.backend,
        backendVersion: "1.0.0",
        deterministic: true,
        artifactIds: executed.artifacts.map((artifact) => artifact.id),
        step
      };
      state.toolHistory.push(invocation);
      events.push(
        bioEvent("biocraft.tool_completed", this.#episodeId, step, { invocation })
      );
      if (action.type === "biology.apply_mutation") {
        events.push(
          bioEvent("biocraft.sequence_mutated", this.#episodeId, step, {
            invocationId,
            output: executed.output
          })
        );
      }
      if (action.type === "biology.inspect_structure") {
        events.push(
          bioEvent("biocraft.structure_inspected", this.#episodeId, step, {
            invocationId,
            output: executed.output
          })
        );
      }
      if (action.type === "biology.inspect_annotations") {
        events.push(
          bioEvent("biocraft.annotation_discovered", this.#episodeId, step, {
            invocationId,
            output: executed.output
          })
        );
      }
      events.push(
        bioEvent("biocraft.budget_updated", this.#episodeId, step, {
          budget: state.budget
        })
      );
      this.updateElapsed();
      await this.presentationPause();
      return this.result(events, artifacts, 0.03, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const invocation: BiologyToolInvocation = {
        id: invocationId,
        tool: action.type,
        status: "failed",
        inputs: structuredClone(action.arguments as Record<string, unknown>),
        error: message,
        durationMs: roundDuration(performance.now() - startedAt),
        backend: "biocraft-ts-science",
        backendVersion: "1.0.0",
        deterministic: true,
        artifactIds: [],
        step
      };
      state.toolHistory.push(invocation);
      events.push(
        bioEvent("biocraft.tool_failed", this.#episodeId, step, { invocation })
      );
      this.updateElapsed();
      await this.presentationPause();
      return this.result(events, artifacts, -0.08, false);
    }
  }

  async getState(): Promise<BioCraftState> {
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
    action: BioCraftAction,
    challenge: BioCraftChallenge,
    invocationId: string,
    step: number
  ): {
    output: Record<string, unknown>;
    summary: string;
    backend: string;
    artifacts: ArtifactReference[];
  } {
    const state = this.requireState();
    const sequence = challenge.reference.sequence;
    switch (action.type) {
      case "biology.inspect_sequence": {
        const args = action.arguments as InspectSequenceArguments;
        requireSequence(args.sequenceId, state);
        const output = {
          sequenceId: args.sequenceId,
          analyses: args.analyses,
          ...inspectSequence(sequence),
          hydropathyProfile: args.analyses.includes("hydropathy")
            ? hydropathyProfile(sequence)
            : undefined
        };
        state.workspace.selectedSequenceId = args.sequenceId;
        return {
          output,
          summary: `Calculated ${args.analyses.join(", ")} for ${sequence.length} residues.`,
          backend: "biocraft-ts-science / physicochemical constants",
          artifacts: []
        };
      }
      case "biology.align_sequences": {
        const args = action.arguments as AlignSequencesArguments;
        if (args.mode === "local") {
          throw new Error("Local alignment backend is unavailable in BioCraft v1; use global or multiple.");
        }
        if (args.mode === "multiple") {
          const profile = conservationProfile(challenge.homologs);
          return {
            output: {
              mode: "multiple",
              sequenceIds: challenge.homologs.map((record) => record.id),
              alignedSequences: challenge.homologs,
              conservationProfile: profile,
              meanConservation:
                profile.reduce((sum, position) => sum + position.conservation, 0) /
                profile.length
            },
            summary: `Computed conservation across ${challenge.homologs.length} bundled homologs.`,
            backend: "curated prealignment / Shannon entropy",
            artifacts: []
          };
        }
        const first = findSequence(args.sequenceIds[0]!, challenge, state);
        const second = findSequence(args.sequenceIds[1]!, challenge, state);
        return {
          output: {
            mode: "global",
            sequenceIds: args.sequenceIds.slice(0, 2),
            ...globalAlignment(first.sequence, second.sequence)
          },
          summary: `Globally aligned ${first.id} and ${second.id}.`,
          backend: "Needleman-Wunsch",
          artifacts: []
        };
      }
      case "biology.score_substitution": {
        const args = action.arguments as ScoreSubstitutionArguments;
        requireSequence(args.sequenceId, state);
        const referenceResidue = sequence[args.position - 1];
        if (!referenceResidue) throw new Error(`Position ${args.position} is outside the reference.`);
        const candidate = challenge.candidates.find(
          (item) =>
            item.position === args.position &&
            item.alternateResidue === args.alternateResidue
        );
        const profile = conservationProfile(challenge.homologs)[args.position - 1]!;
        const overlaps = challenge.annotations.filter(
          (annotation) =>
            args.position >= annotation.start && args.position <= annotation.end
        );
        return {
          output: {
            mutation: `${referenceResidue}${args.position}${args.alternateResidue}`,
            candidateRegistered: Boolean(candidate),
            position: args.position,
            ...substitutionEvidence(referenceResidue, args.alternateResidue),
            conservation: profile,
            annotationOverlaps: overlaps
          },
          summary: `BLOSUM62 and physicochemical evidence calculated for ${referenceResidue}${args.position}${args.alternateResidue}.`,
          backend: "BLOSUM62 / bundled homolog conservation",
          artifacts: []
        };
      }
      case "biology.apply_mutation": {
        const args = action.arguments as ApplyMutationArguments;
        requireSequence(args.sequenceId, state);
        const mutated = applyMutation(sequence, args.mutation);
        const id = `mutant-${args.mutation}`;
        if (!state.biologicalAssets.sequences.some((record) => record.id === id)) {
          state.biologicalAssets.sequences.push({
            id,
            description: `${challenge.reference.description}; ${args.mutation}`,
            sequence: mutated.sequence,
            length: mutated.sequence.length,
            kind: "generated"
          });
          state.workspace.generatedMutationIds.push(id);
        }
        const fasta = `>${id}\n${mutated.sequence}\n`;
        const artifact: ArtifactReference = {
          id: `artifact-${invocationId}`,
          name: `${id}.fasta`,
          mediaType: "text/x-fasta",
          uri: `data:text/x-fasta;base64,${Buffer.from(fasta).toString("base64")}`,
          size: Buffer.byteLength(fasta)
        };
        return {
          output: { ...mutated, sequenceId: id, artifactId: artifact.id },
          summary: `Validated and generated ${args.mutation} mutant FASTA.`,
          backend: "deterministic sequence transformation",
          artifacts: [artifact]
        };
      }
      case "biology.inspect_structure": {
        const args = action.arguments as InspectStructureArguments;
        if (args.structureId !== "1UBQ") throw new Error(`Unknown structure "${args.structureId}".`);
        state.workspace.activeStructureId = args.structureId;
        state.workspace.selectedResidue = args.residuePosition;
        const output = inspectStructure(
          challenge.structure,
          args.residuePosition,
          args.radiusAngstroms ?? 8
        );
        return {
          output,
          summary: `Found ${output.neighbors.length} C-alpha neighbors within ${output.radiusAngstroms} A.`,
          backend: output.backend,
          artifacts: []
        };
      }
      case "biology.inspect_annotations": {
        const args = action.arguments as InspectAnnotationsArguments;
        requireSequence(args.sequenceId, state);
        const start = args.start ?? 1;
        const end = args.end ?? sequence.length;
        const annotations = challenge.annotations.filter(
          (annotation) => annotation.end >= start && annotation.start <= end
        );
        return {
          output: { sequenceId: args.sequenceId, start, end, annotations },
          summary: `Returned ${annotations.length} provenance-linked annotations.`,
          backend: "bundled RCSB / UniProt annotation subset",
          artifacts: []
        };
      }
      default:
        throw new Error(`Unsupported scientific tool "${action.type}".`);
    }
  }

  private failedToolResult(
    action: BioCraftAction,
    step: number,
    message: string
  ): EnvironmentStepResult<BioCraftObservation, BioCraftState> {
    const invocation: BiologyToolInvocation = {
      id: randomUUID(),
      tool: action.type,
      status: "failed",
      inputs: structuredClone(action.arguments as Record<string, unknown>),
      error: message,
      durationMs: 0,
      backend: "arena-budget-guard",
      backendVersion: "1.0.0",
      deterministic: true,
      artifactIds: [],
      step
    };
    this.requireState().toolHistory.push(invocation);
    return this.result(
      [bioEvent("biocraft.tool_failed", this.#episodeId, step, { invocation })],
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
  ): EnvironmentStepResult<BioCraftObservation, BioCraftState> {
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
        score: state.evaluation?.overallScore
      }
    };
  }

  private observe(): Observation<BioCraftObservation> {
    const state = this.requireState();
    const reference = state.biologicalAssets.sequences.find(
      (record) => record.kind === "reference"
    )!;
    return {
      id: randomUUID(),
      episodeId: this.#episodeId,
      step: state.toolHistory.length + state.workspace.notes.length,
      timestamp: new Date().toISOString(),
      activeParticipantId: "primary",
      availableActions: state.status === "completed" ? [] : state.availableTools,
      attachments: state.artifacts,
      data: {
        environmentId: "biocraft-v1",
        challengeId: state.challengeId,
        objective: state.objective,
        status: state.status,
        reference,
        homologs: state.biologicalAssets.sequences.filter(
          (record) => record.kind === "homolog"
        ),
        candidates: state.biologicalAssets.candidateMutations,
        annotations: state.biologicalAssets.annotations,
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

  private updateElapsed(): void {
    this.requireState().budget.elapsedMs = Date.now() - this.#startedAt;
  }

  private async presentationPause(): Promise<void> {
    if (this.#presentationDelayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.#presentationDelayMs));
  }

  private requireState(): BioCraftState {
    if (!this.#state) throw new Error("BioCraft has not been reset.");
    return this.#state;
  }

  private requireChallenge(): BioCraftChallenge {
    if (!this.#challenge) throw new Error("BioCraft challenge is not loaded.");
    return this.#challenge;
  }
}

class BioCraftResearchAgent implements Agent<BioCraftObservation, BioCraftAction> {
  readonly metadata: AgentMetadata = {
    id: "biocraft-researcher",
    name: "BioCraft Research Baseline",
    version: "1.0.0",
    description:
      "A deterministic test researcher that uses the same public BioCraft tools as provider-backed agents.",
    provider: "ArenaOS",
    model: "deterministic-scientific-baseline",
    tags: ["biology", "biocraft", "scientific-tools", "deterministic"]
  };

  async initialize(_context: AgentInitializeContext): Promise<void> {}

  async act(
    input: AgentActInput<BioCraftObservation>
  ): Promise<AgentActResult<BioCraftAction>> {
    const observation = input.observation.data;
    const history = observation.toolHistory;
    const completed = (type: string) =>
      history.filter((invocation) => invocation.tool === type && invocation.status === "completed");
    if (!completed("biology.inspect_sequence").length) {
      return action("biology.inspect_sequence", {
        sequenceId: observation.reference.id,
        analyses: ["composition", "molecular_weight", "charge", "hydropathy"]
      }, "Inspecting the reference sequence and physicochemical baseline.");
    }
    if (!completed("biology.align_sequences").length) {
      return action("biology.align_sequences", {
        sequenceIds: observation.homologs.map((record) => record.id),
        mode: "multiple"
      }, "Computing conservation from the bundled homolog alignment.");
    }
    const scoredMutations = new Set(
      completed("biology.score_substitution").map(
        (invocation) => String(invocation.output?.mutation)
      )
    );
    const pendingCandidate = observation.candidates.find(
      (candidate) => !scoredMutations.has(candidate.mutation)
    );
    if (pendingCandidate) {
      return action("biology.score_substitution", {
        sequenceId: observation.reference.id,
        position: pendingCandidate.position,
        alternateResidue: pendingCandidate.alternateResidue
      }, `Calculating substitution evidence for ${pendingCandidate.mutation}.`);
    }
    if (!completed("biology.inspect_annotations").length) {
      return action("biology.inspect_annotations", {
        sequenceId: observation.reference.id,
        start: 1,
        end: observation.reference.length
      }, "Inspecting provenance-linked functional and structural annotations.");
    }
    const ranked = rankFromEvidence(observation);
    if (!completed("biology.inspect_structure").length) {
      const selected = observation.candidates.find(
        (candidate) => candidate.mutation === ranked[0]!.mutation
      )!;
      return action("biology.inspect_structure", {
        structureId: "1UBQ",
        residuePosition: selected.position,
        radiusAngstroms: 8
      }, `Inspecting the 1UBQ neighborhood around ${selected.mutation}.`);
    }
    if (!completed("biology.apply_mutation").length) {
      return action("biology.apply_mutation", {
        sequenceId: observation.reference.id,
        mutation: ranked[0]!.mutation
      }, `Generating a validated ${ranked[0]!.mutation} FASTA artifact.`);
    }
    if (!observation.notes.length) {
      return action("biology.write_note", {
        category: "decision",
        content:
          `${ranked[0]!.mutation} is the strongest computational preservation candidate. ` +
          "This is a sequence-, conservation-, annotation-, and structure-grounded inference, not experimental proof.",
        evidenceIds: history.filter((item) => item.status === "completed").map((item) => item.id)
      }, "Recording a concise evidence-linked decision note.");
    }
    const evidenceIds = history
      .filter((item) => item.status === "completed")
      .map((item) => item.id);
    const submission: BioCraftSubmission = {
      rankedCandidates: ranked.map((candidate, index) => ({
        mutation: candidate.mutation,
        rank: index + 1,
        predictedEffect:
          candidate.penalty >= 8
            ? "high functional risk"
            : candidate.penalty >= 4
              ? "functionally constrained"
              : candidate.penalty > 0
                ? "conservative with local context risk"
                : "likely function-preserving",
        confidence: Math.max(0.45, Math.min(0.94, 0.72 + candidate.score / 50)),
        evidenceIds,
        justification:
          `Composite evidence score ${candidate.score.toFixed(2)} from BLOSUM62, ` +
          `conservation, and ${candidate.penalty ? "functional annotation penalties" : "no critical annotation overlap"}.`
      })),
      recommendedMutation: ranked[0]!.mutation,
      overallConfidence: 0.82,
      limitations: [
        "No experimental stability assay was run.",
        "Solvent accessibility uses a documented C-alpha neighborhood approximation.",
        "The bundled homolog set is intentionally small for offline deterministic execution."
      ],
      summary:
        `${ranked[0]!.mutation} is recommended as the best function-preserving candidate under the declared computational evidence profile.`
    };
    return action("biology.submit", submission, "Submitting the evidence-linked mutation ranking.");
  }

  async reset(): Promise<void> {}
  async close(): Promise<void> {}
}

class BioCraftScientificEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "biocraft-scientific-score",
    name: "BioCraft Deterministic Scientific Score",
    version: "1.0.0",
    description:
      "Weighted ranking, recommendation, evidence, compliance, efficiency, confidence, and completeness score.",
    tags: ["biology", "deterministic", "ground-truth"]
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as BioCraftState;
    const evaluation = state.evaluation;
    if (!evaluation) {
      return {
        evaluatorId: this.metadata.id,
        score: 0,
        passed: false,
        metrics: [{ name: "submission_received", value: false }],
        summary: "No BioCraft submission was evaluated."
      };
    }
    return {
      evaluatorId: this.metadata.id,
      score: evaluation.overallScore,
      passed: evaluation.overallScore >= 0.7,
      metrics: [
        { name: "ranking_accuracy", value: evaluation.rankingScore },
        { name: "recommendation_accuracy", value: evaluation.recommendationScore },
        { name: "evidence_grounding", value: evaluation.evidenceGroundingScore },
        { name: "constraint_compliance", value: evaluation.constraintComplianceScore },
        { name: "tool_efficiency", value: evaluation.toolEfficiencyScore },
        { name: "confidence", value: evaluation.confidenceScore },
        { name: "report_completeness", value: evaluation.completenessScore }
      ],
      summary: `BioCraft scientific score ${(evaluation.overallScore * 100).toFixed(1)}%.`
    };
  }
}

function createInitialState(
  challenge: BioCraftChallenge,
  maxToolCalls: number,
  seed?: number
): BioCraftState {
  return {
    challengeId: challenge.manifest.id,
    challengeVersion: challenge.manifest.version,
    challengeTitle: challenge.manifest.title,
    objective: challenge.manifest.objective,
    status: "ready",
    biologicalAssets: {
      sequences: [
        {
          id: challenge.reference.id,
          description: challenge.reference.description,
          sequence: challenge.reference.sequence,
          length: challenge.reference.sequence.length,
          kind: "reference"
        },
        ...challenge.homologs
          .filter((record) => record.id !== challenge.reference.id)
          .map((record) => ({
            id: record.id,
            description: record.description,
            sequence: record.sequence,
            length: record.sequence.length,
            kind: "homolog" as const
          }))
      ],
      structures: [
        {
          id: "1UBQ",
          format: "pdb",
          residueCount: challenge.structure.length,
          source: "RCSB PDB 1UBQ",
          residues: challenge.structure.map(({ position, name, x, y, z }) => ({
            position,
            name,
            x,
            y,
            z
          }))
        }
      ],
      annotations: challenge.annotations,
      candidateMutations: challenge.candidates
    },
    workspace: {
      selectedSequenceId: challenge.reference.id,
      activeStructureId: "1UBQ",
      generatedMutationIds: [],
      notes: []
    },
    toolHistory: [],
    artifacts: [],
    budget: {
      toolCallsUsed: 0,
      maxToolCalls,
      elapsedMs: 0,
      maxRuntimeMs: challenge.manifest.maxRuntimeMs
    },
    availableTools: challenge.manifest.allowedTools,
    unavailableTools: [
      {
        id: "biology.estimate_stability",
        reason:
          "Unavailable: no licensed or validated local FoldX, Rosetta, or mutation-effect backend is configured."
      },
      {
        id: "biology.run_python",
        reason:
          "Unavailable in v1: unrestricted code execution is intentionally disabled until the sandbox worker is installed."
      }
    ],
    reproducibility: {
      pluginVersion: metadata.version,
      challengeVersion: challenge.manifest.version,
      backend: "biocraft-ts-science",
      backendVersion: "1.0.0",
      seed,
      networkAccess: false
    }
  };
}

async function evaluateSubmission(
  state: BioCraftState,
  submission: BioCraftSubmission
): Promise<BioCraftEvaluation> {
  const truth = await loadBioCraftGroundTruth();
  const submittedRanking = [...submission.rankedCandidates]
    .sort((left, right) => left.rank - right.rank)
    .map((candidate) => candidate.mutation);
  let pairwiseCorrect = 0;
  let pairwiseTotal = 0;
  for (let left = 0; left < truth.rankedCandidates.length; left += 1) {
    for (let right = left + 1; right < truth.rankedCandidates.length; right += 1) {
      pairwiseTotal += 1;
      const expectedLeft = truth.rankedCandidates[left]!;
      const expectedRight = truth.rankedCandidates[right]!;
      if (submittedRanking.indexOf(expectedLeft) < submittedRanking.indexOf(expectedRight)) {
        pairwiseCorrect += 1;
      }
    }
  }
  const rankingScore = pairwiseTotal ? pairwiseCorrect / pairwiseTotal : 0;
  const recommendationScore =
    submission.recommendedMutation === truth.recommendedMutation ? 1 : 0;
  const validEvidenceIds = new Set(state.toolHistory.map((item) => item.id));
  const citedEvidenceIds = [
    ...new Set(
      submission.rankedCandidates.flatMap((candidate) => candidate.evidenceIds)
    )
  ];
  const unsupportedEvidenceIds = citedEvidenceIds.filter(
    (id) => !validEvidenceIds.has(id)
  );
  const candidatesWithValidEvidence = submission.rankedCandidates.filter(
    (candidate) =>
      candidate.evidenceIds.length > 0 &&
      candidate.evidenceIds.every((id) => validEvidenceIds.has(id))
  ).length;
  const evidenceGroundingScore =
    submission.rankedCandidates.length > 0
      ? candidatesWithValidEvidence / submission.rankedCandidates.length
      : 0;
  const expectedMutations = new Set(truth.rankedCandidates);
  const submittedMutations = new Set(submittedRanking);
  const constraintComplianceScore =
    submittedMutations.size === expectedMutations.size &&
    [...expectedMutations].every((mutation) => submittedMutations.has(mutation)) &&
    unsupportedEvidenceIds.length === 0
      ? 1
      : 0;
  const failedCalls = state.toolHistory.filter((item) => item.status === "failed").length;
  const efficientCalls = Math.max(0, state.budget.toolCallsUsed - 10);
  const toolEfficiencyScore = Math.max(
    0,
    1 - failedCalls * 0.2 - efficientCalls / state.budget.maxToolCalls
  );
  const confidenceScore = recommendationScore
    ? 1 - Math.abs(1 - submission.overallConfidence)
    : 1 - submission.overallConfidence;
  const completenessScore =
    (submission.summary.trim().length >= 20 ? 0.25 : 0) +
    (submission.limitations.length >= 1 ? 0.25 : 0) +
    (submission.rankedCandidates.every(
      (candidate) =>
        candidate.justification.trim().length >= 20 &&
        candidate.predictedEffect.trim().length > 0
    )
      ? 0.5
      : 0);
  const overallScore =
    rankingScore * 0.4 +
    recommendationScore * 0.2 +
    evidenceGroundingScore * 0.15 +
    constraintComplianceScore * 0.1 +
    toolEfficiencyScore * 0.05 +
    confidenceScore * 0.05 +
    completenessScore * 0.05;
  return {
    overallScore: round(overallScore),
    rankingScore: round(rankingScore),
    recommendationScore,
    evidenceGroundingScore: round(evidenceGroundingScore),
    constraintComplianceScore,
    toolEfficiencyScore: round(toolEfficiencyScore),
    confidenceScore: round(confidenceScore),
    completenessScore: round(completenessScore),
    pairwiseCorrect,
    pairwiseTotal,
    citedEvidenceIds,
    unsupportedEvidenceIds,
    groundTruth: {
      labelType: truth.labelType,
      methodology: truth.methodology,
      rankedCandidates: truth.rankedCandidates,
      recommendedMutation: truth.recommendedMutation
    }
  };
}

function rankFromEvidence(observation: BioCraftObservation) {
  const annotations = observation.annotations;
  return observation.candidates
    .map((candidate) => {
      const invocation = observation.toolHistory.find(
        (item) =>
          item.tool === "biology.score_substitution" &&
          item.output?.mutation === candidate.mutation
      );
      const blosum = Number(invocation?.output?.blosum62 ?? -10);
      const conservation = Number(
        (invocation?.output?.conservation as { conservation?: number } | undefined)
          ?.conservation ?? 0
      );
      const overlaps = annotations.filter(
        (annotation) =>
          candidate.position >= annotation.start &&
          candidate.position <= annotation.end
      );
      const penalty = overlaps.reduce((sum, annotation) => {
        if (annotation.id === "ann-c-terminal-diglycine") return sum + 10;
        if (annotation.id === "ann-lys48-linkage") return sum + 5;
        if (annotation.id === "ann-ile44-patch") return sum + 2;
        if (annotation.type === "secondary_structure") return sum + 1;
        return sum;
      }, 0);
      return {
        mutation: candidate.mutation,
        score: blosum * 2 + conservation * 3 - penalty,
        penalty
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.mutation.localeCompare(right.mutation)
    );
}

function validateSubmission(
  submission: BioCraftSubmission,
  candidates: MutationCandidate[]
): void {
  const expected = new Set(candidates.map((candidate) => candidate.mutation));
  const submitted = submission.rankedCandidates.map((candidate) => candidate.mutation);
  if (new Set(submitted).size !== submitted.length) {
    throw new Error("Submission contains duplicate mutation candidates.");
  }
  if (
    submitted.length !== expected.size ||
    submitted.some((mutation) => !expected.has(mutation))
  ) {
    throw new Error("Submission must rank every challenge candidate exactly once.");
  }
  const ranks = submission.rankedCandidates
    .map((candidate) => candidate.rank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    throw new Error("Submission ranks must be contiguous and start at 1.");
  }
  if (!expected.has(submission.recommendedMutation)) {
    throw new Error("Recommended mutation is not a challenge candidate.");
  }
}

function requireSequence(sequenceId: string, state: BioCraftState) {
  const record = state.biologicalAssets.sequences.find(
    (sequence) => sequence.id === sequenceId
  );
  if (!record) throw new Error(`Unknown sequence "${sequenceId}".`);
  return record;
}

function findSequence(
  sequenceId: string,
  challenge: BioCraftChallenge,
  state: BioCraftState
) {
  const stateRecord = state.biologicalAssets.sequences.find(
    (record) => record.id === sequenceId
  );
  if (stateRecord) return stateRecord;
  const challengeRecord = challenge.homologs.find(
    (record) => record.id === sequenceId
  );
  if (!challengeRecord) throw new Error(`Unknown sequence "${sequenceId}".`);
  return challengeRecord;
}

function actionArgumentsSchema(
  actionType: string,
  required: string[],
  properties: Record<string, unknown>
) {
  return {
    if: { properties: { type: { const: actionType } }, required: ["type"] },
    then: {
      properties: {
        arguments: {
          type: "object",
          required,
          additionalProperties: false,
          properties
        }
      }
    }
  };
}

function action<T extends BioCraftAction["arguments"]>(
  type: string,
  args: T,
  summary: string
): AgentActResult<BioCraftAction> {
  return {
    action: {
      id: randomUUID(),
      type,
      arguments: args,
      summary,
      metadata: { declaredPlan: summary }
    }
  };
}

function bioEvent(
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
      backend: "biocraft-ts-science",
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

const environmentFactory: EnvironmentFactory = {
  metadata,
  create: () => new BioCraftEnvironment()
};

const agentFactory: AgentFactory = {
  metadata: new BioCraftResearchAgent().metadata,
  create: () => new BioCraftResearchAgent()
};

const evaluatorFactory: EvaluatorFactory = {
  metadata: new BioCraftScientificEvaluator().metadata,
  create: () => new BioCraftScientificEvaluator()
};

export const bioCraftPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.biocraft",
    name: "BioCraft",
    version: "1.0.0",
    description:
      "Protein-mutation challenge packs, deterministic scientific tools, research baseline, and objective evaluator."
  },
  async register(context) {
    context.environments.register(metadata.id, environmentFactory);
    context.agents.register(agentFactory.metadata.id, agentFactory);
    context.evaluators.register(evaluatorFactory.metadata.id, evaluatorFactory);
  }
};

export const bioCraftScientific = {
  inspectSequence,
  substitutionEvidence,
  applyMutation,
  conservationProfile,
  globalAlignment,
  inspectStructure,
  loadChallenge: loadBioCraftChallenge,
  loadGroundTruth: loadBioCraftGroundTruth
};
