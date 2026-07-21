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

export type RumbleMode = "duel" | "team_battle" | "royal_rumble";
export type FighterArchetype = "balanced" | "heavy" | "agile";
export type FighterStateName =
  | "idle"
  | "moving"
  | "attacking"
  | "guarding"
  | "dodging"
  | "staggered"
  | "grappling"
  | "eliminated";

export type RumbleFighter = {
  id: string;
  displayName: string;
  teamId?: string;
  archetype: FighterArchetype;
  color: string;
  position: { x: number; y: number; z: number };
  facing: { x: number; z: number };
  health: number;
  maxHealth: number;
  stamina: number;
  abilityCharge: number;
  knockback: number;
  state: FighterStateName;
  currentAction?: string;
  targetFighterId?: string;
  eliminatedAtRound?: number;
  placement?: number;
  statusEffects: string[];
  stats: {
    damageDealt: number;
    damageTaken: number;
    hitsLanded: number;
    attacksAttempted: number;
    guards: number;
    dodges: number;
    grapples: number;
    ringOuts: number;
    distanceMoved: number;
  };
};

export type RumbleCombatEvent = {
  id: string;
  round: number;
  type:
    | "move"
    | "hit"
    | "miss"
    | "guard"
    | "dodge"
    | "grapple"
    | "ability"
    | "ring_out"
    | "knockout"
    | "hazard"
    | "match_end";
  actorId?: string;
  targetId?: string;
  value?: number;
  description: string;
};

export type RumbleActionArguments =
  | {
      target: { type: "opponent"; fighterId: string } | { type: "position"; x: number; z: number };
      desiredDistance?: number;
    }
  | { attack: "jab" | "heavy" | "sweep" | "dash_attack"; targetFighterId?: string }
  | { defense: "guard" | "dodge_left" | "dodge_right" | "backstep" | "brace" }
  | {
      action: "grab" | "push" | "throw_forward" | "throw_left" | "throw_right" | "break";
      targetFighterId?: string;
    }
  | { abilityId: "focus_burst" | "ground_slam" | "blink_dash"; targetFighterId?: string }
  | { durationMs?: number };

export type RumbleAction = AgentAction<RumbleActionArguments>;

export type RumbleState = {
  matchId: string;
  mode: RumbleMode;
  timingMode: "lockstep";
  status: "ready" | "running" | "completed";
  seed: number;
  round: number;
  maxRounds: number;
  elapsedMs: number;
  decisionIntervalMs: number;
  arena: {
    id: "crownfall-coliseum";
    name: "Crownfall Coliseum";
    radius: number;
    center: { x: 0; z: 0 };
    hazardPulseEveryRounds: number;
    currentPulse: number;
  };
  fighters: RumbleFighter[];
  activeParticipantId: string;
  pendingActions: Record<string, RumbleAction>;
  actedThisRound: string[];
  recentEvents: RumbleCombatEvent[];
  eventHistory: RumbleCombatEvent[];
  teamScores: Record<string, number>;
  winner?: {
    fighterId?: string;
    teamId?: string;
    reason:
      | "last_fighter_standing"
      | "knockout"
      | "round_limit"
      | "simultaneous_elimination";
  };
  eliminationOrder: string[];
};

export type RumbleObservation = {
  match: {
    matchId: string;
    mode: RumbleMode;
    elapsedMs: number;
    round: number;
    maxRounds: number;
    seed: number;
    timingMode: "lockstep";
  };
  self: RumbleFighter;
  visibleFighters: RumbleFighter[];
  arena: {
    radius: number;
    edgeDistance: number;
    centerDirection: { x: number; z: number };
    hazardPulseInRounds: number;
  };
  team?: { teamId: string; score: number; teammateIds: string[] };
  recentEvents: RumbleCombatEvent[];
  availableActions: string[];
  actionGuide: Array<{
    type: string;
    purpose: string;
    arguments: Record<string, unknown>;
  }>;
  budget: { actionsRemaining: number; decisionDeadlineMs: number };
};

const metadata: EnvironmentMetadata = {
  id: "agent-rumble-v1",
  name: "Agent Rumble",
  version: "1.0.0",
  description:
    "A seed-controlled arcade combat arena where human and AI fighters battle through movement, defense, strikes, grapples, abilities, knockback, and ring-outs.",
  tags: ["combat", "multi-agent", "3d", "arcade", "benchmark", "deterministic"],
  runtime: "in-process"
};

const actionTypes = [
  "combat.move_to",
  "combat.attack",
  "combat.defend",
  "combat.grapple",
  "combat.use_ability",
  "combat.wait"
] as const;

const actionSchema: JsonSchema = {
  type: "object",
  required: ["type", "arguments"],
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    type: { enum: actionTypes },
    arguments: { type: "object" },
    summary: { type: "string" }
  },
  oneOf: [
    actionBranch("combat.move_to", {
      type: "object",
      required: ["target"],
      additionalProperties: false,
      properties: {
        target: {
          oneOf: [
            {
              type: "object",
              required: ["type", "fighterId"],
              additionalProperties: false,
              properties: {
                type: { enum: ["opponent"] },
                fighterId: { type: "string", minLength: 1 }
              }
            },
            {
              type: "object",
              required: ["type", "x", "z"],
              additionalProperties: false,
              properties: {
                type: { enum: ["position"] },
                x: { type: "number", minimum: -9, maximum: 9 },
                z: { type: "number", minimum: -9, maximum: 9 }
              }
            }
          ]
        },
        desiredDistance: { type: "number", minimum: 0, maximum: 5 }
      }
    }),
    actionBranch("combat.attack", {
      type: "object",
      required: ["attack", "targetFighterId"],
      additionalProperties: false,
      properties: {
        attack: { enum: ["jab", "heavy", "sweep", "dash_attack"] },
        targetFighterId: { type: "string", minLength: 1 }
      }
    }),
    actionBranch("combat.defend", {
      type: "object",
      required: ["defense"],
      additionalProperties: false,
      properties: {
        defense: { enum: ["guard", "dodge_left", "dodge_right", "backstep", "brace"] }
      }
    }),
    actionBranch("combat.grapple", {
      type: "object",
      required: ["action", "targetFighterId"],
      additionalProperties: false,
      properties: {
        action: { enum: ["grab", "push", "throw_forward", "throw_left", "throw_right", "break"] },
        targetFighterId: { type: "string", minLength: 1 }
      }
    }),
    actionBranch("combat.use_ability", {
      type: "object",
      required: ["abilityId", "targetFighterId"],
      additionalProperties: false,
      properties: {
        abilityId: { enum: ["focus_burst", "ground_slam", "blink_dash"] },
        targetFighterId: { type: "string", minLength: 1 }
      }
    }),
    actionBranch("combat.wait", {
      type: "object",
      additionalProperties: false,
      properties: { durationMs: { type: "number", minimum: 0, maximum: 2000 } }
    })
  ]
};

const actionGuide: RumbleObservation["actionGuide"] = [
  { type: "combat.move_to", purpose: "Close distance, retreat, or claim the safe center.", arguments: { target: { type: "opponent", fighterId: "fighter-id" }, desiredDistance: 1.6 } },
  { type: "combat.attack", purpose: "Strike an opponent. Jab is quick; heavy hits hard; sweep controls space; dash attack closes distance.", arguments: { attack: "jab | heavy | sweep | dash_attack", targetFighterId: "fighter-id" } },
  { type: "combat.defend", purpose: "Reduce, evade, or create space from incoming damage.", arguments: { defense: "guard | dodge_left | dodge_right | backstep | brace" } },
  { type: "combat.grapple", purpose: "Shove a nearby opponent toward the arena edge.", arguments: { action: "push", targetFighterId: "fighter-id" } },
  { type: "combat.use_ability", purpose: "Spend 100 ability charge on a signature attack.", arguments: { abilityId: "focus_burst | ground_slam | blink_dash", targetFighterId: "fighter-id" } },
  { type: "combat.wait", purpose: "Recover stamina when no safe attack exists.", arguments: { durationMs: 650 } }
];

const observationSchema: JsonSchema = {
  type: "object",
  required: [
    "match",
    "self",
    "visibleFighters",
    "arena",
    "recentEvents",
    "availableActions",
    "actionGuide",
    "budget"
  ],
  properties: {
    match: { type: "object" },
    self: { type: "object" },
    visibleFighters: { type: "array" },
    arena: { type: "object" },
    recentEvents: { type: "array" },
    availableActions: { type: "array" },
    actionGuide: { type: "array" },
    budget: { type: "object" }
  }
};

export class RumbleCoreEnvironment
  implements Environment<RumbleObservation, RumbleAction, RumbleState>
{
  readonly metadata = metadata;
  #episodeId = "";
  #state?: RumbleState;

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
  }

  async reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<RumbleObservation, RumbleState>> {
    this.#episodeId = input.episodeId;
    const parameters = input.scenario?.parameters ?? {};
    const mode = parseMode(parameters.mode);
    const participantIds = parseParticipantIds(parameters.participantIds, mode);
    const teams =
      mode === "team_battle"
        ? Object.fromEntries(participantIds.map((id, index) => [id, index < 2 ? "sun" : "moon"]))
        : {};
    const seed = input.seed ?? 404;
    const fighters = participantIds.map((id, index) =>
      createFighter(
        id,
        String((parameters.displayNames as Record<string, unknown> | undefined)?.[id] ?? fighterName(index)),
        parseArchetype((parameters.archetypes as Record<string, unknown> | undefined)?.[id], index),
        teams[id],
        index,
        participantIds.length,
        mode
      )
    );
    this.#state = {
      matchId: input.episodeId,
      mode,
      timingMode: "lockstep",
      status: "ready",
      seed,
      round: 1,
      maxRounds: clampInteger(parameters.maxRounds, 8, 80, mode === "duel" ? 28 : 36),
      elapsedMs: 0,
      decisionIntervalMs: 650,
      arena: {
        id: "crownfall-coliseum",
        name: "Crownfall Coliseum",
        radius: 10,
        center: { x: 0, z: 0 },
        hazardPulseEveryRounds: 6,
        currentPulse: 0
      },
      fighters,
      activeParticipantId: fighters[0]!.id,
      pendingActions: {},
      actedThisRound: [],
      recentEvents: [],
      eventHistory: [],
      teamScores: mode === "team_battle" ? { sun: 0, moon: 0 } : {},
      eliminationOrder: []
    };
    return { observation: this.observe(), state: structuredClone(this.#state) };
  }

  async step(
    action: RumbleAction
  ): Promise<EnvironmentStepResult<RumbleObservation, RumbleState>> {
    const state = this.requireState();
    if (state.status === "completed") {
      return this.result([], 0, true, "match_completed");
    }
    state.status = "running";
    const actorId = state.activeParticipantId;
    const actor = requireFighter(state, actorId);
    validateAction(action, actor, state);
    state.pendingActions[actorId] = structuredClone(action);
    state.actedThisRound.push(actorId);
    const events: ArenaEvent[] = [
      rumbleEvent("rumble.action_buffered", this.#episodeId, state.round, {
        fighterId: actorId,
        action
      })
    ];

    const alive = aliveFighters(state);
    const remaining = alive.filter((fighter) => !state.actedThisRound.includes(fighter.id));
    if (remaining.length > 0) {
      state.activeParticipantId = remaining[0]!.id;
      return this.result(events, 0, false);
    }

    const combatEvents = resolveRound(state);
    state.recentEvents = combatEvents;
    state.eventHistory.push(...combatEvents);
    events.push(
      rumbleEvent("rumble.round_resolved", this.#episodeId, state.round, {
        round: state.round,
        actions: state.pendingActions,
        combatEvents,
        fighters: state.fighters
      })
    );
    for (const combatEvent of combatEvents) {
      events.push(
        rumbleEvent(`rumble.${combatEvent.type}`, this.#episodeId, state.round, combatEvent)
      );
    }
    state.pendingActions = {};
    state.actedThisRound = [];
    state.elapsedMs += state.decisionIntervalMs;
    const ended = determineWinner(state);
    if (!ended) {
      state.round += 1;
      const next = aliveFighters(state)[0];
      if (next) state.activeParticipantId = next.id;
    } else {
      events.push(
        rumbleEvent("rumble.match_completed", this.#episodeId, state.round, {
          winner: state.winner,
          eliminationOrder: state.eliminationOrder,
          teamScores: state.teamScores
        })
      );
    }
    const reward = combatEvents.reduce(
      (sum, event) =>
        sum +
        (event.actorId === actorId && event.type === "hit" ? (event.value ?? 0) / 100 : 0) +
        (event.actorId === actorId && event.type === "ring_out" ? 1 : 0),
      0
    );
    return this.result(events, reward, ended, ended ? "match_completed" : undefined);
  }

  async getState(): Promise<RumbleState> {
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

  private observe(): Observation<RumbleObservation> {
    const state = this.requireState();
    const self = requireFighter(state, state.activeParticipantId);
    const distance = Math.hypot(self.position.x, self.position.z);
    const observation: RumbleObservation = {
      match: {
        matchId: state.matchId,
        mode: state.mode,
        elapsedMs: state.elapsedMs,
        round: state.round,
        maxRounds: state.maxRounds,
        seed: state.seed,
        timingMode: state.timingMode
      },
      self: structuredClone(self),
      visibleFighters: structuredClone(
        state.fighters.filter((fighter) => fighter.id !== self.id)
      ),
      arena: {
        radius: state.arena.radius,
        edgeDistance: round(state.arena.radius - distance),
        centerDirection: normalize2d(-self.position.x, -self.position.z),
        hazardPulseInRounds:
          state.arena.hazardPulseEveryRounds -
          ((state.round - 1) % state.arena.hazardPulseEveryRounds) -
          1
      },
      recentEvents: structuredClone(state.recentEvents),
      availableActions: [...actionTypes],
      actionGuide: structuredClone(actionGuide),
      budget: {
        actionsRemaining: Math.max(0, state.maxRounds - state.round + 1),
        decisionDeadlineMs: state.decisionIntervalMs
      }
    };
    if (self.teamId) {
      observation.team = {
        teamId: self.teamId,
        score: state.teamScores[self.teamId] ?? 0,
        teammateIds: state.fighters
          .filter((fighter) => fighter.teamId === self.teamId && fighter.id !== self.id)
          .map((fighter) => fighter.id)
      };
    }
    return {
      id: randomUUID(),
      episodeId: this.#episodeId,
      step: state.eventHistory.length + state.actedThisRound.length,
      timestamp: new Date().toISOString(),
      activeParticipantId: state.activeParticipantId,
      availableActions: [...actionTypes],
      data: observation
    };
  }

  private result(
    events: ArenaEvent[],
    reward: number,
    terminated: boolean,
    terminationReason?: string
  ): EnvironmentStepResult<RumbleObservation, RumbleState> {
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
        round: state.round,
        winner: state.winner,
        aliveFighters: aliveFighters(state).length
      }
    };
  }

  private requireState(): RumbleState {
    if (!this.#state) throw new Error("RumbleCore has not been reset.");
    return this.#state;
  }
}

type RumblePolicy = "tactician" | "vanguard" | "guardian" | "skirmisher";

const policyMetadata: Record<RumblePolicy, Pick<AgentMetadata, "id" | "name" | "description">> = {
  tactician: { id: "rumble-tactician", name: "Crown Tactician", description: "Balanced baseline that manages spacing, stamina, abilities, and edge pressure." },
  vanguard: { id: "rumble-vanguard", name: "Iron Vanguard", description: "Aggressive baseline that closes distance and prioritizes heavy strikes and grapples." },
  guardian: { id: "rumble-guardian", name: "Aegis Guardian", description: "Defensive baseline that protects stamina, controls center, and punishes unsafe attacks." },
  skirmisher: { id: "rumble-skirmisher", name: "Swift Skirmisher", description: "Mobile baseline that uses dodges, dash attacks, and opportunistic abilities." }
};

class RumbleTacticianAgent implements Agent<RumbleObservation, RumbleAction> {
  readonly metadata: AgentMetadata;
  #participantId = "";

  constructor(readonly policy: RumblePolicy = "tactician") {
    const profile = policyMetadata[policy];
    this.metadata = {
      ...profile,
      version: "2.0.0",
      provider: "ArenaOS",
      model: `deterministic-${policy}-policy`,
      tags: ["combat", "deterministic", "multi-agent", policy]
    };
  }

  async initialize(context: AgentInitializeContext): Promise<void> {
    this.#participantId = context.participant?.id ?? "";
  }

  async act(
    input: AgentActInput<RumbleObservation>
  ): Promise<AgentActResult<RumbleAction>> {
    const observation = input.observation.data;
    const self = observation.self;
    const opponents = observation.visibleFighters.filter(
      (fighter) =>
        fighter.state !== "eliminated" &&
        fighter.id !== self.id &&
        (!self.teamId || fighter.teamId !== self.teamId)
    );
    const target = [...opponents].sort((left, right) => {
      const leftDistance = distance(self.position, left.position);
      const rightDistance = distance(self.position, right.position);
      return (
        left.health + leftDistance * 1.6 - (right.health + rightDistance * 1.6) ||
        left.id.localeCompare(right.id)
      );
    })[0];
    if (!target) return rumbleAction("combat.wait", { durationMs: 650 }, "No opponent remains.");
    const targetDistance = distance(self.position, target.position);
    const selfEdge = observation.arena.edgeDistance;
    const targetEdge =
      observation.arena.radius - Math.hypot(target.position.x, target.position.z);

    if (selfEdge < 1.15) {
      return rumbleAction(
        "combat.move_to",
        { target: { type: "position", x: 0, z: 0 }, desiredDistance: 1 },
        "Retreat toward center to avoid a ring-out."
      );
    }
    if (
      this.policy === "guardian" &&
      (self.stamina < 18 ||
        (self.health < self.maxHealth * 0.3 &&
          target.currentAction?.includes("attack") &&
          deterministicChoice(self.id, observation.match.round)))
    ) {
      return rumbleAction(
        "combat.defend",
        { defense: selfEdge < 3 ? "brace" : "guard" },
        "Hold a disciplined guard and recover for a counterattack."
      );
    }
    if (self.abilityCharge >= 100 && targetDistance <= 3.6) {
      return rumbleAction(
        "combat.use_ability",
        {
          abilityId:
            self.archetype === "heavy"
              ? "ground_slam"
              : self.archetype === "agile"
                ? "blink_dash"
                : "focus_burst",
          targetFighterId: target.id
        },
        "Spend full ability charge on the current target."
      );
    }
    if (self.stamina < 14) {
      return rumbleAction(
        "combat.defend",
        { defense: deterministicChoice(self.id, observation.match.round) ? "guard" : "backstep" },
        "Recover stamina behind a defensive action."
      );
    }
    if (targetDistance > 2.8) {
      if (
        this.policy !== "guardian" &&
        self.stamina >= 22 &&
        targetDistance <= 4.8
      ) {
        return rumbleAction(
          "combat.attack",
          { attack: "dash_attack", targetFighterId: target.id },
          `Dash through open space toward ${target.displayName}.`
        );
      }
      return rumbleAction(
        "combat.move_to",
        { target: { type: "opponent", fighterId: target.id }, desiredDistance: 1.4 },
        `Rush ${target.displayName} and enter striking distance.`
      );
    }
    if (targetEdge < 2.8 && targetDistance <= 1.75 && self.stamina >= 25) {
      return rumbleAction(
        "combat.grapple",
        { action: "push", targetFighterId: target.id },
        "Attempt an edge-pressure grapple push."
      );
    }
    if (this.policy === "vanguard" && targetDistance <= 2.2 && self.stamina >= 24) {
      return rumbleAction(
        "combat.attack",
        { attack: "heavy", targetFighterId: target.id },
        `Commit to a heavy strike against ${target.displayName}.`
      );
    }
    if (
      this.policy === "skirmisher" &&
      self.health < self.maxHealth * 0.45 &&
      target.currentAction?.includes("heavy")
    ) {
      return rumbleAction(
        "combat.defend",
        { defense: deterministicChoice(self.id, observation.match.round) ? "dodge_left" : "dodge_right" },
        "Evade the telegraphed heavy strike."
      );
    }
    if (
      self.health < self.maxHealth * 0.35 &&
      (target.currentAction?.includes("heavy") || target.currentAction?.includes("ability"))
    ) {
      return rumbleAction(
        "combat.defend",
        { defense: "dodge_left" },
        "Dodge the telegraphed high-impact action."
      );
    }
    const attack =
      target.state === "guarding" && self.stamina >= 24
        ? "heavy"
        : self.stamina >= 34 && deterministicChoice(this.#participantId, observation.match.round)
        ? "heavy"
        : targetDistance <= 1.75
          ? "jab"
          : self.stamina >= 22
            ? "dash_attack"
            : "jab";
    return rumbleAction(
      "combat.attack",
      { attack, targetFighterId: target.id },
      `Attack ${target.displayName} with ${attack.replace("_", " ")}.`
    );
  }

  async reset(): Promise<void> {}
  async close(): Promise<void> {}
}

class RumbleMatchEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "rumble-match-score",
    name: "Rumble Match Score",
    version: "1.0.0",
    description:
      "Scores match completion, placement, combat effectiveness, survival, action validity, and ring-outs from authoritative state.",
    tags: ["combat", "deterministic", "multi-agent"]
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as RumbleState;
    const winner = state.winner;
    const completed = state.status === "completed";
    const totalDamage = state.fighters.reduce(
      (sum, fighter) => sum + fighter.stats.damageDealt,
      0
    );
    const totalRingOuts = state.fighters.reduce(
      (sum, fighter) => sum + fighter.stats.ringOuts,
      0
    );
    const activeCombat = state.eventHistory.filter(
      (event) => event.type === "hit" || event.type === "grapple" || event.type === "ability"
    ).length;
    const score =
      (completed ? 0.35 : 0) +
      (winner ? 0.2 : 0) +
      Math.min(0.2, totalDamage / 500) +
      Math.min(0.15, totalRingOuts * 0.08) +
      Math.min(0.1, activeCombat / 30);
    return {
      evaluatorId: this.metadata.id,
      score: round(score),
      passed: completed && Boolean(winner),
      metrics: [
        { name: "match_completed", value: completed },
        { name: "rounds", value: state.round },
        { name: "total_damage", value: round(totalDamage) },
        { name: "ring_outs", value: totalRingOuts },
        { name: "combat_events", value: activeCombat },
        { name: "winner", value: winner?.fighterId ?? winner?.teamId ?? "none" }
      ],
      summary: winner
        ? `Rumble completed in ${state.round} rounds; winner ${winner.fighterId ?? winner.teamId}.`
        : "Rumble ended without a resolved winner."
    };
  }
}

function resolveRound(state: RumbleState): RumbleCombatEvent[] {
  const events: RumbleCombatEvent[] = [];
  const alive = aliveFighters(state);
  for (const fighter of alive) {
    fighter.state = "idle";
    const pending = state.pendingActions[fighter.id];
    fighter.currentAction = describeAction(pending);
    fighter.targetFighterId = targetIdFromAction(pending);
    fighter.statusEffects = fighter.statusEffects.filter((effect) => effect !== "impact-flash");
  }

  for (const fighter of alive) {
    const action = state.pendingActions[fighter.id]!;
    if (action.type === "combat.defend") {
      const defense = (action.arguments as { defense: string }).defense;
      fighter.state = defense.startsWith("dodge") || defense === "backstep" ? "dodging" : "guarding";
      fighter.stats.guards += fighter.state === "guarding" ? 1 : 0;
      fighter.stats.dodges += fighter.state === "dodging" ? 1 : 0;
      if (defense === "backstep") moveAwayFrom(fighter, nearestOpponent(fighter, alive), 1.25);
      events.push(combatEvent(state, "guard", fighter.id, undefined, undefined, `${fighter.displayName} ${defense.replace("_", " ")}.`));
    }
  }

  for (const fighter of alive) {
    const action = state.pendingActions[fighter.id]!;
    if (action.type !== "combat.move_to") continue;
    const args = action.arguments as {
      target: { type: "opponent"; fighterId: string } | { type: "position"; x: number; z: number };
      desiredDistance?: number;
    };
    const target =
      args.target.type === "opponent"
        ? requireFighter(state, args.target.fighterId).position
        : { x: args.target.x, y: 0, z: args.target.z };
    const speed = fighter.archetype === "agile" ? 2.05 : fighter.archetype === "heavy" ? 1.35 : 1.7;
    const moved = moveToward(fighter, target, speed, args.desiredDistance ?? 0);
    fighter.state = "moving";
    fighter.stats.distanceMoved += moved;
    events.push(combatEvent(state, "move", fighter.id, undefined, moved, `${fighter.displayName} repositioned ${moved.toFixed(1)} metres.`));
  }

  for (const fighter of alive) {
    const action = state.pendingActions[fighter.id]!;
    if (action.type === "combat.attack") resolveAttack(state, fighter, action, events);
    if (action.type === "combat.grapple") resolveGrapple(state, fighter, action, events);
    if (action.type === "combat.use_ability") resolveAbility(state, fighter, action, events);
  }

  if (state.round % state.arena.hazardPulseEveryRounds === 0) {
    state.arena.currentPulse += 1;
    for (const fighter of aliveFighters(state)) {
      const edgeDistance = state.arena.radius - Math.hypot(fighter.position.x, fighter.position.z);
      if (edgeDistance < 2.5) {
        const direction = normalize2d(fighter.position.x, fighter.position.z);
        fighter.position.x += direction.x * 0.55;
        fighter.position.z += direction.z * 0.55;
        fighter.knockback = clamp(fighter.knockback + 5, 0, 100);
        events.push(combatEvent(state, "hazard", undefined, fighter.id, 5, `Neon rail pulse destabilized ${fighter.displayName}.`));
      }
    }
  }

  for (const fighter of aliveFighters(state)) {
    fighter.stamina = clamp(
      fighter.stamina + (fighter.state === "guarding" || fighter.state === "idle" ? 14 : 8),
      0,
      100
    );
    if (Math.hypot(fighter.position.x, fighter.position.z) > state.arena.radius) {
      eliminate(state, fighter, events, "ring_out");
    } else if (fighter.health <= 0) {
      eliminate(state, fighter, events, "knockout");
    }
  }
  return events;
}

function resolveAttack(
  state: RumbleState,
  actor: RumbleFighter,
  action: RumbleAction,
  events: RumbleCombatEvent[]
): void {
  if (actor.state === "eliminated") return;
  const args = action.arguments as {
    attack: "jab" | "heavy" | "sweep" | "dash_attack";
    targetFighterId?: string;
  };
  const target = targetFor(state, actor, args.targetFighterId);
  actor.state = "attacking";
  actor.stats.attacksAttempted += 1;
  if (!target) return;
  const profile = {
    jab: { range: 1.9, damage: 8, stamina: 8, knockback: 7 },
    heavy: { range: 2.1, damage: 18, stamina: 24, knockback: 18 },
    sweep: { range: 2.6, damage: 12, stamina: 18, knockback: 12 },
    dash_attack: { range: 3.6, damage: 14, stamina: 22, knockback: 16 }
  }[args.attack];
  if (actor.stamina < profile.stamina) {
    events.push(combatEvent(state, "miss", actor.id, target.id, 0, `${actor.displayName} lacked stamina for ${args.attack}.`));
    return;
  }
  actor.stamina -= profile.stamina;
  const targetDistance = distance(actor.position, target.position);
  if (args.attack === "dash_attack" && targetDistance > 1.8) {
    moveToward(actor, target.position, Math.min(1.7, targetDistance - 1.5), 1.5);
  }
  if (distance(actor.position, target.position) > profile.range) {
    events.push(combatEvent(state, "miss", actor.id, target.id, 0, `${actor.displayName}'s ${args.attack.replace("_", " ")} missed.`));
    return;
  }
  if (
    target.state === "dodging" &&
    seededUnit(state.seed, state.round, actor.id, target.id, args.attack) < 0.72
  ) {
    events.push(combatEvent(state, "dodge", target.id, actor.id, 0, `${target.displayName} dodged ${actor.displayName}.`));
    return;
  }
  const guarded = target.state === "guarding";
  const archetypeMultiplier = actor.archetype === "heavy" ? 1.14 : actor.archetype === "agile" ? 0.9 : 1;
  const staminaPenalty = actor.stamina < 18 ? 0.78 : 1;
  const damage = round(profile.damage * archetypeMultiplier * staminaPenalty * (guarded ? 0.38 : 1));
  const knockback = round(profile.knockback * (1 + target.knockback / 100) * (guarded ? 0.5 : 1));
  applyHit(actor, target, damage, knockback);
  events.push(combatEvent(state, "hit", actor.id, target.id, damage, `${actor.displayName} landed ${args.attack.replace("_", " ")} on ${target.displayName}${guarded ? " through guard" : ""}.`));
}

function resolveGrapple(
  state: RumbleState,
  actor: RumbleFighter,
  action: RumbleAction,
  events: RumbleCombatEvent[]
): void {
  const args = action.arguments as { action: string; targetFighterId?: string };
  const target = targetFor(state, actor, args.targetFighterId);
  actor.stats.grapples += 1;
  actor.state = "grappling";
  if (!target || actor.stamina < 22 || distance(actor.position, target.position) > 1.65) {
    events.push(combatEvent(state, "miss", actor.id, target?.id, 0, `${actor.displayName}'s grapple missed.`));
    return;
  }
  actor.stamina -= 22;
  if (target.state === "dodging") {
    events.push(combatEvent(state, "dodge", target.id, actor.id, 0, `${target.displayName} escaped the grapple.`));
    return;
  }
  const force = actor.archetype === "heavy" ? 2.35 : 1.85;
  pushFrom(actor, target, force * (1 + target.knockback / 120));
  target.knockback = clamp(target.knockback + 14, 0, 100);
  target.state = "staggered";
  events.push(combatEvent(state, "grapple", actor.id, target.id, force, `${actor.displayName} shoved ${target.displayName} toward the rail.`));
}

function resolveAbility(
  state: RumbleState,
  actor: RumbleFighter,
  action: RumbleAction,
  events: RumbleCombatEvent[]
): void {
  const args = action.arguments as { abilityId: string; targetFighterId?: string };
  if (actor.abilityCharge < 100) {
    events.push(combatEvent(state, "miss", actor.id, undefined, 0, `${actor.displayName}'s ability was not charged.`));
    return;
  }
  actor.abilityCharge = 0;
  actor.state = "attacking";
  const opponents = aliveFighters(state).filter(
    (fighter) =>
      fighter.id !== actor.id && (!actor.teamId || fighter.teamId !== actor.teamId)
  );
  const targets =
    args.abilityId === "ground_slam"
      ? opponents.filter((fighter) => distance(actor.position, fighter.position) <= 3.5)
      : [targetFor(state, actor, args.targetFighterId)].filter(Boolean) as RumbleFighter[];
  if (args.abilityId === "blink_dash" && targets[0]) {
    moveToward(actor, targets[0].position, Math.max(0, distance(actor.position, targets[0].position) - 1.3), 1.3);
  }
  for (const target of targets) {
    if (distance(actor.position, target.position) > 3.5) continue;
    const damage = args.abilityId === "focus_burst" ? 20 : args.abilityId === "ground_slam" ? 16 : 15;
    const force = args.abilityId === "ground_slam" ? 25 : 20;
    applyHit(actor, target, damage, force);
  }
  events.push(combatEvent(state, "ability", actor.id, targets[0]?.id, targets.length, `${actor.displayName} activated ${args.abilityId.replace("_", " ")} on ${targets.length} target${targets.length === 1 ? "" : "s"}.`));
}

function applyHit(
  actor: RumbleFighter,
  target: RumbleFighter,
  damage: number,
  knockback: number
): void {
  target.health = clamp(target.health - damage, 0, target.maxHealth);
  target.knockback = clamp(target.knockback + knockback * 0.45, 0, 100);
  target.state = "staggered";
  target.statusEffects.push("impact-flash");
  pushFrom(actor, target, 0.35 + knockback * 0.045);
  actor.stats.damageDealt += damage;
  actor.stats.hitsLanded += 1;
  actor.abilityCharge = clamp(actor.abilityCharge + damage * 1.35, 0, 100);
  target.stats.damageTaken += damage;
  target.abilityCharge = clamp(target.abilityCharge + damage * 0.75, 0, 100);
}

function eliminate(
  state: RumbleState,
  fighter: RumbleFighter,
  events: RumbleCombatEvent[],
  type: "ring_out" | "knockout"
): void {
  if (fighter.state === "eliminated") return;
  fighter.state = "eliminated";
  fighter.eliminatedAtRound = state.round;
  const aliveAfter = aliveFighters(state).length;
  fighter.placement = aliveAfter + 1;
  state.eliminationOrder.push(fighter.id);
  const lastHit = [...events]
    .reverse()
    .find((event) => event.targetId === fighter.id && event.actorId);
  if (lastHit?.actorId) {
    const actor = requireFighter(state, lastHit.actorId);
    actor.stats.ringOuts += type === "ring_out" ? 1 : 0;
    if (actor.teamId) state.teamScores[actor.teamId] = (state.teamScores[actor.teamId] ?? 0) + 1;
  }
  events.push(combatEvent(state, type, lastHit?.actorId, fighter.id, fighter.placement, `${fighter.displayName} was ${type === "ring_out" ? "launched from the arena" : "knocked out"}!`));
}

function determineWinner(state: RumbleState): boolean {
  const alive = aliveFighters(state);
  if (alive.length === 0) {
    const ranked = [...state.fighters].sort(
      (left, right) =>
        scoreFighter(right) - scoreFighter(left) || left.id.localeCompare(right.id)
    );
    ranked.forEach((fighter, index) => {
      fighter.placement = index + 1;
    });
    if (state.mode === "team_battle") {
      const teamTotals = Object.entries(state.teamScores)
        .map(([teamId, score]) => ({
          teamId,
          score:
            score +
            state.fighters
              .filter((fighter) => fighter.teamId === teamId)
              .reduce((sum, fighter) => sum + scoreFighter(fighter), 0)
        }))
        .sort((left, right) => right.score - left.score || left.teamId.localeCompare(right.teamId));
      state.winner = { teamId: teamTotals[0]?.teamId, reason: "simultaneous_elimination" };
    } else {
      state.winner = {
        fighterId: ranked[0]?.id,
        reason: "simultaneous_elimination"
      };
    }
    state.status = "completed";
    return true;
  }
  if (state.mode === "team_battle") {
    const livingTeams = [...new Set(alive.map((fighter) => fighter.teamId!))];
    if (livingTeams.length === 1) {
      state.status = "completed";
      state.winner = { teamId: livingTeams[0], reason: "last_fighter_standing" };
      for (const fighter of alive) fighter.placement = 1;
      return true;
    }
  } else if (alive.length === 1) {
    state.status = "completed";
    alive[0]!.placement = 1;
    state.winner = {
      fighterId: alive[0]!.id,
      reason: state.mode === "duel" ? "knockout" : "last_fighter_standing"
    };
    return true;
  }
  if (state.round >= state.maxRounds) {
    state.status = "completed";
    const ranked = [...alive].sort(
      (left, right) =>
        scoreFighter(right) - scoreFighter(left) || left.id.localeCompare(right.id)
    );
    ranked.forEach((fighter, index) => {
      fighter.placement = index + 1;
    });
    if (state.mode === "team_battle") {
      const teamTotals = Object.entries(state.teamScores).map(([teamId, score]) => ({
        teamId,
        score:
          score +
          state.fighters
            .filter((fighter) => fighter.teamId === teamId)
            .reduce((sum, fighter) => sum + scoreFighter(fighter), 0)
      }));
      teamTotals.sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId));
      state.winner = { teamId: teamTotals[0]!.teamId, reason: "round_limit" };
    } else {
      state.winner = { fighterId: ranked[0]!.id, reason: "round_limit" };
    }
    return true;
  }
  return false;
}

function createFighter(
  id: string,
  displayName: string,
  archetype: FighterArchetype,
  teamId: string | undefined,
  index: number,
  count: number,
  mode: RumbleMode
): RumbleFighter {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const spawnRadius = mode === "duel" ? 3.15 : 4.55;
  const maxHealth = archetype === "heavy" ? 125 : archetype === "agile" ? 90 : 105;
  return {
    id,
    displayName,
    teamId,
    archetype,
    color: ["#ff4d8d", "#51e7ff", "#ffe35e", "#9bff72"][index % 4]!,
    position: {
      x: round(Math.cos(angle) * spawnRadius),
      y: 0,
      z: round(Math.sin(angle) * spawnRadius)
    },
    facing: normalize2d(-Math.cos(angle), -Math.sin(angle)),
    health: maxHealth,
    maxHealth,
    stamina: 100,
    abilityCharge: 55,
    knockback: 0,
    state: "idle",
    statusEffects: [],
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      hitsLanded: 0,
      attacksAttempted: 0,
      guards: 0,
      dodges: 0,
      grapples: 0,
      ringOuts: 0,
      distanceMoved: 0
    }
  };
}

function validateAction(
  action: RumbleAction,
  actor: RumbleFighter,
  state: RumbleState
): void {
  if (!actionTypes.includes(action.type as (typeof actionTypes)[number])) {
    throw new Error(`Unsupported RumbleCore action "${action.type}".`);
  }
  if (actor.state === "eliminated") {
    throw new Error(`Eliminated fighter "${actor.id}" cannot act.`);
  }
  if (!action.arguments || typeof action.arguments !== "object" || Array.isArray(action.arguments)) {
    throw new Error("Rumble action arguments must be an object.");
  }
  if (action.type === "combat.move_to") {
    const target = (action.arguments as { target?: unknown }).target;
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      throw new Error("combat.move_to requires a target object.");
    }
    const typedTarget = target as { type?: unknown; fighterId?: unknown; x?: unknown; z?: unknown };
    if (typedTarget.type === "position") {
      if (!Number.isFinite(typedTarget.x) || !Number.isFinite(typedTarget.z)) {
        throw new Error("Position targets require finite x and z coordinates.");
      }
      if (Math.abs(Number(typedTarget.x)) > 9 || Math.abs(Number(typedTarget.z)) > 9) {
        throw new Error("Position target must remain inside the playable arena.");
      }
    } else if (typedTarget.type !== "opponent" || typeof typedTarget.fighterId !== "string") {
      throw new Error("Move target must identify an opponent or arena position.");
    }
  }
  if (action.type === "combat.attack" || action.type === "combat.grapple" || action.type === "combat.use_ability") {
    if (typeof (action.arguments as { targetFighterId?: unknown }).targetFighterId !== "string") {
      throw new Error(`${action.type} requires targetFighterId.`);
    }
  }
  const targetId =
    "targetFighterId" in action.arguments
      ? action.arguments.targetFighterId
      : "target" in action.arguments && action.arguments.target.type === "opponent"
        ? action.arguments.target.fighterId
        : undefined;
  if (targetId) {
    const target = requireFighter(state, targetId);
    if (target.state === "eliminated") throw new Error("Target fighter is eliminated.");
    if (target.id === actor.id) throw new Error("Fighter cannot target itself.");
    if (state.mode === "team_battle" && target.teamId === actor.teamId && action.type !== "combat.move_to") {
      throw new Error("Friendly fire is disabled in the initial team-battle profile.");
    }
  }
}

function targetFor(
  state: RumbleState,
  actor: RumbleFighter,
  requestedId?: string
): RumbleFighter | undefined {
  if (requestedId) {
    const requested = state.fighters.find(
      (fighter) => fighter.id === requestedId && fighter.state !== "eliminated"
    );
    if (requested && (!actor.teamId || requested.teamId !== actor.teamId)) return requested;
  }
  return nearestOpponent(actor, aliveFighters(state));
}

function nearestOpponent(
  actor: RumbleFighter,
  fighters: RumbleFighter[]
): RumbleFighter | undefined {
  return fighters
    .filter(
      (fighter) =>
        fighter.id !== actor.id && (!actor.teamId || fighter.teamId !== actor.teamId)
    )
    .sort(
      (left, right) =>
        distance(actor.position, left.position) - distance(actor.position, right.position) ||
        left.id.localeCompare(right.id)
    )[0];
}

function moveToward(
  fighter: RumbleFighter,
  target: { x: number; z: number },
  maximumDistance: number,
  desiredDistance: number
): number {
  const dx = target.x - fighter.position.x;
  const dz = target.z - fighter.position.z;
  const currentDistance = Math.hypot(dx, dz);
  if (currentDistance <= desiredDistance || currentDistance === 0) return 0;
  const move = Math.min(maximumDistance, currentDistance - desiredDistance);
  const direction = normalize2d(dx, dz);
  fighter.position.x = round(fighter.position.x + direction.x * move);
  fighter.position.z = round(fighter.position.z + direction.z * move);
  fighter.facing = direction;
  return round(move);
}

function moveAwayFrom(
  fighter: RumbleFighter,
  target: RumbleFighter | undefined,
  amount: number
): void {
  if (!target) return;
  const direction = normalize2d(
    fighter.position.x - target.position.x,
    fighter.position.z - target.position.z
  );
  fighter.position.x = round(fighter.position.x + direction.x * amount);
  fighter.position.z = round(fighter.position.z + direction.z * amount);
}

function pushFrom(actor: RumbleFighter, target: RumbleFighter, amount: number): void {
  const direction = normalize2d(
    target.position.x - actor.position.x,
    target.position.z - actor.position.z
  );
  target.position.x = round(target.position.x + direction.x * amount);
  target.position.z = round(target.position.z + direction.z * amount);
}

function scoreFighter(fighter: RumbleFighter): number {
  return (
    fighter.health +
    fighter.stats.damageDealt * 0.65 +
    fighter.stats.ringOuts * 45 +
    fighter.stamina * 0.1
  );
}

function requireFighter(state: RumbleState, id: string): RumbleFighter {
  const fighter = state.fighters.find((candidate) => candidate.id === id);
  if (!fighter) throw new Error(`Unknown RumbleCore fighter "${id}".`);
  return fighter;
}

function aliveFighters(state: RumbleState): RumbleFighter[] {
  return state.fighters.filter((fighter) => fighter.state !== "eliminated");
}

function parseMode(value: unknown): RumbleMode {
  return value === "duel" || value === "team_battle" || value === "royal_rumble"
    ? value
    : "royal_rumble";
}

function parseParticipantIds(value: unknown, mode: RumbleMode): string[] {
  if (Array.isArray(value)) {
    const ids = value.filter((item): item is string => typeof item === "string");
    const required = mode === "duel" ? 2 : 4;
    if (ids.length === required && new Set(ids).size === ids.length) return ids;
  }
  return mode === "duel"
    ? ["pink", "cyan"]
    : ["pink", "cyan", "gold", "lime"];
}

function parseArchetype(value: unknown, index: number): FighterArchetype {
  if (value === "balanced" || value === "heavy" || value === "agile") return value;
  return (["balanced", "heavy", "agile", "balanced"] as const)[index % 4]!;
}

function fighterName(index: number): string {
  return ["The Strategist", "The Heavy", "The Speedster", "The Analyst"][index]!;
}

function actionBranch(type: string, argumentsSchema: JsonSchema): JsonSchema {
  return {
    type: "object",
    required: ["type", "arguments"],
    properties: {
      type: { enum: [type] },
      arguments: argumentsSchema
    }
  };
}

function targetIdFromAction(action?: RumbleAction): string | undefined {
  if (!action) return undefined;
  const args = action.arguments as Record<string, unknown>;
  if (typeof args.targetFighterId === "string") return args.targetFighterId;
  const target = args.target;
  if (target && typeof target === "object" && !Array.isArray(target)) {
    const candidate = target as Record<string, unknown>;
    return typeof candidate.fighterId === "string" ? candidate.fighterId : undefined;
  }
  return undefined;
}

function describeAction(action?: RumbleAction): string | undefined {
  if (!action) return undefined;
  const args = action.arguments as Record<string, unknown>;
  const detail = args.attack ?? args.defense ?? args.action ?? args.abilityId;
  return detail ? `${action.type}:${String(detail)}` : action.type;
}

function combatEvent(
  state: RumbleState,
  type: RumbleCombatEvent["type"],
  actorId: string | undefined,
  targetId: string | undefined,
  value: number | undefined,
  description: string
): RumbleCombatEvent {
  return { id: randomUUID(), round: state.round, type, actorId, targetId, value, description };
}

function rumbleEvent(
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
    metadata: { deterministic: true, seedControlled: true, timingMode: "lockstep" }
  };
}

function rumbleAction<T extends RumbleActionArguments>(
  type: string,
  argumentsValue: T,
  summary: string
): AgentActResult<RumbleAction> {
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

function distance(
  left: { x: number; z: number },
  right: { x: number; z: number }
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function normalize2d(x: number, z: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  return length ? { x: round(x / length), z: round(z / length) } : { x: 0, z: 1 };
}

function seededUnit(seed: number, roundNumber: number, ...parts: string[]): number {
  let value = seed ^ (roundNumber * 0x9e3779b1);
  for (const part of parts.join("|")) {
    value = Math.imul(value ^ part.charCodeAt(0), 16777619);
  }
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function deterministicChoice(id: string, roundNumber: number): boolean {
  return seededUnit(404, roundNumber, id) >= 0.5;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(clamp(value, minimum, maximum))
    : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const environmentFactory: EnvironmentFactory = {
  metadata,
  create: () => new RumbleCoreEnvironment()
};
const agentFactories: AgentFactory[] = (["tactician", "vanguard", "guardian", "skirmisher"] as const).map(
  (policy) => ({
    metadata: new RumbleTacticianAgent(policy).metadata,
    create: () => new RumbleTacticianAgent(policy)
  })
);
const evaluatorFactory: EvaluatorFactory = {
  metadata: new RumbleMatchEvaluator().metadata,
  create: () => new RumbleMatchEvaluator()
};

export const agentRumblePlugin: ArenaPlugin = {
  manifest: {
    id: "arena.agent-rumble",
    name: "Agent Rumble",
    version: "1.0.0",
    description:
      "Seed-controlled arcade combat, neutral toy fighters, deterministic tactics, multi-agent routing, scoring, and replay."
  },
  async register(context) {
    context.environments.register(metadata.id, environmentFactory);
    for (const factory of agentFactories) {
      context.agents.register(factory.metadata.id, factory);
    }
    context.evaluators.register(evaluatorFactory.metadata.id, evaluatorFactory);
  }
};
