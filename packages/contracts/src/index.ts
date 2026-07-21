export type JsonSchema = Record<string, unknown>;

export interface ComponentMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  tags?: string[];
}

export interface EnvironmentMetadata extends ComponentMetadata {
  runtime: string;
}

export interface EnvironmentCapabilities {
  deterministic?: boolean;
  realtime?: boolean;
  multiAgent?: boolean;
  renderable?: boolean;
  supportsSnapshots?: boolean;
  supportsPause?: boolean;
  supportsResume?: boolean;
  supportsSeeding?: boolean;
}

export interface ArtifactReference {
  id: string;
  name: string;
  mediaType: string;
  uri: string;
  size?: number;
}

export interface Observation<T = unknown> {
  id: string;
  episodeId: string;
  step: number;
  timestamp: string;
  data: T;
  activeParticipantId?: string;
  availableActions?: string[];
  attachments?: ArtifactReference[];
}

export interface AgentAction<TArguments = unknown> {
  id: string;
  type: string;
  arguments: TArguments;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface EnvironmentInitializeContext {
  episodeId: string;
  seed?: number;
}

export interface EnvironmentResetInput {
  episodeId: string;
  seed?: number;
  scenario?: Scenario;
}

export interface EnvironmentResetResult<TObservation = unknown, TState = unknown> {
  observation: Observation<TObservation>;
  state: TState;
}

export interface EnvironmentStepResult<TObservation = unknown, TState = unknown> {
  observation: Observation<TObservation>;
  state?: TState;
  reward?: number;
  terminated: boolean;
  truncated: boolean;
  terminationReason?: string;
  events?: ArenaEvent[];
  artifacts?: ArtifactReference[];
  info?: Record<string, unknown>;
}

export interface Environment<
  TObservation = unknown,
  TAction = unknown,
  TState = unknown
> {
  readonly metadata: EnvironmentMetadata;
  initialize(context: EnvironmentInitializeContext): Promise<void>;
  reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<TObservation, TState>>;
  step(
    action: TAction
  ): Promise<EnvironmentStepResult<TObservation, TState>>;
  getState(): Promise<TState>;
  getActionSchema(): JsonSchema;
  getObservationSchema(): JsonSchema;
  getCapabilities(): EnvironmentCapabilities;
  close(): Promise<void>;
}

export interface EnvironmentFactory {
  readonly metadata: EnvironmentMetadata;
  create(): Environment;
}

export interface Scenario {
  id: string;
  name: string;
  environmentId: string;
  environmentVersion?: string;
  seed?: number;
  initialState?: unknown;
  goals?: GoalDefinition[];
  constraints?: ConstraintDefinition[];
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface GoalDefinition {
  id: string;
  description: string;
  target?: unknown;
}

export interface ConstraintDefinition {
  id: string;
  description: string;
  config?: unknown;
}

export interface AgentMetadata extends ComponentMetadata {
  provider?: string;
  model?: string;
}

export interface OpenRouterModelDefinition {
  id: string;
  name: string;
  provider: string;
  featured: boolean;
  automatic?: boolean;
}

/**
 * The judge-facing model catalog. Keep this list explicit so benchmark runs
 * persist a reproducible model slug instead of silently depending on routing.
 */
export const OPENROUTER_MODEL_CATALOG = [
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    provider: "OpenAI",
    featured: true
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    provider: "Anthropic",
    featured: true
  },
  {
    id: "x-ai/grok-4.5",
    name: "Grok 4.5",
    provider: "xAI",
    featured: true
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    featured: true
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    provider: "Moonshot AI",
    featured: true
  },
  {
    id: "meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    provider: "Meta",
    featured: true
  },
  {
    id: "openrouter/auto",
    name: "OpenRouter Auto",
    provider: "OpenRouter",
    featured: false,
    automatic: true
  }
] as const satisfies readonly OpenRouterModelDefinition[];

export const DEFAULT_OPENROUTER_MODEL_ID = OPENROUTER_MODEL_CATALOG[0].id;

export function openRouterAgentId(modelId: string): string {
  return `openrouter:${modelId}`;
}

export interface AgentInitializeContext {
  episodeId: string;
  environment: EnvironmentMetadata;
  actionSchema: JsonSchema;
  seed?: number;
  participant?: ExperimentParticipant;
}

export interface AgentActInput<TObservation = unknown> {
  observation: Observation<TObservation>;
  actionSchema: JsonSchema;
  step: number;
}

export interface AgentActResult<TAction = unknown> {
  action: TAction;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}

export interface AgentFeedback {
  episodeId: string;
  step: number;
  reward?: number;
  info?: Record<string, unknown>;
}

export interface Agent<TObservation = unknown, TAction = unknown> {
  readonly metadata: AgentMetadata;
  initialize(context: AgentInitializeContext): Promise<void>;
  act(input: AgentActInput<TObservation>): Promise<AgentActResult<TAction>>;
  receiveFeedback?(feedback: AgentFeedback): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface AgentFactory {
  readonly metadata: AgentMetadata;
  create(): Agent;
}

export interface EpisodeLimits {
  maxSteps?: number;
  maxDurationMs?: number;
  maxTokens?: number;
  maxCostUsd?: number;
  maxToolCalls?: number;
}

export interface ExperimentConfig {
  id?: string;
  name: string;
  environmentId: string;
  agentId: string;
  participants?: ExperimentParticipant[];
  evaluatorIds: string[];
  scenario?: Scenario;
  seed?: number;
  episodeLimits: EpisodeLimits;
}

export type ParticipantKind = "agent" | "human";

export interface ExperimentParticipant {
  id: string;
  kind: ParticipantKind;
  agentId?: string;
  displayName?: string;
  role?: string;
  metadata?: Record<string, unknown>;
}

export type RunStatus =
  | "created"
  | "initializing"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface EvaluationMetric {
  name: string;
  value: number | boolean | string;
  unit?: string;
  description?: string;
}

export interface EpisodeEvaluationResult {
  evaluatorId: string;
  score?: number;
  passed?: boolean;
  metrics: EvaluationMetric[];
  summary?: string;
}

export interface EvaluationContext {
  runId: string;
  episodeId: string;
  config: ExperimentConfig;
}

export interface StepEvaluationInput {
  context: EvaluationContext;
  action: AgentAction;
  result: EnvironmentStepResult;
  step: number;
}

export interface EpisodeEvaluationInput {
  context: EvaluationContext;
  events: ArenaEvent[];
  finalState: unknown;
  steps: number;
  terminationReason?: string;
}

export interface Evaluator {
  readonly metadata: ComponentMetadata;
  onEpisodeStart?(context: EvaluationContext): Promise<void>;
  onEvent?(event: ArenaEvent): Promise<void>;
  onStep?(input: StepEvaluationInput): Promise<void>;
  evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult>;
}

export interface EvaluatorFactory {
  readonly metadata: ComponentMetadata;
  create(): Evaluator;
}

export interface EnvironmentSession {
  id: string;
  runtimeId: string;
  environmentId: string;
  status: "starting" | "ready" | "running" | "stopped" | "failed";
  metadata?: Record<string, unknown>;
}

export interface RuntimeLaunchRequest {
  environment: Environment;
  episodeId: string;
  seed?: number;
}

export interface RuntimeHandle {
  session: EnvironmentSession;
  environment: Environment;
}

export interface EnvironmentRuntime {
  readonly id: string;
  launch(request: RuntimeLaunchRequest): Promise<RuntimeHandle>;
  terminate(handle: RuntimeHandle): Promise<void>;
}

export interface ArenaEvent<TPayload = unknown> {
  id: string;
  type: string;
  timestamp: string;
  experimentId?: string;
  runId?: string;
  episodeId?: string;
  sessionId?: string;
  step?: number;
  source: string;
  traceId?: string;
  parentEventId?: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
}

export interface EventFilter {
  runId?: string;
  episodeId?: string;
  type?: string;
}

export type EventHandler = (event: ArenaEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface EventBus {
  publish(event: ArenaEvent): Promise<void>;
  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe;
}

export interface ReplayFrame<TState = unknown> {
  episodeId: string;
  step: number;
  timestamp: string;
  state?: TState;
  events: ArenaEvent[];
  artifacts?: ArtifactReference[];
}

export interface RunRecord {
  id: string;
  episodeId: string;
  experimentId: string;
  config: ExperimentConfig;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  steps: number;
  finalState?: unknown;
  terminationReason?: string;
  evaluations: EpisodeEvaluationResult[];
  events: ArenaEvent[];
  replay: ReplayFrame[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  error?: ArenaError;
}

export interface RunRepository {
  create(run: RunRecord): Promise<void>;
  save(run: RunRecord): Promise<void>;
  get(id: string): Promise<RunRecord | undefined>;
  list(): Promise<RunRecord[]>;
}

export interface ArenaError {
  code: string;
  message: string;
  category:
    | "agent"
    | "environment"
    | "runtime"
    | "tool"
    | "evaluation"
    | "storage"
    | "validation"
    | "system";
  recoverable: boolean;
  metadata?: Record<string, unknown>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export interface RegistryLike<T> {
  register(id: string, value: T): void;
  unregister(id: string): void;
  resolve(id: string): T;
  has(id: string): boolean;
  list(): Array<{ id: string; value: T }>;
}

export interface PluginRegistrationContext {
  environments: RegistryLike<EnvironmentFactory>;
  agents: RegistryLike<AgentFactory>;
  evaluators: RegistryLike<EvaluatorFactory>;
  runtimes: RegistryLike<EnvironmentRuntime>;
}

export interface ArenaPlugin {
  readonly manifest: PluginManifest;
  register(context: PluginRegistrationContext): Promise<void>;
  initialize?(): Promise<void>;
  dispose?(): Promise<void>;
}
