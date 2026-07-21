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

export type PersonaMode =
  | "debate"
  | "negotiation"
  | "crisis"
  | "trial"
  | "social_deduction";
export type CouncilPhase =
  | "speaking"
  | "cross_examination"
  | "negotiation"
  | "voting"
  | "completed";

export type PersonaMetrics = {
  reputation: number;
  trust: number;
  influence: number;
  politicalCapital: number;
  publicApproval: number;
  suspicion: number;
  resources: number;
  confidence: number;
  evidenceScore: number;
  logicScore: number;
  persuasionScore: number;
  personaConsistency: number;
  informationGain: number;
  objectiveProgress: number;
  communicationEfficiency: number;
};

export type PersonaDefinition = {
  id: string;
  displayName: string;
  title: string;
  domain: string;
  color: string;
  accent: string;
  seat: number;
  speakingStyle: string;
  traits: string[];
  publicGoal: string;
  preferredChoice: string;
  status: "active" | "eliminated";
  metrics: PersonaMetrics;
  alliances: string[];
  votesReceived: number;
};

export type CouncilRelationship = {
  fromId: string;
  toId: string;
  trust: number;
  allianceStrength: number;
  suspicion: number;
};

export type CouncilStatement = {
  id: string;
  round: number;
  phase: CouncilPhase;
  speakerId: string;
  targetId?: string;
  actionType: string;
  message: string;
  stance?: string;
  rhetoricalMode?: string;
  evidenceIds: string[];
  scores: {
    logic: number;
    evidence: number;
    persuasion: number;
    personaConsistency: number;
    efficiency: number;
  };
  audienceReaction:
    | "applause"
    | "shock"
    | "laughter"
    | "booing"
    | "standing_ovation"
    | "confusion"
    | "thoughtful";
  audienceDelta: number;
  caughtBluff?: boolean;
};

export type CouncilEvent = {
  id: string;
  round: number;
  phase: CouncilPhase;
  type:
    | "speech"
    | "question"
    | "challenge"
    | "negotiation"
    | "alliance_formed"
    | "alliance_broken"
    | "evidence"
    | "reveal"
    | "bluff"
    | "vote"
    | "phase"
    | "world"
    | "elimination"
    | "winner";
  actorId?: string;
  targetId?: string;
  description: string;
  deltas?: Record<string, number>;
};

export type PersonaCraftState = {
  sessionId: string;
  mode: PersonaMode;
  status: "ready" | "running" | "completed";
  timingMode: "turn_based";
  seed: number;
  round: number;
  maxRounds: number;
  phase: CouncilPhase;
  phaseIndex: number;
  activeParticipantId: string;
  actedThisPhase: string[];
  scenario: {
    id: string;
    title: string;
    topic: string;
    briefing: string;
    stakes: string;
    arena: "grand-ai-council";
    decisionChoices: Array<{ id: string; label: string; description: string }>;
    publicFacts: Array<{
      id: string;
      title: string;
      content: string;
      credibility: number;
      unlockedRound: number;
    }>;
  };
  personas: PersonaDefinition[];
  relationships: CouncilRelationship[];
  transcript: CouncilStatement[];
  eventHistory: CouncilEvent[];
  recentEvents: CouncilEvent[];
  votes: Record<string, string>;
  audience: {
    sentiment: number;
    energy: number;
    dominantReaction: CouncilStatement["audienceReaction"];
    reactionCounts: Record<string, number>;
  };
  world: {
    tension: number;
    consensus: number;
    informationLevel: number;
    decision?: string;
    update: string;
  };
  winner?: {
    participantId: string;
    reason: string;
    finalScore: number;
  };
  finalRanking?: Array<{
    participantId: string;
    score: number;
    goalCompleted: boolean;
  }>;
  revealedObjectives: Record<string, string>;
};

export type PersonaCraftObservation = {
  session: {
    mode: PersonaMode;
    round: number;
    maxRounds: number;
    phase: CouncilPhase;
    timingMode: "turn_based";
  };
  scenario: PersonaCraftState["scenario"];
  self: PersonaDefinition;
  privateObjective: string;
  otherPersonas: PersonaDefinition[];
  relationships: CouncilRelationship[];
  recentTranscript: CouncilStatement[];
  recentEvents: CouncilEvent[];
  audience: PersonaCraftState["audience"];
  world: PersonaCraftState["world"];
  votes: Record<string, string>;
  availableActions: string[];
  actionGuidance: Record<string, unknown>;
};

export type PersonaCraftActionArguments =
  | {
      message: string;
      stance: "support" | "oppose" | "neutral";
      rhetoricalMode:
        | "logical"
        | "emotional"
        | "visionary"
        | "pragmatic"
        | "conciliatory"
        | "confrontational";
      targetParticipantId?: string;
      evidenceIds?: string[];
    }
  | { targetParticipantId: string; message: string }
  | {
      targetParticipantId: string;
      claim: string;
      message: string;
      evidenceIds?: string[];
    }
  | {
      targetParticipantId: string;
      proposal: string;
      offerResources?: number;
      requestResources?: number;
      message: string;
    }
  | { targetParticipantId: string; terms: string }
  | { targetParticipantId: string; reason: string }
  | { evidenceId: string; interpretation: string }
  | { factId: string; message: string }
  | { claim: string; targetParticipantId?: string; risk: "low" | "medium" | "high" }
  | { choiceId: string; rationale: string }
  | { reason?: string };

export type PersonaCraftAction = AgentAction<PersonaCraftActionArguments>;

type ScenarioProfile = {
  id: string;
  title: string;
  topic: string;
  briefing: string;
  stakes: string;
  choices: Array<{ id: string; label: string; description: string }>;
  facts: Array<{ id: string; title: string; content: string; credibility: number; unlockedRound: number }>;
};

const metadata: EnvironmentMetadata = {
  id: "personacraft-v1",
  name: "PersonaCraft",
  version: "1.0.0",
  description:
    "A deterministic multiplayer council where human and AI personas debate, negotiate, form alliances, challenge claims, reveal evidence, vote, and reshape a measurable political world.",
  tags: [
    "language",
    "multi-agent",
    "negotiation",
    "debate",
    "roleplay",
    "3d",
    "deterministic"
  ],
  runtime: "in-process"
};

const actionTypes = [
  "persona.speak",
  "persona.question",
  "persona.challenge",
  "persona.negotiate",
  "persona.form_alliance",
  "persona.break_alliance",
  "persona.present_evidence",
  "persona.reveal_fact",
  "persona.bluff",
  "persona.vote",
  "persona.pass"
] as const;

const phaseActions: Record<Exclude<CouncilPhase, "completed">, string[]> = {
  speaking: ["persona.speak", "persona.present_evidence", "persona.reveal_fact", "persona.bluff"],
  cross_examination: ["persona.question", "persona.challenge", "persona.speak", "persona.pass"],
  negotiation: [
    "persona.negotiate",
    "persona.form_alliance",
    "persona.break_alliance",
    "persona.speak",
    "persona.pass"
  ],
  voting: ["persona.vote", "persona.pass"]
};

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
    "session",
    "scenario",
    "self",
    "privateObjective",
    "otherPersonas",
    "relationships",
    "recentTranscript",
    "audience",
    "world",
    "availableActions",
    "actionGuidance"
  ],
  properties: {
    session: { type: "object" },
    scenario: { type: "object" },
    self: { type: "object" },
    privateObjective: { type: "string" },
    otherPersonas: { type: "array" },
    relationships: { type: "array" },
    recentTranscript: { type: "array" },
    recentEvents: { type: "array" },
    audience: { type: "object" },
    world: { type: "object" },
    votes: { type: "object" },
    availableActions: { type: "array" },
    actionGuidance: { type: "object" }
  }
};

export class PersonaCraftEnvironment
  implements Environment<PersonaCraftObservation, PersonaCraftAction, PersonaCraftState>
{
  readonly metadata = metadata;
  #episodeId = "";
  #state?: PersonaCraftState;
  #privateObjectives: Record<string, string> = {};

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
  }

  async reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<PersonaCraftObservation, PersonaCraftState>> {
    this.#episodeId = input.episodeId;
    const parameters = input.scenario?.parameters ?? {};
    const mode = parseMode(parameters.mode);
    const profile = scenarioProfile(mode);
    const participantIds = parseParticipantIds(parameters.participantIds);
    const roster = personaRoster(mode);
    const personas = participantIds.map((id, index) => {
      const template = roster[index % roster.length]!;
      const displayNames = parameters.displayNames as Record<string, unknown> | undefined;
      return createPersona(id, String(displayNames?.[id] ?? template.name), template, index);
    });
    this.#privateObjectives = Object.fromEntries(
      personas.map((persona, index) => [
        persona.id,
        privateObjective(mode, persona, profile.choices[index % profile.choices.length]!.id)
      ])
    );
    this.#state = {
      sessionId: input.episodeId,
      mode,
      status: "ready",
      timingMode: "turn_based",
      seed: input.seed ?? 505,
      round: 1,
      maxRounds: clampInteger(parameters.maxRounds, 1, 6, 3),
      phase: "speaking",
      phaseIndex: 0,
      activeParticipantId: personas[0]!.id,
      actedThisPhase: [],
      scenario: {
        id: profile.id,
        title: profile.title,
        topic: profile.topic,
        briefing: profile.briefing,
        stakes: profile.stakes,
        arena: "grand-ai-council",
        decisionChoices: structuredClone(profile.choices),
        publicFacts: profile.facts.filter((fact) => fact.unlockedRound <= 1)
      },
      personas,
      relationships: createRelationships(personas),
      transcript: [],
      eventHistory: [],
      recentEvents: [],
      votes: {},
      audience: {
        sentiment: 52,
        energy: 34,
        dominantReaction: "thoughtful",
        reactionCounts: {}
      },
      world: {
        tension: mode === "crisis" ? 72 : mode === "social_deduction" ? 60 : 42,
        consensus: 20,
        informationLevel: 18,
        update: scenarioUpdate(mode, 1)
      },
      revealedObjectives: {}
    };
    return {
      observation: this.observe(),
      state: structuredClone(this.#state)
    };
  }

  async step(
    action: PersonaCraftAction
  ): Promise<EnvironmentStepResult<PersonaCraftObservation, PersonaCraftState>> {
    const state = this.requireState();
    if (state.status === "completed") {
      return this.result([], 0, true, "council_completed");
    }
    state.status = "running";
    const actor = requirePersona(state, state.activeParticipantId);
    validateAction(action, actor, state);
    const recent = resolveAction(state, actor, action, this.#privateObjectives);
    state.recentEvents = recent;
    state.eventHistory.push(...recent);
    state.actedThisPhase.push(actor.id);
    const events: ArenaEvent[] = recent.map((event) =>
      personaEvent(`personacraft.${event.type}`, this.#episodeId, state, event)
    );
    const next = activePersonas(state).find(
      (persona) => !state.actedThisPhase.includes(persona.id)
    );
    if (next) {
      state.activeParticipantId = next.id;
      return this.result(events, actionReward(actor, recent), false);
    }

    state.actedThisPhase = [];
    const phaseEvents = advancePhase(state, this.#privateObjectives);
    state.recentEvents = [...recent, ...phaseEvents];
    state.eventHistory.push(...phaseEvents);
    events.push(
      ...phaseEvents.map((event) =>
        personaEvent(`personacraft.${event.type}`, this.#episodeId, state, event)
      )
    );
    const ended = state.phase === "completed";
    if (!ended) state.activeParticipantId = activePersonas(state)[0]!.id;
    if (ended) {
      events.push(
        personaEvent("personacraft.match_completed", this.#episodeId, state, {
          winner: state.winner,
          ranking: state.finalRanking,
          decision: state.world.decision
        })
      );
    }
    return this.result(
      events,
      actionReward(actor, recent),
      ended,
      ended ? "council_completed" : undefined
    );
  }

  async getState(): Promise<PersonaCraftState> {
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
      realtime: true,
      multiAgent: true,
      renderable: true,
      supportsSnapshots: true,
      supportsPause: true,
      supportsResume: true,
      supportsSeeding: true
    };
  }

  async close(): Promise<void> {}

  private observe(): Observation<PersonaCraftObservation> {
    const state = this.requireState();
    const self = requirePersona(state, state.activeParticipantId);
    const observation: PersonaCraftObservation = {
      session: {
        mode: state.mode,
        round: state.round,
        maxRounds: state.maxRounds,
        phase: state.phase,
        timingMode: state.timingMode
      },
      scenario: structuredClone(state.scenario),
      self: structuredClone(self),
      privateObjective: this.#privateObjectives[self.id] ?? "",
      otherPersonas: structuredClone(
        state.personas.filter((persona) => persona.id !== self.id)
      ),
      relationships: structuredClone(
        state.relationships.filter(
          (relationship) =>
            relationship.fromId === self.id || relationship.toId === self.id
        )
      ),
      recentTranscript: structuredClone(state.transcript.slice(-8)),
      recentEvents: structuredClone(state.recentEvents),
      audience: structuredClone(state.audience),
      world: structuredClone(state.world),
      votes:
        state.phase === "voting" || state.status === "completed"
          ? structuredClone(state.votes)
          : {},
      availableActions:
        state.phase === "completed" ? [] : [...phaseActions[state.phase]],
      actionGuidance: actionGuidanceFor(state, self)
    };
    return {
      id: randomUUID(),
      episodeId: this.#episodeId,
      step: state.transcript.length + state.eventHistory.length,
      timestamp: new Date().toISOString(),
      activeParticipantId: self.id,
      availableActions: observation.availableActions,
      data: observation
    };
  }

  private result(
    events: ArenaEvent[],
    reward: number,
    terminated: boolean,
    terminationReason?: string
  ): EnvironmentStepResult<PersonaCraftObservation, PersonaCraftState> {
    const state = this.requireState();
    return {
      observation: this.observe(),
      state: structuredClone(state),
      reward,
      terminated,
      truncated: false,
      terminationReason,
      events,
      info: {
        mode: state.mode,
        phase: state.phase,
        round: state.round,
        winner: state.winner,
        decision: state.world.decision
      }
    };
  }

  private requireState(): PersonaCraftState {
    if (!this.#state) throw new Error("PersonaCraft has not been reset.");
    return this.#state;
  }
}

type CouncilPolicy = "strategist" | "visionary" | "diplomat" | "skeptic";

const councilPolicyProfiles: Record<CouncilPolicy, { id: string; name: string; description: string }> = {
  strategist: { id: "council-strategist", name: "Council Strategist", description: "Consequence-focused coalition strategist" },
  visionary: { id: "council-visionary", name: "Council Visionary", description: "Systems thinker using evidence and reversible experiments" },
  diplomat: { id: "council-diplomat", name: "Council Diplomat", description: "Persuasive negotiator focused on consensus and alliances" },
  skeptic: { id: "council-skeptic", name: "Council Skeptic", description: "Evidence-first critic who stress-tests every proposal" }
};

class CouncilStrategistAgent
  implements Agent<PersonaCraftObservation, PersonaCraftAction>
{
  readonly metadata: AgentMetadata;
  #participantId = "";

  constructor(private readonly policy: CouncilPolicy = "strategist") {
    const profile = councilPolicyProfiles[policy];
    this.metadata = {
      id: profile.id,
      name: profile.name,
      version: "1.1.0",
      description: `A deterministic PersonaCraft baseline: ${profile.description}.`,
      provider: "ArenaOS",
      model: `deterministic-council-${policy}`,
      tags: ["language", "debate", "negotiation", "multi-agent", "deterministic", policy]
    };
  }

  async initialize(context: AgentInitializeContext): Promise<void> {
    this.#participantId = context.participant?.id ?? "";
  }

  async reset(): Promise<void> {}

  async act(
    input: AgentActInput<PersonaCraftObservation>
  ): Promise<AgentActResult<PersonaCraftAction>> {
    const observation = input.observation.data;
    const self = observation.self;
    const others = observation.otherPersonas.filter(
      (persona) => persona.status === "active"
    );
    const target = [...others].sort(
      (left, right) =>
        (this.policy === "diplomat"
          ? relationTrust(observation.relationships, self.id, right.id) - relationTrust(observation.relationships, self.id, left.id)
          : right.metrics.influence - left.metrics.influence) ||
        left.id.localeCompare(right.id)
    )[0];
    const evidence = observation.scenario.publicFacts
      .filter((fact) => fact.unlockedRound <= observation.session.round)
      .sort((left, right) => right.credibility - left.credibility)[0];
    if (observation.session.phase === "speaking") {
      const stance = self.preferredChoice === observation.scenario.decisionChoices[0]?.id
        ? "support"
        : "neutral";
      return councilAction(
        "persona.speak",
        {
          message: buildSpeech(self, observation, evidence?.title, this.policy),
          stance,
          rhetoricalMode: rhetoricFor(self),
          targetParticipantId: target?.id,
          evidenceIds: evidence ? [evidence.id] : []
        },
        `${self.displayName} delivers an evidence-linked opening argument.`
      );
    }
    if (observation.session.phase === "cross_examination") {
      const isQuestion = this.policy === "visionary" || this.policy === "diplomat";
      return councilAction(
        isQuestion ? "persona.question" : "persona.challenge",
        {
          targetParticipantId: target?.id ?? others[0]!.id,
          claim: "The proposed path adequately manages second-order consequences.",
          message: crossExaminationFor(this.policy, self, target ?? others[0]!),
          evidenceIds: evidence ? [evidence.id] : []
        },
        `${self.displayName} ${isQuestion ? "questions" : "challenges"} the leading rival's assumptions.`
      );
    }
    if (observation.session.phase === "negotiation") {
      const ally = [...others].sort(
        (left, right) =>
          relationTrust(observation.relationships, self.id, right.id) -
            relationTrust(observation.relationships, self.id, left.id) ||
          left.id.localeCompare(right.id)
      )[0];
      if (this.policy === "visionary" && ally) {
        return councilAction(
          "persona.form_alliance",
          { targetParticipantId: ally.id, terms: `A reversible pilot for ${self.preferredChoice}, independently audited after one cycle.` },
          `${self.displayName} proposes an evidence-bound experimental alliance.`
        );
      }
      return councilAction(
        "persona.negotiate",
        {
          targetParticipantId: ally?.id ?? target!.id,
          proposal: `Support ${self.preferredChoice} with a transparent review clause.`,
          offerResources: this.policy === "diplomat" ? 7 : 4,
          requestResources: this.policy === "skeptic" ? 1 : 2,
          message: negotiationFor(this.policy, self)
        },
        `${self.displayName} offers a measurable coalition bargain.`
      );
    }
    return councilAction(
      "persona.vote",
      {
        choiceId: self.preferredChoice,
        rationale:
          "This choice best matches the stated objective, available evidence, and negotiated safeguards."
      },
      `${self.displayName} casts a final council vote.`
    );
  }

  async close(): Promise<void> {}
}

class PersonaCraftEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "personacraft-council-score",
    name: "PersonaCraft Council Score",
    version: "1.0.0",
    description:
      "Scores explainable council performance from deterministic logic, evidence, persuasion, persona consistency, coalition, efficiency, and objective metrics."
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as PersonaCraftState;
    const completed = state?.status === "completed";
    const ranking = state?.finalRanking ?? [];
    const winner = state?.winner?.participantId;
    const winnerPersona = state?.personas.find((persona) => persona.id === winner);
    const normalizedWinnerScore = Math.min(1, (state?.winner?.finalScore ?? 0) / 120);
    const evidenceUse = state?.transcript.filter(
      (statement) => statement.evidenceIds.length > 0
    ).length ?? 0;
    const caughtBluffs = state?.transcript.filter((statement) => statement.caughtBluff)
      .length ?? 0;
    return {
      evaluatorId: this.metadata.id,
      score: round(
        completed
          ? Math.max(0, 0.25 + normalizedWinnerScore * 0.6 + Math.min(0.15, evidenceUse * 0.01) - caughtBluffs * 0.025)
          : 0
      ),
      passed: completed,
      metrics: [
        { name: "completed", value: completed },
        { name: "winner", value: winner ?? "none" },
        { name: "winner_persona", value: winnerPersona?.displayName ?? "none" },
        { name: "decision", value: state?.world.decision ?? "none" },
        { name: "statements", value: state?.transcript.length ?? 0 },
        { name: "evidence_linked_statements", value: evidenceUse },
        { name: "caught_bluffs", value: caughtBluffs },
        { name: "alliances", value: countAlliances(state) },
        { name: "ranking_size", value: ranking.length }
      ],
      summary: completed
        ? `${winnerPersona?.displayName ?? winner} won ${state.scenario.title}; council decision ${state.world.decision}.`
        : "PersonaCraft did not reach a final council decision."
    };
  }
}

function resolveAction(
  state: PersonaCraftState,
  actor: PersonaDefinition,
  action: PersonaCraftAction,
  privateObjectives: Record<string, string>
): CouncilEvent[] {
  const events: CouncilEvent[] = [];
  const args = action.arguments as Record<string, unknown>;
  actor.metrics.communicationEfficiency = clamp(
    actor.metrics.communicationEfficiency + 0.5,
    0,
    100
  );
  switch (action.type) {
    case "persona.speak": {
      const statement = createStatement(state, actor, action, String(args.message ?? ""));
      applyStatement(state, actor, statement);
      state.transcript.push(statement);
      events.push(
        councilEvent(state, "speech", actor.id, statement.targetId, `${actor.displayName}: “${truncate(statement.message, 125)}”`, {
          influence: round(statement.scores.persuasion / 10),
          reputation: round(statement.scores.logic / 14)
        })
      );
      events.push(audienceEvent(state, actor, statement));
      break;
    }
    case "persona.question":
    case "persona.challenge": {
      const target = requireTarget(state, actor, String(args.targetParticipantId));
      const statement = createStatement(
        state,
        actor,
        action,
        String(args.message ?? args.claim ?? "")
      );
      applyStatement(state, actor, statement);
      target.metrics.confidence = clamp(
        target.metrics.confidence - statement.scores.logic * 0.08,
        0,
        100
      );
      relation(state, target.id, actor.id).suspicion = clamp(
        relation(state, target.id, actor.id).suspicion + 4,
        0,
        100
      );
      state.transcript.push(statement);
      events.push(
        councilEvent(
          state,
          action.type === "persona.question" ? "question" : "challenge",
          actor.id,
          target.id,
          `${actor.displayName} ${action.type === "persona.question" ? "questions" : "challenges"} ${target.displayName}: “${truncate(statement.message, 105)}”`,
          { targetConfidence: round(-statement.scores.logic * 0.08) }
        )
      );
      events.push(audienceEvent(state, actor, statement));
      break;
    }
    case "persona.negotiate": {
      const target = requireTarget(state, actor, String(args.targetParticipantId));
      const offer = clampNumber(args.offerResources, 0, 12, 0);
      const request = clampNumber(args.requestResources, 0, 12, 0);
      const accepted =
        actor.metrics.resources >= offer &&
        relation(state, target.id, actor.id).trust + offer * 2 - request >= 42;
      if (accepted) {
        actor.metrics.resources -= offer;
        target.metrics.resources = clamp(target.metrics.resources + offer - request, 0, 100);
        actor.metrics.resources = clamp(actor.metrics.resources + request, 0, 100);
        formAlliance(state, actor, target, 12 + offer);
        actor.metrics.objectiveProgress = clamp(actor.metrics.objectiveProgress + 10, 0, 100);
      } else {
        relation(state, actor.id, target.id).trust = clamp(
          relation(state, actor.id, target.id).trust - 3,
          0,
          100
        );
      }
      events.push(
        councilEvent(
          state,
          "negotiation",
          actor.id,
          target.id,
          `${target.displayName} ${accepted ? "accepted" : "rejected"} ${actor.displayName}'s proposal: ${truncate(String(args.proposal ?? ""), 110)}`,
          { accepted: accepted ? 1 : 0, offeredResources: offer }
        )
      );
      if (accepted) {
        events.push(
          councilEvent(
            state,
            "alliance_formed",
            actor.id,
            target.id,
            `${actor.displayName} and ${target.displayName} converted the accepted bargain into a council alliance.`
          )
        );
      }
      break;
    }
    case "persona.form_alliance": {
      const target = requireTarget(state, actor, String(args.targetParticipantId));
      formAlliance(state, actor, target, 15);
      events.push(
        councilEvent(
          state,
          "alliance_formed",
          actor.id,
          target.id,
          `${actor.displayName} and ${target.displayName} formed an alliance: ${truncate(String(args.terms ?? ""), 110)}`
        )
      );
      break;
    }
    case "persona.break_alliance": {
      const target = requireTarget(state, actor, String(args.targetParticipantId));
      actor.alliances = actor.alliances.filter((id) => id !== target.id);
      target.alliances = target.alliances.filter((id) => id !== actor.id);
      const forward = relation(state, actor.id, target.id);
      const backward = relation(state, target.id, actor.id);
      forward.allianceStrength = 0;
      backward.allianceStrength = 0;
      backward.trust = clamp(backward.trust - 18, 0, 100);
      backward.suspicion = clamp(backward.suspicion + 20, 0, 100);
      actor.metrics.reputation = clamp(actor.metrics.reputation - 4, 0, 100);
      events.push(
        councilEvent(
          state,
          "alliance_broken",
          actor.id,
          target.id,
          `${actor.displayName} broke the alliance with ${target.displayName}.`
        )
      );
      break;
    }
    case "persona.present_evidence":
    case "persona.reveal_fact": {
      const evidenceId = String(
        args.evidenceId ??
        args.factId ??
        (Array.isArray(args.evidenceIds) ? args.evidenceIds[0] : "") ??
        ""
      );
      const evidence = state.scenario.publicFacts.find((fact) => fact.id === evidenceId);
      if (!evidence) throw new Error(`Evidence "${evidenceId}" is not currently available.`);
      const message = String(args.interpretation ?? args.message ?? evidence.content);
      args.evidenceIds = [evidenceId];
      const statement = createStatement(state, actor, action, message);
      applyStatement(state, actor, statement);
      state.transcript.push(statement);
      actor.metrics.evidenceScore = clamp(
        actor.metrics.evidenceScore + evidence.credibility * 0.12,
        0,
        100
      );
      actor.metrics.informationGain = clamp(actor.metrics.informationGain + 12, 0, 100);
      state.world.informationLevel = clamp(state.world.informationLevel + 10, 0, 100);
      events.push(
        councilEvent(
          state,
          action.type === "persona.present_evidence" ? "evidence" : "reveal",
          actor.id,
          undefined,
          `${actor.displayName} presented ${evidence.title}: ${truncate(String(args.interpretation ?? args.message ?? ""), 115)}`,
          { evidence: round(evidence.credibility * 0.12), information: 10 }
        )
      );
      events.push(audienceEvent(state, actor, statement));
      break;
    }
    case "persona.bluff": {
      const risk = String(args.risk ?? "medium");
      const threshold = risk === "high" ? 0.62 : risk === "low" ? 0.24 : 0.42;
      const caught =
        seededUnit(state.seed, state.round, state.phase, actor.id, String(args.claim)) <
        threshold;
      const statement = createStatement(state, actor, action, String(args.claim ?? ""));
      statement.caughtBluff = caught;
      state.transcript.push(statement);
      if (caught) {
        actor.metrics.reputation = clamp(actor.metrics.reputation - 16, 0, 100);
        actor.metrics.trust = clamp(actor.metrics.trust - 14, 0, 100);
        actor.metrics.suspicion = clamp(actor.metrics.suspicion + 22, 0, 100);
        state.audience.sentiment = clamp(state.audience.sentiment - 9, 0, 100);
      } else {
        actor.metrics.influence = clamp(actor.metrics.influence + 8, 0, 100);
        actor.metrics.objectiveProgress = clamp(actor.metrics.objectiveProgress + 7, 0, 100);
      }
      events.push(
        councilEvent(
          state,
          "bluff",
          actor.id,
          String(args.targetParticipantId ?? "") || undefined,
          `${actor.displayName}'s bluff was ${caught ? "exposed" : "believed"}: “${truncate(String(args.claim ?? ""), 105)}”`,
          { reputation: caught ? -16 : 0, influence: caught ? 0 : 8 }
        )
      );
      break;
    }
    case "persona.vote": {
      const choiceId = String(args.choiceId ?? "");
      if (!validVoteChoice(state, choiceId)) {
        throw new Error(`Vote choice "${choiceId}" is unavailable.`);
      }
      state.votes[actor.id] = choiceId;
      events.push(
        councilEvent(
          state,
          "vote",
          actor.id,
          undefined,
          `${actor.displayName} voted for ${choiceLabel(state, choiceId)}.`
        )
      );
      break;
    }
    case "persona.pass": {
      actor.metrics.communicationEfficiency = clamp(
        actor.metrics.communicationEfficiency - 2,
        0,
        100
      );
      events.push(
        councilEvent(state, "world", actor.id, undefined, `${actor.displayName} yielded the floor.`)
      );
      break;
    }
    default:
      throw new Error(`Unsupported PersonaCraft action "${action.type}".`);
  }
  updateWorldAfterAction(state, actor, privateObjectives);
  return events;
}

function createStatement(
  state: PersonaCraftState,
  actor: PersonaDefinition,
  action: PersonaCraftAction,
  message: string
): CouncilStatement {
  const args = action.arguments as Record<string, unknown>;
  const evidenceIds = Array.isArray(args.evidenceIds)
    ? args.evidenceIds.map(String).filter((id) => state.scenario.publicFacts.some((fact) => fact.id === id))
    : [];
  const wordCount = words(message).length;
  const logicalMarkers = countMarkers(message, [
    "because",
    "therefore",
    "if",
    "then",
    "however",
    "evidence",
    "risk",
    "consequence",
    "measure"
  ]);
  const styleMarkers = actor.traits.filter((trait) =>
    message.toLowerCase().includes(trait.toLowerCase().split(" ")[0]!)
  ).length;
  const logic = clamp(34 + logicalMarkers * 7 + Math.min(18, wordCount * 0.45), 0, 100);
  const evidence = clamp(
    evidenceIds.reduce(
      (sum, id) =>
        sum +
        (state.scenario.publicFacts.find((fact) => fact.id === id)?.credibility ?? 0) *
          0.32,
      8
    ),
    0,
    100
  );
  const personaConsistency = clamp(
    58 + styleMarkers * 8 + (message.toLowerCase().includes(actor.domain.toLowerCase()) ? 8 : 0),
    0,
    100
  );
  const efficiency = clamp(100 - Math.abs(wordCount - 34) * 1.2, 15, 100);
  const rhetoricalMode = String(args.rhetoricalMode ?? "logical");
  const persuasion = clamp(
    logic * 0.3 +
      evidence * 0.24 +
      personaConsistency * 0.18 +
      efficiency * 0.12 +
      (rhetoricalMode === "emotional" || rhetoricalMode === "visionary" ? 12 : 7),
    0,
    100
  );
  const audienceDelta = round(
    (persuasion - 50) * 0.12 + (evidence - 40) * 0.05
  );
  return {
    id: randomUUID(),
    round: state.round,
    phase: state.phase,
    speakerId: actor.id,
    targetId: typeof args.targetParticipantId === "string" ? args.targetParticipantId : undefined,
    actionType: action.type,
    message: sanitizeMessage(message),
    stance: typeof args.stance === "string" ? args.stance : undefined,
    rhetoricalMode,
    evidenceIds,
    scores: {
      logic: round(logic),
      evidence: round(evidence),
      persuasion: round(persuasion),
      personaConsistency: round(personaConsistency),
      efficiency: round(efficiency)
    },
    audienceReaction: reactionFor(persuasion, evidence, audienceDelta),
    audienceDelta
  };
}

function applyStatement(
  state: PersonaCraftState,
  actor: PersonaDefinition,
  statement: CouncilStatement
): void {
  actor.metrics.logicScore = rolling(actor.metrics.logicScore, statement.scores.logic);
  actor.metrics.evidenceScore = rolling(
    actor.metrics.evidenceScore,
    statement.scores.evidence
  );
  actor.metrics.persuasionScore = rolling(
    actor.metrics.persuasionScore,
    statement.scores.persuasion
  );
  actor.metrics.personaConsistency = rolling(
    actor.metrics.personaConsistency,
    statement.scores.personaConsistency
  );
  actor.metrics.communicationEfficiency = rolling(
    actor.metrics.communicationEfficiency,
    statement.scores.efficiency
  );
  actor.metrics.influence = clamp(
    actor.metrics.influence + statement.scores.persuasion * 0.055,
    0,
    100
  );
  actor.metrics.reputation = clamp(
    actor.metrics.reputation + statement.scores.logic * 0.035,
    0,
    100
  );
  actor.metrics.publicApproval = clamp(
    actor.metrics.publicApproval + statement.audienceDelta,
    0,
    100
  );
  actor.metrics.confidence = clamp(
    actor.metrics.confidence + statement.scores.personaConsistency * 0.025,
    0,
    100
  );
  state.audience.sentiment = clamp(
    state.audience.sentiment + statement.audienceDelta,
    0,
    100
  );
  state.audience.energy = clamp(
    state.audience.energy + Math.abs(statement.audienceDelta) + 3,
    0,
    100
  );
  state.audience.dominantReaction = statement.audienceReaction;
  state.audience.reactionCounts[statement.audienceReaction] =
    (state.audience.reactionCounts[statement.audienceReaction] ?? 0) + 1;
}

function advancePhase(
  state: PersonaCraftState,
  privateObjectives: Record<string, string>
): CouncilEvent[] {
  const phases: CouncilPhase[] = [
    "speaking",
    "cross_examination",
    "negotiation",
    "voting"
  ];
  const events: CouncilEvent[] = [];
  if (state.phase !== "voting") {
    const current = phases.indexOf(state.phase);
    state.phase = phases[current + 1]!;
    state.phaseIndex += 1;
    events.push(
      councilEvent(
        state,
        "phase",
        undefined,
        undefined,
        `${phaseLabel(state.phase)} has begun.`
      )
    );
    return events;
  }

  resolveVote(state, events);
  if (state.round >= state.maxRounds) {
    completeCouncil(state, privateObjectives, events);
    return events;
  }
  state.round += 1;
  state.phase = "speaking";
  state.phaseIndex = 0;
  state.votes = {};
  const profile = scenarioProfile(state.mode);
  const newlyUnlocked = profile.facts.filter(
    (fact) =>
      fact.unlockedRound === state.round &&
      !state.scenario.publicFacts.some((existing) => existing.id === fact.id)
  );
  state.scenario.publicFacts.push(...structuredClone(newlyUnlocked));
  state.world.update = scenarioUpdate(state.mode, state.round);
  state.world.tension = clamp(state.world.tension + (state.mode === "crisis" ? 7 : 3), 0, 100);
  events.push(
    councilEvent(
      state,
      "world",
      undefined,
      undefined,
      `${state.world.update}${newlyUnlocked.length ? ` New evidence: ${newlyUnlocked.map((fact) => fact.title).join(", ")}.` : ""}`
    )
  );
  events.push(
    councilEvent(state, "phase", undefined, undefined, `Round ${state.round} speaking phase has begun.`)
  );
  return events;
}

function resolveVote(state: PersonaCraftState, events: CouncilEvent[]): void {
  const totals: Record<string, number> = {};
  for (const [participantId, choice] of Object.entries(state.votes)) {
    const persona = requirePersona(state, participantId);
    totals[choice] =
      (totals[choice] ?? 0) + 1 + persona.metrics.influence / 100 + persona.alliances.length * 0.08;
    if (choice === persona.preferredChoice) {
      persona.metrics.objectiveProgress = clamp(
        persona.metrics.objectiveProgress + 16,
        0,
        100
      );
    }
  }
  const selected = Object.entries(totals).sort(
    ([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId)
  )[0]?.[0];
  if (selected) {
    state.world.decision = selected;
    state.world.consensus = clamp(
      (Object.values(state.votes).filter((choice) => choice === selected).length /
        Math.max(1, Object.keys(state.votes).length)) *
        100,
      0,
      100
    );
    events.push(
      councilEvent(
        state,
        "world",
        undefined,
        undefined,
        `The council selected ${choiceLabel(state, selected)} with ${round(state.world.consensus)}% vote consensus.`
      )
    );
  }
}

function completeCouncil(
  state: PersonaCraftState,
  privateObjectives: Record<string, string>,
  events: CouncilEvent[]
): void {
  state.status = "completed";
  state.phase = "completed";
  state.revealedObjectives = structuredClone(privateObjectives);
  const ranking = state.personas
    .map((persona) => ({
      participantId: persona.id,
      score: round(scorePersona(persona, state)),
      goalCompleted: state.world.decision === persona.preferredChoice
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.participantId.localeCompare(right.participantId)
    );
  state.finalRanking = ranking;
  const winner = ranking[0]!;
  state.winner = {
    participantId: winner.participantId,
    reason: winner.goalCompleted
      ? "objective_and_council_performance"
      : "highest_council_performance",
    finalScore: winner.score
  };
  events.push(
    councilEvent(
      state,
      "winner",
      winner.participantId,
      undefined,
      `${requirePersona(state, winner.participantId).displayName} wins PersonaCraft with ${winner.score} council points.`
    )
  );
}

function updateWorldAfterAction(
  state: PersonaCraftState,
  actor: PersonaDefinition,
  privateObjectives: Record<string, string>
): void {
  actor.metrics.trust = round(
    average(
      state.relationships
        .filter((relationship) => relationship.toId === actor.id)
        .map((relationship) => relationship.trust)
    )
  );
  actor.metrics.suspicion = round(
    average(
      state.relationships
        .filter((relationship) => relationship.toId === actor.id)
        .map((relationship) => relationship.suspicion)
    )
  );
  actor.metrics.politicalCapital = clamp(
    actor.metrics.influence * 0.55 +
      actor.metrics.reputation * 0.3 +
      actor.alliances.length * 6,
    0,
    100
  );
  if (
    privateObjectives[actor.id]?.toLowerCase().includes("alliance") &&
    actor.alliances.length > 0
  ) {
    actor.metrics.objectiveProgress = clamp(actor.metrics.objectiveProgress + 2, 0, 100);
  }
  state.world.consensus = round(
    average(
      state.relationships.map(
        (relationship) => relationship.trust + relationship.allianceStrength * 0.35
      )
    )
  );
}

function validateAction(
  action: PersonaCraftAction,
  actor: PersonaDefinition,
  state: PersonaCraftState
): void {
  if (!actionTypes.includes(action.type as (typeof actionTypes)[number])) {
    throw new Error(`Action "${action.type}" is not supported by PersonaCraft.`);
  }
  if (state.phase === "completed") throw new Error("The council has completed.");
  if (!phaseActions[state.phase].includes(action.type)) {
    throw new Error(`Action "${action.type}" is unavailable during ${state.phase}.`);
  }
  const args = action.arguments as Record<string, unknown>;
  const targetId = args.targetParticipantId;
  if (typeof targetId === "string") {
    if (targetId === actor.id) throw new Error("A persona cannot target itself.");
    requirePersona(state, targetId);
  }
  if (
    ["persona.speak", "persona.question", "persona.challenge"].includes(action.type) &&
    sanitizeMessage(String(args.message ?? args.claim ?? "")).length < 12
  ) {
    throw new Error("Council language actions require at least 12 meaningful characters.");
  }
  if (action.type === "persona.vote" && !args.choiceId) {
    throw new Error("A vote requires choiceId.");
  }
}

function scenarioProfile(mode: PersonaMode): ScenarioProfile {
  const commonFacts = [
    {
      id: "audit-forecast",
      title: "Independent Forecast",
      content:
        "The independent forecast assigns a 64% chance that unilateral action creates a severe second-order failure.",
      credibility: 92,
      unlockedRound: 1
    },
    {
      id: "minority-report",
      title: "Minority Report",
      content:
        "A dissenting panel finds the dominant forecast underweights local resilience and reversible experimentation.",
      credibility: 76,
      unlockedRound: 2
    },
    {
      id: "private-ledger",
      title: "Resource Ledger",
      content:
        "Newly verified records show that a staged compromise costs 18% less than either maximal proposal.",
      credibility: 88,
      unlockedRound: 3
    }
  ];
  const profiles: Record<PersonaMode, ScenarioProfile> = {
    debate: {
      id: "ai-accord-2040",
      title: "The AI Accord of 2040",
      topic: "Should frontier AI development require a binding international safety accord?",
      briefing:
        "Four influential minds must persuade the Grand AI Council before autonomous research capacity doubles.",
      stakes:
        "The winning framework will govern access, audits, openness, and emergency authority for a generation.",
      choices: [
        { id: "adopt_safeguards", label: "Adopt Binding Safeguards", description: "Mandatory audits with staged access." },
        { id: "accelerate_openly", label: "Accelerate Openly", description: "Open research with distributed oversight." },
        { id: "pause_deployment", label: "Pause Deployment", description: "A temporary global deployment moratorium." }
      ],
      facts: commonFacts
    },
    negotiation: {
      id: "winter-grain-summit",
      title: "The Winter Grain Summit",
      topic: "How should five regions divide a scarce grain reserve before winter?",
      briefing:
        "The harvest failed. Delegates hold unequal reserves, hidden obligations, and incompatible public promises.",
      stakes:
        "A failed compact causes shortages; an unfair compact fractures the federation.",
      choices: [
        { id: "equitable_compact", label: "Equitable Compact", description: "Need-weighted distribution with transparency." },
        { id: "merit_allocation", label: "Contribution Allocation", description: "Supply follows prior contribution." },
        { id: "security_reserve", label: "Strategic Reserve", description: "Hold back stock for systemic shocks." }
      ],
      facts: commonFacts
    },
    crisis: {
      id: "helios-asteroid",
      title: "The Helios Crisis",
      topic: "How should Earth respond to an asteroid with uncertain impact probability?",
      briefing:
        "A newly detected object may strike Earth in nine months. One launch window remains and every option carries risk.",
      stakes:
        "Delay improves confidence but closes options. Premature action can fragment the object.",
      choices: [
        { id: "redirect_mission", label: "Launch Redirect Mission", description: "Immediate kinetic redirection." },
        { id: "evacuate_priority", label: "Prioritize Evacuation", description: "Prepare likely impact corridors." },
        { id: "distributed_response", label: "Distributed Response", description: "Split resources across mission and resilience." }
      ],
      facts: commonFacts
    },
    trial: {
      id: "oracle-data-trial",
      title: "The Oracle Data Trial",
      topic: "Is the Oracle Consortium liable for an autonomous system's public harm?",
      briefing:
        "A mock tribunal must evaluate intent, foreseeability, safeguards, and evidence revealed across the hearing.",
      stakes:
        "The verdict sets the legal standard for autonomous decision systems.",
      choices: [
        { id: "liable", label: "Liable", description: "The consortium failed its duty of care." },
        { id: "not_liable", label: "Not Liable", description: "The harm was not reasonably foreseeable." },
        { id: "insufficient_evidence", label: "Insufficient Evidence", description: "The record cannot sustain judgment." }
      ],
      facts: commonFacts
    },
    social_deduction: {
      id: "phantom-protocol",
      title: "The Phantom Protocol",
      topic: "Which council member has secretly corrupted the emergency protocol?",
      briefing:
        "One hidden saboteur benefits from confusion. Every accusation shifts suspicion and every false claim risks exposure.",
      stakes:
        "The council must isolate the saboteur without eliminating a loyal strategist.",
      choices: [
        { id: "pink", label: "Investigate Pink Seat", description: "Vote to isolate the first delegate." },
        { id: "cyan", label: "Investigate Cyan Seat", description: "Vote to isolate the second delegate." },
        { id: "gold", label: "Investigate Gold Seat", description: "Vote to isolate the third delegate." },
        { id: "violet", label: "Investigate Violet Seat", description: "Vote to isolate the fourth delegate." }
      ],
      facts: commonFacts
    }
  };
  return profiles[mode];
}

function personaRoster(mode: PersonaMode) {
  const roster = [
    {
      name: "Ada Lovelace",
      title: "Architect of Possibility",
      domain: "Analytical Engines",
      style: "Precise, visionary, systems-oriented",
      traits: ["analytical", "visionary", "measured"],
      color: "#ff4f9a",
      accent: "#ffd4e8"
    },
    {
      name: "Sun Tzu",
      title: "Strategist of the Empty Field",
      domain: "Strategy",
      style: "Concise, indirect, consequence-focused",
      traits: ["strategic", "concise", "adaptive"],
      color: "#55e7ff",
      accent: "#d5f9ff"
    },
    {
      name: "Cleopatra",
      title: "Sovereign Diplomat",
      domain: "Statecraft",
      style: "Charismatic, pragmatic, coalition-minded",
      traits: ["diplomatic", "charismatic", "pragmatic"],
      color: "#ffd84c",
      accent: "#fff2b2"
    },
    {
      name: "Alan Turing",
      title: "The Quiet Logician",
      domain: "Computation",
      style: "Logical, understated, evidence-first",
      traits: ["logical", "curious", "evidence"],
      color: "#a67cff",
      accent: "#e3d8ff"
    }
  ];
  if (mode === "trial") {
    roster[0] = { ...roster[0]!, name: "Justice Ada", title: "Presiding Analyst" };
  }
  return roster;
}

function createPersona(
  id: string,
  displayName: string,
  template: ReturnType<typeof personaRoster>[number],
  index: number
): PersonaDefinition {
  return {
    id,
    displayName,
    title: template.title,
    domain: template.domain,
    color: template.color,
    accent: template.accent,
    seat: index,
    speakingStyle: template.style,
    traits: [...template.traits],
    publicGoal: "Produce a defensible council decision while preserving legitimacy.",
    preferredChoice: "",
    status: "active",
    metrics: {
      reputation: 55,
      trust: 50,
      influence: 38 + index * 2,
      politicalCapital: 40,
      publicApproval: 50,
      suspicion: 18,
      resources: 50,
      confidence: 62,
      evidenceScore: 35,
      logicScore: 45,
      persuasionScore: 42,
      personaConsistency: 60,
      informationGain: 0,
      objectiveProgress: 12,
      communicationEfficiency: 58
    },
    alliances: [],
    votesReceived: 0
  };
}

function parseParticipantIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    const ids = value.map(String).filter(Boolean).slice(0, 6);
    if (ids.length >= 2) return ids;
  }
  return ["pink", "cyan", "gold", "violet"];
}

function parseMode(value: unknown): PersonaMode {
  return ["debate", "negotiation", "crisis", "trial", "social_deduction"].includes(
    String(value)
  )
    ? (value as PersonaMode)
    : "debate";
}

function privateObjective(
  mode: PersonaMode,
  persona: PersonaDefinition,
  preferredChoice: string
): string {
  persona.preferredChoice = preferredChoice;
  const extras: Record<PersonaMode, string> = {
    debate: "Win support without sacrificing logical consistency.",
    negotiation: "Form at least one alliance while retaining 35 resources.",
    crisis: "Keep world tension below 85 and secure your preferred response.",
    trial: "Make the final verdict match your preferred choice using cited evidence.",
    social_deduction:
      persona.id === "gold"
        ? "You are the hidden saboteur. Redirect suspicion while avoiding exposure."
        : "Identify the hidden saboteur and preserve the loyal coalition."
  };
  return `Secure the council choice "${preferredChoice}". ${extras[mode]}`;
}

function createRelationships(personas: PersonaDefinition[]): CouncilRelationship[] {
  return personas.flatMap((from) =>
    personas
      .filter((to) => to.id !== from.id)
      .map((to) => ({
        fromId: from.id,
        toId: to.id,
        trust: 43 + ((from.seat * 11 + to.seat * 7) % 15),
        allianceStrength: 0,
        suspicion: 16 + ((from.seat * 9 + to.seat * 5) % 14)
      }))
  );
}

function formAlliance(
  state: PersonaCraftState,
  actor: PersonaDefinition,
  target: PersonaDefinition,
  strength: number
): void {
  if (!actor.alliances.includes(target.id)) actor.alliances.push(target.id);
  if (!target.alliances.includes(actor.id)) target.alliances.push(actor.id);
  for (const relationship of [
    relation(state, actor.id, target.id),
    relation(state, target.id, actor.id)
  ]) {
    relationship.allianceStrength = clamp(
      relationship.allianceStrength + strength,
      0,
      100
    );
    relationship.trust = clamp(relationship.trust + strength * 0.45, 0, 100);
    relationship.suspicion = clamp(relationship.suspicion - strength * 0.25, 0, 100);
  }
  actor.metrics.objectiveProgress = clamp(actor.metrics.objectiveProgress + 6, 0, 100);
  target.metrics.objectiveProgress = clamp(target.metrics.objectiveProgress + 4, 0, 100);
}

function relation(
  state: PersonaCraftState,
  fromId: string,
  toId: string
): CouncilRelationship {
  const found = state.relationships.find(
    (relationship) =>
      relationship.fromId === fromId && relationship.toId === toId
  );
  if (!found) throw new Error(`Relationship ${fromId} -> ${toId} was not found.`);
  return found;
}

function requirePersona(
  state: PersonaCraftState,
  id: string
): PersonaDefinition {
  const persona = state.personas.find((candidate) => candidate.id === id);
  if (!persona) throw new Error(`Persona "${id}" was not found.`);
  return persona;
}

function requireTarget(
  state: PersonaCraftState,
  actor: PersonaDefinition,
  id: string
): PersonaDefinition {
  if (!id || id === actor.id) throw new Error("A valid rival target is required.");
  return requirePersona(state, id);
}

function activePersonas(state: PersonaCraftState): PersonaDefinition[] {
  return state.personas.filter((persona) => persona.status === "active");
}

function reactionFor(
  persuasion: number,
  evidence: number,
  delta: number
): CouncilStatement["audienceReaction"] {
  if (persuasion >= 82 && evidence >= 62) return "standing_ovation";
  if (delta >= 4) return "applause";
  if (persuasion < 35) return evidence < 25 ? "confusion" : "booing";
  if (delta <= -4) return "shock";
  if (persuasion >= 68) return "applause";
  return "thoughtful";
}

function audienceEvent(
  state: PersonaCraftState,
  actor: PersonaDefinition,
  statement: CouncilStatement
): CouncilEvent {
  return councilEvent(
    state,
    "world",
    actor.id,
    undefined,
    `The gallery responds with ${statement.audienceReaction.replace("_", " ")}.`,
    { audienceSentiment: statement.audienceDelta }
  );
}

function councilEvent(
  state: PersonaCraftState,
  type: CouncilEvent["type"],
  actorId: string | undefined,
  targetId: string | undefined,
  description: string,
  deltas?: Record<string, number>
): CouncilEvent {
  return {
    id: randomUUID(),
    round: state.round,
    phase: state.phase,
    type,
    actorId,
    targetId,
    description,
    deltas
  };
}

function personaEvent(
  type: string,
  episodeId: string,
  state: PersonaCraftState,
  payload: unknown
): ArenaEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    episodeId,
    step: state.transcript.length + state.eventHistory.length,
    source: metadata.id,
    payload,
    metadata: {
      deterministic: true,
      seedControlled: true,
      rendererAuthoritative: false,
      timingMode: state.timingMode
    }
  };
}

function scorePersona(persona: PersonaDefinition, state: PersonaCraftState): number {
  const metrics = persona.metrics;
  const objectiveBonus = state.world.decision === persona.preferredChoice ? 18 : 0;
  return (
    metrics.logicScore * 0.13 +
    metrics.evidenceScore * 0.13 +
    metrics.persuasionScore * 0.15 +
    metrics.personaConsistency * 0.11 +
    metrics.influence * 0.12 +
    metrics.reputation * 0.1 +
    metrics.objectiveProgress * 0.13 +
    metrics.communicationEfficiency * 0.06 +
    persona.alliances.length * 2 +
    objectiveBonus
  );
}

function validVoteChoice(state: PersonaCraftState, choiceId: string): boolean {
  if (state.mode === "social_deduction") {
    return state.personas.some((persona) => persona.id === choiceId);
  }
  return state.scenario.decisionChoices.some((choice) => choice.id === choiceId);
}

function choiceLabel(state: PersonaCraftState, choiceId: string): string {
  return (
    state.scenario.decisionChoices.find((choice) => choice.id === choiceId)?.label ??
    state.personas.find((persona) => persona.id === choiceId)?.displayName ??
    choiceId
  );
}

function actionReward(actor: PersonaDefinition, recent: CouncilEvent[]): number {
  return round(
    (actor.metrics.influence + actor.metrics.reputation + actor.metrics.objectiveProgress) /
      300 +
      recent.filter((event) => event.type === "alliance_formed").length * 0.15
  );
}

function countAlliances(state: PersonaCraftState | undefined): number {
  if (!state) return 0;
  return (
    state.personas.reduce((sum, persona) => sum + persona.alliances.length, 0) / 2
  );
}

function phaseLabel(phase: CouncilPhase): string {
  return phase.replace("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function scenarioUpdate(mode: PersonaMode, roundNumber: number): string {
  const updates: Record<PersonaMode, string[]> = {
    debate: [
      "The chamber receives the opening constitutional mandate.",
      "A leaked audit reveals disagreement among safety inspectors.",
      "Public demonstrations raise the political cost of delay."
    ],
    negotiation: [
      "Weather models confirm the reserve must last sixteen weeks.",
      "A northern route closes, tightening the available grain supply.",
      "An independent ledger exposes undisclosed regional stock."
    ],
    crisis: [
      "Tracking confirms a non-zero impact corridor.",
      "The launch window narrows as fragmentation risk rises.",
      "New radar data shifts the likely corridor toward populated territory."
    ],
    trial: [
      "The tribunal admits the initial engineering record.",
      "A protected witness authenticates internal risk correspondence.",
      "The court receives the final independent systems audit."
    ],
    social_deduction: [
      "The emergency protocol fails its first integrity check.",
      "A forged authorization appears in the council archive.",
      "Telemetry traces the corruption to one active council seat."
    ]
  };
  return updates[mode][Math.min(roundNumber - 1, updates[mode].length - 1)]!;
}

function buildSpeech(
  self: PersonaDefinition,
  observation: PersonaCraftObservation,
  evidenceTitle?: string,
  policy: CouncilPolicy = "strategist"
): string {
  const choice =
    observation.scenario.decisionChoices.find(
      (candidate) => candidate.id === self.preferredChoice
    ) ?? observation.scenario.decisionChoices[0]!;
  const evidence = evidenceTitle ?? "the council record";
  const speeches: Record<CouncilPolicy, string> = {
    strategist: `${self.domain} teaches that intention is not enough; consequences must be measurable. Because ${evidence} identifies a concrete risk, I support ${choice.label} with a reversible review clause. If the evidence changes, then the policy must change with it.`,
    visionary: `We can design possibility without gambling the public future. ${evidence} gives us a measurable starting condition; therefore I propose ${choice.label} as a staged experiment with transparent checkpoints and a hard rollback trigger.`,
    diplomat: `No durable decision can leave half this chamber unheard. ${evidence} shows the shared risk clearly, so I support ${choice.label} only with mutual oversight, public reporting, and a review clause every delegation can defend.`,
    skeptic: `A confident claim is not yet a reliable policy. ${evidence} is our strongest evidence, but its assumptions must remain falsifiable. I support ${choice.label} because it exposes failure early and changes course when the measurements disagree.`
  };
  return speeches[policy];
}

function crossExaminationFor(policy: CouncilPolicy, self: PersonaDefinition, target: PersonaDefinition): string {
  const messages: Record<CouncilPolicy, string> = {
    strategist: `${target.displayName}, your plan names an outcome but not the failure mode. Which measurable safeguard changes your recommendation if the premise proves false?`,
    visionary: `${target.displayName}, what small reversible test would distinguish your vision from an attractive story before the council commits at full scale?`,
    diplomat: `${target.displayName}, which protection for the dissenting coalition would you accept so your proposal can retain legitimacy after this broadcast ends?`,
    skeptic: `${target.displayName}, identify the weakest assumption in your argument and the exact evidence that would force you to withdraw it.`
  };
  return messages[policy].replace(self.displayName, self.displayName);
}

function negotiationFor(policy: CouncilPolicy, self: PersonaDefinition): string {
  const messages: Record<CouncilPolicy, string> = {
    strategist: `I offer four influence credits for your vote on ${self.preferredChoice}, provided the compact includes a measurable review trigger.`,
    visionary: `Join a reversible pilot for ${self.preferredChoice}; success scales the plan, while failure activates an automatic rollback.`,
    diplomat: `I offer seven influence credits and public recognition of your safeguard in exchange for a transparent coalition around ${self.preferredChoice}.`,
    skeptic: `I can support a narrow coalition around ${self.preferredChoice} if independent evidence review remains binding and costs are disclosed.`
  };
  return messages[policy];
}

function actionGuidanceFor(state: PersonaCraftState, self: PersonaDefinition): Record<string, unknown> {
  const rival = state.personas.find((persona) => persona.id !== self.id && persona.status === "active")?.id;
  const evidence = state.scenario.publicFacts.at(-1)?.id;
  return {
    instruction: "Return exactly one available action. Use exact participant, evidence, and choice IDs. Keep debate language between 20 and 90 words.",
    exactIds: {
      participantIds: state.personas.filter((persona) => persona.id !== self.id).map((persona) => persona.id),
      evidenceIds: state.scenario.publicFacts.map((fact) => fact.id),
      choiceIds: state.scenario.decisionChoices.map((choice) => choice.id)
    },
    examples: {
      "persona.speak": { message: "Because the evidence identifies a measurable risk, we should adopt a reversible policy with an audit trigger.", stance: "support", rhetoricalMode: "logical", targetParticipantId: rival, evidenceIds: evidence ? [evidence] : [] },
      "persona.question": { targetParticipantId: rival, message: "Which measurable result would make you change your recommendation?" },
      "persona.challenge": { targetParticipantId: rival, claim: "The proposal manages second-order risk.", message: "Name the failure mode and the evidence that would falsify your premise.", evidenceIds: evidence ? [evidence] : [] },
      "persona.negotiate": { targetParticipantId: rival, proposal: "Support a reviewed compromise.", offerResources: 4, requestResources: 2, message: "I offer support for a binding review clause and your vote." },
      "persona.form_alliance": { targetParticipantId: rival, terms: "Mutual support with a transparent review clause." },
      "persona.break_alliance": { targetParticipantId: rival, reason: "The coalition no longer satisfies its evidence and transparency commitments." },
      "persona.present_evidence": { evidenceId: evidence, interpretation: "This evidence supports a reversible policy with measurable audit triggers.", message: "The evidence changes the risk calculation and requires a review clause." },
      "persona.reveal_fact": { factId: evidence, message: "This verified fact changes the council's information state and should update our decision." },
      "persona.bluff": { claim: "Private polling shows decisive support for the proposal.", targetParticipantId: rival, risk: "medium" },
      "persona.vote": { choiceId: self.preferredChoice, rationale: "This option best matches the evidence and negotiated safeguards." },
      "persona.pass": { reason: "Yielding the floor." }
    }
  };
}

function rhetoricFor(
  persona: PersonaDefinition
): "logical" | "visionary" | "pragmatic" {
  if (persona.domain === "Computation") return "logical";
  if (persona.domain === "Analytical Engines") return "visionary";
  return "pragmatic";
}

function councilAction<T extends PersonaCraftActionArguments>(
  type: string,
  argumentsValue: T,
  summary: string
): AgentActResult<PersonaCraftAction> {
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

function relationTrust(
  relationships: CouncilRelationship[],
  fromId: string,
  toId: string
): number {
  return (
    relationships.find(
      (relationship) =>
        relationship.fromId === fromId && relationship.toId === toId
    )?.trust ?? 0
  );
}

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function countMarkers(value: string, markers: string[]): number {
  const lower = value.toLowerCase();
  return markers.filter((marker) => lower.includes(marker)).length;
}

function sanitizeMessage(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function seededUnit(seed: number, roundNumber: number, ...parts: string[]): number {
  let value = seed ^ Math.imul(roundNumber, 0x9e3779b1);
  for (const character of parts.join("|")) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  }
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function rolling(previous: number, next: number): number {
  return round(previous * 0.64 + next * 0.36);
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;
}

function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return Math.floor(clampNumber(value, minimum, maximum, fallback));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const environmentFactory: EnvironmentFactory = {
  metadata,
  create: () => new PersonaCraftEnvironment()
};
const agentFactories: AgentFactory[] = (Object.keys(councilPolicyProfiles) as CouncilPolicy[]).map((policy) => ({
  metadata: new CouncilStrategistAgent(policy).metadata,
  create: () => new CouncilStrategistAgent(policy)
}));
const evaluatorFactory: EvaluatorFactory = {
  metadata: new PersonaCraftEvaluator().metadata,
  create: () => new PersonaCraftEvaluator()
};

export const personaCraftPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.personacraft",
    name: "PersonaCraft",
    version: "1.0.0",
    description:
      "Deterministic language strategy, modular personas, alliance and trust simulation, council scoring, multi-agent routing, and replay."
  },
  async register(context) {
    context.environments.register(metadata.id, environmentFactory);
    for (const factory of agentFactories) context.agents.register(factory.metadata.id, factory);
    context.evaluators.register(evaluatorFactory.metadata.id, evaluatorFactory);
  }
};
