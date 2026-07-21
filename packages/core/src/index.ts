import { Ajv } from "ajv";
import {
  type AgentAction,
  type AgentActResult,
  type AgentFactory,
  type ArenaError,
  type ArenaEvent,
  type ArenaPlugin,
  type EnvironmentFactory,
  type EnvironmentRuntime,
  type EpisodeEvaluationResult,
  type Evaluator,
  type EvaluatorFactory,
  type EventBus,
  type EventFilter,
  type EventHandler,
  type ExperimentConfig,
  type ExperimentParticipant,
  type PluginRegistrationContext,
  type RegistryLike,
  type ReplayFrame,
  type RunRecord,
  type RunRepository,
  type RuntimeHandle,
  type RuntimeLaunchRequest,
  type Unsubscribe
} from "@arena/contracts";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export class Registry<T> implements RegistryLike<T> {
  readonly #values = new Map<string, T>();

  register(id: string, value: T): void {
    if (this.#values.has(id)) {
      throw new Error(`Registry entry "${id}" is already registered.`);
    }
    this.#values.set(id, value);
  }

  unregister(id: string): void {
    this.#values.delete(id);
  }

  resolve(id: string): T {
    const value = this.#values.get(id);
    if (!value) {
      throw new Error(`Registry entry "${id}" was not found.`);
    }
    return value;
  }

  has(id: string): boolean {
    return this.#values.has(id);
  }

  list(): Array<{ id: string; value: T }> {
    return [...this.#values.entries()].map(([id, value]) => ({ id, value }));
  }
}

export interface ArenaRegistries {
  environments: Registry<EnvironmentFactory>;
  agents: Registry<AgentFactory>;
  evaluators: Registry<EvaluatorFactory>;
  runtimes: Registry<EnvironmentRuntime>;
}

export function createRegistries(): ArenaRegistries {
  return {
    environments: new Registry(),
    agents: new Registry(),
    evaluators: new Registry(),
    runtimes: new Registry()
  };
}

export class PluginManager {
  readonly #plugins = new Map<string, ArenaPlugin>();

  constructor(
    private readonly context: PluginRegistrationContext
  ) {}

  async register(plugin: ArenaPlugin): Promise<void> {
    if (this.#plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered.`);
    }
    await plugin.register(this.context);
    await plugin.initialize?.();
    this.#plugins.set(plugin.manifest.id, plugin);
  }

  list(): ArenaPlugin[] {
    return [...this.#plugins.values()];
  }

  async dispose(): Promise<void> {
    for (const plugin of [...this.#plugins.values()].reverse()) {
      await plugin.dispose?.();
    }
    this.#plugins.clear();
  }
}

interface Subscription {
  filter: EventFilter;
  handler: EventHandler;
}

export class InMemoryEventBus implements EventBus {
  readonly #subscriptions = new Set<Subscription>();

  async publish(event: ArenaEvent): Promise<void> {
    const handlers = [...this.#subscriptions]
      .filter(({ filter }) => matchesFilter(event, filter))
      .map(({ handler }) => handler(event));
    await Promise.all(handlers);
  }

  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe {
    const subscription = { filter, handler };
    this.#subscriptions.add(subscription);
    return () => this.#subscriptions.delete(subscription);
  }
}

function matchesFilter(event: ArenaEvent, filter: EventFilter): boolean {
  return (
    (!filter.runId || event.runId === filter.runId) &&
    (!filter.episodeId || event.episodeId === filter.episodeId) &&
    (!filter.type || event.type === filter.type)
  );
}

export function createEvent<TPayload>(
  type: string,
  source: string,
  payload: TPayload,
  context: {
    experimentId?: string;
    runId?: string;
    episodeId?: string;
    sessionId?: string;
    step?: number;
    traceId?: string;
  } = {}
): ArenaEvent<TPayload> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    source,
    payload,
    ...context
  };
}

export class InMemoryRunRepository implements RunRepository {
  readonly #runs = new Map<string, RunRecord>();

  async create(run: RunRecord): Promise<void> {
    if (this.#runs.has(run.id)) {
      throw new Error(`Run "${run.id}" already exists.`);
    }
    this.#runs.set(run.id, structuredClone(run));
  }

  async save(run: RunRecord): Promise<void> {
    this.#runs.set(run.id, structuredClone(run));
  }

  async get(id: string): Promise<RunRecord | undefined> {
    const run = this.#runs.get(id);
    return run ? structuredClone(run) : undefined;
  }

  async list(): Promise<RunRecord[]> {
    return [...this.#runs.values()]
      .map((run) => structuredClone(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listSummaries(): Promise<RunRecord[]> {
    return (await this.list()).map(summarizeRun);
  }
}

export class FileRunRepository implements RunRepository {
  #summaryCache?: RunRecord[];

  constructor(private readonly directory: string) {}

  async create(run: RunRecord): Promise<void> {
    const existing = await this.get(run.id);
    if (existing) {
      throw new Error(`Run "${run.id}" already exists.`);
    }
    await this.save(run);
  }

  async save(run: RunRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const target = this.pathFor(run.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    await rename(temporary, target);
    await this.saveSummary(run);
    this.#summaryCache = undefined;
  }

  async get(id: string): Promise<RunRecord | undefined> {
    try {
      const contents = await readFile(this.pathFor(id), "utf8");
      return JSON.parse(contents) as RunRecord;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async list(): Promise<RunRecord[]> {
    try {
      const entries = await readdir(this.directory);
      const runs = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map(async (entry) => {
            const contents = await readFile(join(this.directory, entry), "utf8");
            return JSON.parse(contents) as RunRecord;
          })
      );
      return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async listSummaries(): Promise<RunRecord[]> {
    if (this.#summaryCache) return structuredClone(this.#summaryCache);
    try {
      const entries = (await readdir(this.directory)).filter((entry) => entry.endsWith(".json"));
      const summaries = await Promise.all(entries.map(async (entry) => {
        const id = entry.slice(0, -".json".length);
        try {
          const contents = await readFile(this.summaryPathFor(id), "utf8");
          return JSON.parse(contents) as RunRecord;
        } catch (error) {
          if (!isNodeError(error) || error.code !== "ENOENT") throw error;
          const run = await this.get(id);
          if (!run) throw new Error(`Run "${id}" disappeared while creating its summary.`);
          await this.saveSummary(run);
          return summarizeRun(run);
        }
      }));
      this.#summaryCache = summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return structuredClone(this.#summaryCache);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      throw error;
    }
  }

  private async saveSummary(run: RunRecord): Promise<void> {
    const target = this.summaryPathFor(run.id);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(summarizeRun(run), null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  private summaryPathFor(id: string): string {
    const directory = join(this.directory, ".summaries");
    const path = join(directory, `${id}.json`);
    if (dirname(path) !== directory) throw new Error("Invalid run id.");
    return path;
  }

  private pathFor(id: string): string {
    const path = join(this.directory, `${id}.json`);
    if (dirname(path) !== this.directory) {
      throw new Error("Invalid run id.");
    }
    return path;
  }
}

function summarizeRun(run: RunRecord): RunRecord {
  return {
    ...structuredClone(run),
    finalState: undefined,
    events: [],
    replay: []
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export class InProcessRuntime implements EnvironmentRuntime {
  readonly id = "in-process";

  async launch(request: RuntimeLaunchRequest): Promise<RuntimeHandle> {
    const session = {
      id: randomUUID(),
      runtimeId: this.id,
      environmentId: request.environment.metadata.id,
      status: "starting" as const
    };
    await request.environment.initialize({
      episodeId: request.episodeId,
      seed: request.seed
    });
    return {
      session: { ...session, status: "ready" },
      environment: request.environment
    };
  }

  async terminate(handle: RuntimeHandle): Promise<void> {
    await handle.environment.close();
    handle.session.status = "stopped";
  }
}

export interface ExperimentOrchestratorOptions {
  registries: ArenaRegistries;
  eventBus: EventBus;
  runRepository: RunRepository;
}

export interface StartedExperiment {
  run: RunRecord;
  completion: Promise<RunRecord>;
}

export class ExperimentOrchestrator {
  readonly #ajv = new Ajv({ allErrors: true, strict: false });
  readonly #pendingExternalActions = new Map<
    string,
    {
      participantId: string;
      resolve: (action: AgentAction) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly options: ExperimentOrchestratorOptions) {}

  async startExperiment(config: ExperimentConfig): Promise<StartedExperiment> {
    const experimentId = config.id ?? randomUUID();
    const runId = randomUUID();
    const episodeId = randomUUID();
    const traceId = randomUUID();
    const createdAt = new Date().toISOString();
    const run: RunRecord = {
      id: runId,
      episodeId,
      experimentId,
      config: { ...config, id: experimentId },
      status: "created",
      createdAt,
      steps: 0,
      evaluations: [],
      events: [],
      replay: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0
      }
    };
    await this.options.runRepository.create(run);

    const completion = this.executeExperiment(config, run, {
      experimentId,
      runId,
      episodeId,
      traceId
    });
    return { run: structuredClone(run), completion };
  }

  async runExperiment(config: ExperimentConfig): Promise<RunRecord> {
    const started = await this.startExperiment(config);
    return started.completion;
  }

  submitExternalAction(
    runId: string,
    participantId: string,
    action: AgentAction
  ): boolean {
    const pending = this.#pendingExternalActions.get(runId);
    if (!pending || pending.participantId !== participantId) return false;
    clearTimeout(pending.timer);
    this.#pendingExternalActions.delete(runId);
    pending.resolve(action);
    return true;
  }

  private async executeExperiment(
    config: ExperimentConfig,
    run: RunRecord,
    identity: {
      experimentId: string;
      runId: string;
      episodeId: string;
      traceId: string;
    }
  ): Promise<RunRecord> {
    const { experimentId, runId, episodeId, traceId } = identity;

    let runtimeHandle: RuntimeHandle | undefined;
    let agents: Array<{
      participant: ExperimentParticipant;
      agent: ReturnType<AgentFactory["create"]>;
    }> = [];
    let evaluators: Evaluator[] = [];

    const eventContext = {
      experimentId,
      runId,
      episodeId,
      traceId
    };

    const publish = async (event: ArenaEvent): Promise<void> => {
      run.events.push(event);
      await this.options.eventBus.publish(event);
      await Promise.all(evaluators.map((evaluator) => evaluator.onEvent?.(event)));
    };

    try {
      await publish(
        createEvent("experiment.created", "orchestrator", { config }, eventContext)
      );
      run.status = "initializing";
      run.startedAt = new Date().toISOString();
      await publish(
        createEvent("experiment.started", "orchestrator", {}, eventContext)
      );

      const environmentFactory =
        this.options.registries.environments.resolve(config.environmentId);
      const participants = resolveParticipants(config);
      const evaluatorFactories = config.evaluatorIds.map((id) =>
        this.options.registries.evaluators.resolve(id)
      );
      const runtime = this.options.registries.runtimes.resolve(
        environmentFactory.metadata.runtime
      );

      const environment = environmentFactory.create();
      agents = participants
        .filter(
          (participant): participant is ExperimentParticipant & { agentId: string } =>
            participant.kind === "agent" && Boolean(participant.agentId)
        )
        .map((participant) => ({
          participant,
          agent: this.options.registries.agents.resolve(participant.agentId).create()
        }));
      evaluators = evaluatorFactories.map((factory) => factory.create());
      const evaluationContext = { runId, episodeId, config: run.config };

      await publish(
        createEvent(
          "runtime.launch_requested",
          "orchestrator",
          { runtimeId: runtime.id },
          eventContext
        )
      );
      runtimeHandle = await runtime.launch({
        environment,
        episodeId,
        seed: config.seed
      });
      await publish(
        createEvent(
          "runtime.ready",
          runtime.id,
          { session: runtimeHandle.session },
          { ...eventContext, sessionId: runtimeHandle.session.id }
        )
      );

      await Promise.all(
        agents.map(({ agent, participant }) =>
          agent.initialize({
            episodeId,
            environment: environment.metadata,
            actionSchema: environment.getActionSchema(),
            seed: config.seed,
            participant
          })
        )
      );
      await Promise.all(
        evaluators.map((evaluator) =>
          evaluator.onEpisodeStart?.(evaluationContext)
        )
      );
      for (const { agent, participant } of agents) {
        await publish(
          createEvent(
            "agent.initialized",
            agent.metadata.id,
            { metadata: agent.metadata, participant },
            eventContext
          )
        );
      }

      const reset = await environment.reset({
        episodeId,
        seed: config.seed,
        scenario: config.scenario
      });
      await publish(
        createEvent(
          "environment.reset",
          environment.metadata.id,
          { state: reset.state },
          eventContext
        )
      );
      await publish(
        createEvent(
          "environment.observation",
          environment.metadata.id,
          { observation: reset.observation },
          { ...eventContext, step: 0 }
        )
      );

      run.status = "running";
      await publish(
        createEvent("episode.started", "orchestrator", {}, eventContext)
      );
      await this.options.runRepository.save(run);

      const validateAction = this.#ajv.compile(environment.getActionSchema());
      let observation = reset.observation;
      let finalState: unknown = reset.state;
      let terminated = false;
      let terminationReason: string | undefined;
      const maxSteps = config.episodeLimits.maxSteps ?? 100;
      const deadline =
        config.episodeLimits.maxDurationMs === undefined
          ? undefined
          : Date.now() + config.episodeLimits.maxDurationMs;

      for (let step = 1; step <= maxSteps && !terminated; step += 1) {
        if (deadline !== undefined && Date.now() > deadline) {
          terminationReason = "max_duration";
          break;
        }

        const activeParticipantId =
          observation.activeParticipantId ?? participants[0]?.id;
        const activeParticipant = participants.find(
          (participant) => participant.id === activeParticipantId
        );
        if (!activeParticipant) {
          throw new Error(
            `Environment requested unknown participant "${activeParticipantId}".`
          );
        }
        const active = agents.find(
          ({ participant }) => participant.id === activeParticipant.id
        );
        const pendingExternalAction =
          activeParticipant.kind === "human"
            ? this.waitForExternalAction(runId, activeParticipant.id)
            : undefined;

        await publish(
          createEvent(
            "agent.action_requested",
            "orchestrator",
            {
              observationId: observation.id,
              participant: activeParticipant
            },
            { ...eventContext, step }
          )
        );
        let actionResult: AgentActResult;
        let actionSource: string;
        if (activeParticipant.kind === "human") {
          actionResult = { action: await pendingExternalAction! };
          actionSource = `human:${activeParticipant.id}`;
        } else {
          if (!active) {
            throw new Error(
              `No agent instance exists for participant "${activeParticipant.id}".`
            );
          }
          actionResult = await active.agent.act({
            observation,
            actionSchema: environment.getActionSchema(),
            step
          });
          actionSource = active.agent.metadata.id;
        }
        const action = actionResult.action as AgentAction;
        await publish(
          createEvent(
            "agent.action_generated",
            actionSource,
            {
              action,
              usage: actionResult.usage,
              participant: activeParticipant
            },
            { ...eventContext, step }
          )
        );

        if (actionResult.usage) {
          const inputTokens = actionResult.usage.inputTokens ?? 0;
          const outputTokens = actionResult.usage.outputTokens ?? 0;
          const costUsd = actionResult.usage.costUsd ?? 0;
          run.usage ??= {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0
          };
          run.usage.inputTokens += inputTokens;
          run.usage.outputTokens += outputTokens;
          run.usage.totalTokens += inputTokens + outputTokens;
          run.usage.costUsd += costUsd;
          await publish(
            createEvent(
              "agent.usage_recorded",
              actionSource,
              {
                usage: actionResult.usage,
                cumulative: { ...run.usage },
                participant: activeParticipant
              },
              { ...eventContext, step }
            )
          );

          const tokenLimit = config.episodeLimits.maxTokens;
          const costLimit = config.episodeLimits.maxCostUsd;
          const tokenLimitExceeded =
            tokenLimit !== undefined && run.usage.totalTokens > tokenLimit;
          const costLimitExceeded =
            costLimit !== undefined && run.usage.costUsd > costLimit;
          if (tokenLimitExceeded || costLimitExceeded) {
            run.steps = step;
            terminationReason = tokenLimitExceeded
              ? "max_tokens"
              : "max_cost";
            await publish(
              createEvent(
                "episode.limit_reached",
                "orchestrator",
                {
                  limit: terminationReason,
                  configured: tokenLimitExceeded ? tokenLimit : costLimit,
                  usage: { ...run.usage }
                },
                { ...eventContext, step }
              )
            );
            break;
          }
        }

        if (!validateAction(action)) {
          run.steps = step;
          await publish(
            createEvent(
              "agent.action_rejected",
              "action-validator",
              {
                action,
                errors: validateAction.errors ?? []
              },
              { ...eventContext, step }
            )
          );
          continue;
        }

        await publish(
          createEvent(
            "agent.action_validated",
            "action-validator",
            { action },
            { ...eventContext, step }
          )
        );
        const stepResult = await environment.step(action);
        run.steps = step;
        observation = stepResult.observation;
        finalState = stepResult.state ?? (await environment.getState());
        terminated = stepResult.terminated || stepResult.truncated;
        terminationReason = stepResult.terminationReason;

        await publish(
          createEvent(
            "environment.step_completed",
            environment.metadata.id,
            {
              action,
              observation,
              state: finalState,
              reward: stepResult.reward,
              terminated: stepResult.terminated,
              truncated: stepResult.truncated,
              info: stepResult.info
            },
            { ...eventContext, step }
          )
        );

        for (const event of stepResult.events ?? []) {
          await publish({
            ...event,
            experimentId,
            runId,
            episodeId,
            sessionId: runtimeHandle.session.id,
            step,
            traceId
          });
        }

        await Promise.all(
          evaluators.map((evaluator) =>
            evaluator.onStep?.({
              context: evaluationContext,
              action,
              result: stepResult,
              step
            })
          )
        );
        await active?.agent.receiveFeedback?.({
          episodeId,
          step,
          reward: stepResult.reward,
          info: stepResult.info
        });

        const frameEvents = run.events.filter((event) => event.step === step);
        const frame: ReplayFrame = {
          episodeId,
          step,
          timestamp: new Date().toISOString(),
          state: structuredClone(finalState),
          events: structuredClone(frameEvents),
          artifacts: stepResult.artifacts
        };
        run.replay.push(frame);
      }

      if (!terminated && !terminationReason) {
        terminationReason =
          run.steps >= maxSteps ? "max_steps" : "max_duration";
      }

      run.finalState = finalState;
      run.terminationReason = terminationReason;
      const evaluationInput = {
        context: evaluationContext,
        events: run.events,
        finalState,
        steps: run.steps,
        terminationReason
      };
      const evaluations: EpisodeEvaluationResult[] = [];
      for (const evaluator of evaluators) {
        const result = await evaluator.evaluateEpisode(evaluationInput);
        evaluations.push(result);
        await publish(
          createEvent(
            "evaluator.episode_scored",
            evaluator.metadata.id,
            { result },
            eventContext
          )
        );
      }
      run.evaluations = evaluations;
      run.status = "completed";
      run.completedAt = new Date().toISOString();
      await publish(
        createEvent(
          "episode.completed",
          "orchestrator",
          {
            steps: run.steps,
            terminationReason,
            evaluations
          },
          eventContext
        )
      );
      await publish(
        createEvent(
          "experiment.completed",
          "orchestrator",
          { runId },
          eventContext
        )
      );
      return run;
    } catch (error) {
      const arenaError = normalizeError(error);
      run.status = "failed";
      run.error = arenaError;
      run.completedAt = new Date().toISOString();
      await publish(
        createEvent("error.raised", "orchestrator", arenaError, eventContext)
      );
      await publish(
        createEvent(
          "experiment.failed",
          "orchestrator",
          { error: arenaError },
          eventContext
        )
      );
      return run;
    } finally {
      this.cancelExternalAction(runId);
      await Promise.all(
        agents.map(({ agent }) => agent.close().catch(() => undefined))
      );
      if (runtimeHandle) {
        const runtime = this.options.registries.runtimes.resolve(
          runtimeHandle.session.runtimeId
        );
        await runtime.terminate(runtimeHandle).catch(() => undefined);
        await publish(
          createEvent(
            "runtime.terminated",
            runtime.id,
            { sessionId: runtimeHandle.session.id },
            eventContext
          )
        );
      }
      await this.options.runRepository.save(run);
    }
  }

  private waitForExternalAction(
    runId: string,
    participantId: string
  ): Promise<AgentAction> {
    this.cancelExternalAction(runId);
    return new Promise<AgentAction>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingExternalActions.delete(runId);
        reject(new Error(`Timed out waiting for participant "${participantId}".`));
      }, 15 * 60_000);
      this.#pendingExternalActions.set(runId, {
        participantId,
        resolve,
        reject,
        timer
      });
    });
  }

  private cancelExternalAction(runId: string): void {
    const pending = this.#pendingExternalActions.get(runId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pendingExternalActions.delete(runId);
    pending.reject(new Error("External action request was cancelled."));
  }
}

function resolveParticipants(config: ExperimentConfig): ExperimentParticipant[] {
  if (config.participants?.length) {
    const ids = new Set<string>();
    for (const participant of config.participants) {
      if (ids.has(participant.id)) {
        throw new Error(`Participant id "${participant.id}" is duplicated.`);
      }
      ids.add(participant.id);
    }
    return config.participants;
  }
  return [
    {
      id: "primary",
      kind: "agent",
      agentId: config.agentId,
      displayName: config.agentId,
      role: "primary"
    }
  ];
}

function normalizeError(error: unknown): ArenaError {
  if (error && typeof error === "object" && "category" in error) {
    return error as ArenaError;
  }
  return {
    code: "ARENA_UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
    category: "system",
    recoverable: false
  };
}

export interface ArenaSystem {
  registries: ArenaRegistries;
  plugins: PluginManager;
  eventBus: InMemoryEventBus;
  runRepository: RunRepository;
  orchestrator: ExperimentOrchestrator;
}

export function createArenaSystem(
  runRepository: RunRepository = new InMemoryRunRepository()
): ArenaSystem {
  const registries = createRegistries();
  registries.runtimes.register("in-process", new InProcessRuntime());
  const eventBus = new InMemoryEventBus();
  const plugins = new PluginManager(registries);
  const orchestrator = new ExperimentOrchestrator({
    registries,
    eventBus,
    runRepository
  });
  return {
    registries,
    plugins,
    eventBus,
    runRepository,
    orchestrator
  };
}
