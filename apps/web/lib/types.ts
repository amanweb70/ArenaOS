import type {
  AgentMetadata,
  ArenaEvent,
  ComponentMetadata,
  EnvironmentCapabilities,
  EnvironmentMetadata,
  RunRecord
} from "@arena/contracts";

export type EnvironmentSummary = EnvironmentMetadata & {
  capabilities: EnvironmentCapabilities;
};

export type AgentSummary = AgentMetadata;
export type EvaluatorSummary = ComponentMetadata;

export type RunStartResponse = {
  runId: string;
  episodeId: string;
  status: RunRecord["status"];
  streamUrl: string;
};

export type EnvironmentBuildStatus =
  | "created" | "generating" | "validating" | "awaiting_approval"
  | "approved" | "failed" | "cancelled";

export type EnvironmentBuildEvent = {
  id: string;
  type: string;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
};

export type EnvironmentBuildRecord = {
  id: string;
  status: EnvironmentBuildStatus;
  request: {
    prompt: string;
    category?: string;
    visualStyle?: string;
    mechanics?: string;
    agents?: string;
    scoring?: string;
  };
  createdAt: string;
  updatedAt: string;
  environmentId?: string;
  error?: string;
  events: EnvironmentBuildEvent[];
  validation: Array<{ id: string; label: string; status: "passed" | "failed"; detail: string }>;
};

export type EnvironmentBuildArtifact = { path: string; mediaType: string; content: string };
export type GeneratedEnvironmentPreview = {
  manifest: {
    id: string; name: string; description: string; instructions: string; category: string; tags: string[];
    visual: { style: string; accent: string; background: string; agentGlyph: string; goalGlyph: string };
    world: { width: number; height: number; start: GridPosition; goal: GridPosition; obstacles: GridPosition[] };
    mechanics: { maxSteps: number; moveReward: number; collisionPenalty: number; goalReward: number };
  };
  state: GridState & { score: number };
};

export type StreamPacket =
  | { type: "snapshot"; run: RunRecord }
  | { type: "event"; event: ArenaEvent };

export type GridPosition = { x: number; y: number };

export type GridState = {
  width: number;
  height: number;
  agent: GridPosition;
  goal: GridPosition;
  obstacles: GridPosition[];
  step: number;
  maxSteps: number;
  collisions: number;
};

export type StepPayload = {
  action?: {
    type: string;
    arguments: Record<string, unknown>;
    summary?: string;
  };
  observation?: { data?: unknown };
  state?: unknown;
  reward?: number;
  terminated?: boolean;
  truncated?: boolean;
  info?: Record<string, unknown>;
};

export type ChessSide = "white" | "black";
export type ChessPieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";

export type RoyalChessMoveRecord = {
  ply: number;
  side: ChessSide;
  from: string;
  to: string;
  san: string;
  uci: string;
  piece: ChessPieceSymbol;
  captured?: ChessPieceSymbol;
  promotion?: ChessPieceSymbol;
  flags: string;
  fenBefore: string;
  fenAfter: string;
  inCheck: boolean;
  isCheckmate: boolean;
};

export type RoyalChessPiece = {
  square: string;
  type: ChessPieceSymbol;
  side: ChessSide;
};

export type RoyalChessState = {
  fen: string;
  pgn: string;
  turn: ChessSide;
  ply: number;
  fullMoveNumber: number;
  status: "ready" | "running" | "completed";
  inCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  result?: {
    type: string;
    winner?: ChessSide;
    loser?: ChessSide;
    reason: string;
  };
  lastMove?: RoyalChessMoveRecord;
  history: RoyalChessMoveRecord[];
  board: RoyalChessPiece[];
  capturedPieces: {
    white: ChessPieceSymbol[];
    black: ChessPieceSymbol[];
  };
  invalidActions: { white: number; black: number };
  participants: { white: string; black: string };
  maxPlies: number;
};

export type BioCraftToolInvocation = {
  id: string;
  tool: string;
  status: "completed" | "failed";
  inputs: Record<string, unknown>;
  output?: Record<string, unknown>;
  outputSummary?: string;
  error?: string;
  durationMs: number;
  backend: string;
  artifactIds: string[];
  step: number;
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
    annotations: Array<{
      id: string;
      type: string;
      label: string;
      start: number;
      end: number;
      source: string;
    }>;
    candidateMutations: Array<{
      mutation: string;
      position: number;
      referenceResidue: string;
      alternateResidue: string;
    }>;
  };
  workspace: {
    selectedSequenceId?: string;
    selectedResidue?: number;
    activeStructureId?: string;
    generatedMutationIds: string[];
    notes: Array<{
      id: string;
      category: string;
      content: string;
      evidenceIds: string[];
      createdAtStep: number;
    }>;
  };
  toolHistory: BioCraftToolInvocation[];
  artifacts: Array<{
    id: string;
    name: string;
    mediaType: string;
    uri: string;
    size?: number;
  }>;
  budget: {
    toolCallsUsed: number;
    maxToolCalls: number;
    elapsedMs: number;
    maxRuntimeMs: number;
  };
  availableTools: string[];
  unavailableTools: Array<{ id: string; reason: string }>;
  submission?: {
    rankedCandidates: Array<{
      mutation: string;
      rank: number;
      predictedEffect: string;
      confidence: number;
      evidenceIds: string[];
      justification: string;
    }>;
    recommendedMutation: string;
    overallConfidence: number;
    limitations: string[];
    summary: string;
  };
  evaluation?: {
    overallScore: number;
    rankingScore: number;
    recommendationScore: number;
    evidenceGroundingScore: number;
    constraintComplianceScore: number;
    toolEfficiencyScore: number;
    confidenceScore: number;
    completenessScore: number;
    groundTruth: {
      labelType: string;
      methodology: string;
      rankedCandidates: string[];
      recommendedMutation: string;
    };
  };
  reproducibility: {
    pluginVersion: string;
    challengeVersion: string;
    backend: string;
    backendVersion: string;
    seed?: number;
    networkAccess: false;
  };
};

export type ChemCraftMolecule = {
  id: string;
  name: string;
  smiles: string;
  canonicalSmiles: string;
  kind: "lead" | "candidate" | "generated";
  atomCount: number;
  bondCount: number;
  depictionSvg?: string;
  descriptors?: {
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
  };
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
  conformer?: {
    method: string;
    optimization: string;
    converged: boolean;
    forceFieldEnergy: number;
    energyUnits: string;
    seed: number;
    atoms: Array<{
      index: number;
      element: string;
      x: number;
      y: number;
      z: number;
    }>;
    bonds: Array<{ begin: number; end: number; order: number }>;
    molBlock: string;
    limitation: string;
  };
  backend: string;
  backendVersion: string;
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
    molecules: ChemCraftMolecule[];
    candidateSetIds: string[];
    transformationIds: string[];
    reactionTemplateIds: string[];
  };
  constraints: {
    requiredSubstructures: Array<{
      id: string;
      smarts: string;
      description: string;
    }>;
    forbiddenSubstructures: Array<{
      id: string;
      smarts: string;
      description: string;
    }>;
    allowedElements: string[];
    maxFormalChargeMagnitude: number;
    maxFragments: number;
    descriptorRanges: Record<string, { min?: number; max?: number }>;
    minimumSimilarityToLead: {
      fingerprint: "morgan";
      metric: "tanimoto";
      threshold: number;
    };
  };
  workspace: {
    selectedMoleculeId?: string;
    selectedConformerId?: string;
    selectedAtomIndices: number[];
    comparisonMoleculeIds: string[];
    generatedMoleculeIds: string[];
    notes: Array<{
      id: string;
      category: string;
      content: string;
      moleculeIds: string[];
      evidenceIds: string[];
      createdAtStep: number;
    }>;
  };
  toolHistory: Array<{
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
    artifactIds: string[];
    step: number;
  }>;
  artifacts: Array<{
    id: string;
    name: string;
    mediaType: string;
    uri: string;
    size?: number;
  }>;
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
  submission?: {
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
  evaluation?: {
    overallScore: number;
    candidateQualityScore: number;
    rankingScore: number;
    constraintSatisfactionScore: number;
    evidenceGroundingScore: number;
    toolEfficiencyScore: number;
    confidenceScore: number;
    completenessScore: number;
    candidateUtilities: Record<string, number>;
    groundTruth: {
      methodology: string;
      ranking: string[];
      recommendedMoleculeId: string;
    };
  };
  reproducibility: {
    arenaVersion: string;
    pluginVersion: string;
    challengeVersion: string;
    assetHashes: Record<string, string>;
    rdkitVersion: string;
    pythonVersion: string;
    seed: number;
    networkAccess: false;
  };
};

export type RumbleFighter = {
  id: string;
  displayName: string;
  teamId?: string;
  archetype: "balanced" | "heavy" | "agile";
  color: string;
  position: { x: number; y: number; z: number };
  facing: { x: number; z: number };
  health: number;
  maxHealth: number;
  stamina: number;
  abilityCharge: number;
  knockback: number;
  state:
    | "idle"
    | "moving"
    | "attacking"
    | "guarding"
    | "dodging"
    | "staggered"
    | "grappling"
    | "eliminated";
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
  type: string;
  actorId?: string;
  targetId?: string;
  value?: number;
  description: string;
};

export type RumbleState = {
  matchId: string;
  mode: "duel" | "team_battle" | "royal_rumble";
  timingMode: "lockstep";
  status: "ready" | "running" | "completed";
  seed: number;
  round: number;
  maxRounds: number;
  elapsedMs: number;
  decisionIntervalMs: number;
  arena: {
    id: "neon-coliseum" | "crownfall-coliseum";
    name: string;
    radius: number;
    center: { x: 0; z: 0 };
    hazardPulseEveryRounds: number;
    currentPulse: number;
  };
  fighters: RumbleFighter[];
  activeParticipantId: string;
  recentEvents: RumbleCombatEvent[];
  eventHistory: RumbleCombatEvent[];
  teamScores: Record<string, number>;
  winner?: {
    fighterId?: string;
    teamId?: string;
    reason: string;
  };
  eliminationOrder: string[];
};

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
  phase: string;
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
  audienceReaction: string;
  audienceDelta: number;
  caughtBluff?: boolean;
};

export type CouncilEvent = {
  id: string;
  round: number;
  phase: string;
  type: string;
  actorId?: string;
  targetId?: string;
  description: string;
  deltas?: Record<string, number>;
};

export type PersonaCraftState = {
  sessionId: string;
  mode: "debate" | "negotiation" | "crisis" | "trial" | "social_deduction";
  status: "ready" | "running" | "completed";
  timingMode: "turn_based";
  seed: number;
  round: number;
  maxRounds: number;
  phase:
    | "speaking"
    | "cross_examination"
    | "negotiation"
    | "voting"
    | "completed";
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
    dominantReaction: string;
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

export type PhysicalAIPose = { x: number; y: number; z: number; heading: number };
export type PhysicalAIRobot = {
  id: string;
  displayName: string;
  type: "mobile" | "fixed_arm";
  color: string;
  pose: PhysicalAIPose;
  status: string;
  battery: number;
  payloadObjectId?: string;
  currentAction?: string;
  assignedParticipantId?: string;
  capabilities: string[];
  sensors: Record<string, boolean>;
  stats: {
    distanceTravelled: number;
    energyUsed: number;
    actions: number;
    invalidActions: number;
    collisions: number;
    hazardContacts: number;
    inspections: number;
    recoveryActions: number;
  };
};
export type PhysicalAIObject = {
  id: string;
  label: string;
  type: "package" | "obstacle" | "hazard" | "station" | "conveyor";
  pose: PhysicalAIPose;
  state: string;
  movable: boolean;
  inspected: boolean;
  carrierRobotId?: string;
};
export type PhysicalAIState = {
  missionId: string;
  missionName: string;
  status: "ready" | "running" | "completed" | "failed";
  phase: string;
  mode: "single_supervisor" | "two_agent_cooperation" | "human_agent_team";
  seed: number;
  step: number;
  sequence: number;
  simulationTime: number;
  timeLimitSeconds: number;
  completionPercent: number;
  activeParticipantId: string;
  participantIds: string[];
  actedThisCycle: string[];
  backend: {
    adapter: "arena-reference" | "nvidia-isaac-sim";
    connected: boolean;
    bridgeVersion: string;
    protocolVersion: string;
    isaacAvailable: boolean;
    streamingAvailable: boolean;
    physicsEngine: "seeded-reference" | "physx";
    reproducibility: string;
    disclosure: string;
  };
  robots: PhysicalAIRobot[];
  objects: PhysicalAIObject[];
  zones: Array<{
    id: string;
    label: string;
    type: string;
    center: { x: number; z: number };
    radius: number;
    state: string;
  }>;
  objectives: Array<{
    id: string;
    label: string;
    description: string;
    status: "pending" | "active" | "completed" | "failed";
    completedAtStep?: number;
  }>;
  plan?: {
    summary: string;
    assignments: Array<{ robotId: string; objective: string }>;
  };
  metrics: {
    collisions: number;
    hazardContacts: number;
    energyUsed: number;
    distanceTravelled: number;
    validActions: number;
    invalidActions: number;
    usefulSignals: number;
    duplicateTaskAttempts: number;
    recoveries: number;
    scoreEstimate: number;
  };
  knownObjectIds: string[];
  activeSignals: Array<{ fromId: string; signal: string; targetId?: string; step: number }>;
  recentEvents: PhysicalAIEvent[];
  eventHistory: PhysicalAIEvent[];
  snapshots: Array<{ id: string; step: number; phase: string; reason: string }>;
  result?: {
    success: boolean;
    reason: string;
    deliveredObjectId?: string;
    finalScore: number;
  };
};
export type PhysicalAIEvent = {
  id: string;
  sequence: number;
  simulationTime: number;
  type: string;
  actorId?: string;
  targetId?: string;
  description: string;
  result: string;
};
