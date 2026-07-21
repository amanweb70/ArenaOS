import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import {
  FileRunRepository,
  createArenaSystem,
  type ArenaSystem
} from "@arena/core";
import { headlessGridPlugin } from "@arena/plugin-headless-grid";
import { scriptedAgentPlugin } from "@arena/plugin-scripted-agent";
import { nativeEvaluatorsPlugin } from "@arena/plugin-native-evaluators";
import { royalChessPlugin } from "@arena/plugin-royal-chess";
import { bioCraftPlugin } from "@arena/plugin-biocraft";
import { chemCraftPlugin } from "@arena/plugin-chemcraft";
import { agentRumblePlugin } from "@arena/plugin-agent-rumble";
import { personaCraftPlugin } from "@arena/plugin-personacraft";
import { physicalAIPlugin } from "@arena/plugin-physical-ai";
import { openRouterAgentPlugin } from "@arena/plugin-openrouter-agent";
import type { AgentAction, ArenaEvent, ExperimentConfig } from "@arena/contracts";
import { dirname, resolve } from "node:path";
import {
  EnvironmentBuildService,
  type EnvironmentBuildRequest
} from "./environment-builds.js";

export interface ArenaApiOptions {
  logger?: boolean;
  storageDirectory?: string;
  system?: ArenaSystem;
  environmentBuildService?: EnvironmentBuildService;
}

export interface ArenaApi {
  app: FastifyInstance;
  system: ArenaSystem;
}

export async function buildArenaApi(
  options: ArenaApiOptions = {}
): Promise<ArenaApi> {
  const app = Fastify({ logger: options.logger ?? false });
  const storageDirectory =
    options.storageDirectory ??
    process.env.ARENA_STORAGE_DIRECTORY ??
    resolve(process.cwd(), ".arena", "runs");
  const system =
    options.system ?? createArenaSystem(new FileRunRepository(storageDirectory));

  if (!system.registries.environments.has("headless-grid")) {
    await system.plugins.register(headlessGridPlugin);
  }
  if (!system.registries.agents.has("scripted-agent")) {
    await system.plugins.register(scriptedAgentPlugin);
  }
  if (!system.registries.evaluators.has("success")) {
    await system.plugins.register(nativeEvaluatorsPlugin);
  }
  if (!system.registries.environments.has("royal-chess-v1")) {
    await system.plugins.register(royalChessPlugin);
  }
  if (!system.registries.environments.has("biocraft-v1")) {
    await system.plugins.register(bioCraftPlugin);
  }
  if (!system.registries.environments.has("chemcraft-v1")) {
    await system.plugins.register(chemCraftPlugin);
  }
  if (!system.registries.environments.has("agent-rumble-v1")) {
    await system.plugins.register(agentRumblePlugin);
  }
  if (!system.registries.environments.has("personacraft-v1")) {
    await system.plugins.register(personaCraftPlugin);
  }
  if (!system.registries.environments.has("physical-ai-mission-lab-v1")) {
    await system.plugins.register(physicalAIPlugin);
  }
  if (
    !system.registries.agents
      .list()
      .some(({ value }) => value.metadata.provider === "openrouter")
  ) {
    await system.plugins.register(openRouterAgentPlugin);
  }

  const environmentBuildService =
    options.environmentBuildService ??
    new EnvironmentBuildService(
      system,
      undefined,
      resolve(dirname(storageDirectory), "environment-builds"),
      resolve(dirname(storageDirectory), "generated-environments")
    );
  await environmentBuildService.loadApproved();

  await app.register(websocket);

  app.setErrorHandler((error, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const statusCode =
      "statusCode" in normalized && typeof normalized.statusCode === "number"
        ? normalized.statusCode
        : 500;
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal Server Error" : normalized.name,
      message: normalized.message,
      statusCode
    });
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "arena-api",
    version: "0.1.0"
  }));

  app.get("/api/environments", async () =>
    system.registries.environments.list().map(({ value }) => ({
      ...value.metadata,
      capabilities: value.create().getCapabilities()
    }))
  );

  app.get("/api/agents", async () =>
    system.registries.agents.list().map(({ value }) => value.metadata)
  );

  app.get("/api/openrouter/status", async () => {
    const agents = system.registries.agents
      .list()
      .map(({ value }) => value.metadata)
      .filter((metadata) => metadata.provider === "openrouter");
    return {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      agents,
      endpoint: "server-side",
      keyExposed: false
    };
  });

  app.get("/api/environment-builds/status", async () =>
    environmentBuildService.status()
  );

  app.get("/api/environment-builds", async () =>
    environmentBuildService.list()
  );

  app.post<{ Body: EnvironmentBuildRequest }>(
    "/api/environment-builds",
    async (request, reply) => {
      const build = await environmentBuildService.create(request.body ?? ({} as EnvironmentBuildRequest));
      return reply.status(202).send({
        ...build,
        streamUrl: `/ws/environment-builds/${build.id}`
      });
    }
  );

  app.get<{ Params: { buildId: string } }>(
    "/api/environment-builds/:buildId",
    async (request, reply) => {
      const build = await environmentBuildService.get(request.params.buildId);
      if (!build) return reply.status(404).send({ error: "Not Found", message: `Environment build "${request.params.buildId}" was not found.`, statusCode: 404 });
      return build;
    }
  );

  app.post<{ Params: { buildId: string }; Body: { message?: string } }>(
    "/api/environment-builds/:buildId/messages",
    async (request, reply) => {
      const build = await environmentBuildService.refine(request.params.buildId, request.body?.message ?? "");
      return reply.status(202).send(build);
    }
  );

  app.post<{ Params: { buildId: string } }>(
    "/api/environment-builds/:buildId/cancel",
    async (request) => environmentBuildService.cancel(request.params.buildId)
  );

  app.post<{ Params: { buildId: string } }>(
    "/api/environment-builds/:buildId/approve",
    async (request) => environmentBuildService.approve(request.params.buildId)
  );

  app.get<{ Params: { buildId: string } }>(
    "/api/environment-builds/:buildId/artifacts",
    async (request) => environmentBuildService.artifacts(request.params.buildId)
  );

  app.get<{ Params: { buildId: string } }>(
    "/api/environment-builds/:buildId/preview",
    async (request) => environmentBuildService.preview(request.params.buildId)
  );

  app.get("/api/evaluators", async () =>
    system.registries.evaluators.list().map(({ value }) => value.metadata)
  );

  app.get("/api/runs", async () => system.runRepository.list());

  app.get("/api/run-summaries", async () => {
    const repository = system.runRepository as typeof system.runRepository & {
      listSummaries?: () => Promise<Awaited<ReturnType<typeof system.runRepository.list>>>;
    };
    return repository.listSummaries?.() ?? repository.list();
  });

  app.get<{ Params: { runId: string } }>("/api/runs/:runId", async (request, reply) => {
    const run = await system.runRepository.get(request.params.runId);
    if (!run) {
      return reply.status(404).send({
        error: "Not Found",
        message: `Run "${request.params.runId}" was not found.`,
        statusCode: 404
      });
    }
    return run;
  });

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/events",
    async (request, reply) => {
      const run = await system.runRepository.get(request.params.runId);
      if (!run) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Run "${request.params.runId}" was not found.`,
          statusCode: 404
        });
      }
      return run.events;
    }
  );

  app.get<{ Params: { buildId: string } }>(
    "/ws/environment-builds/:buildId",
    { websocket: true },
    (socket, request) => {
      const buildId = request.params.buildId;
      const send = (value: unknown) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(value));
      };
      const unsubscribe = environmentBuildService.subscribe(buildId, (event) => send({ type: "event", event }));
      void environmentBuildService.get(buildId).then((build) => {
        if (build) send({ type: "snapshot", build });
        else send({ type: "error", message: "Environment build not found." });
      });
      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
    }
  );

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/replay",
    async (request, reply) => {
      const run = await system.runRepository.get(request.params.runId);
      if (!run) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Run "${request.params.runId}" was not found.`,
          statusCode: 404
        });
      }
      return run.replay;
    }
  );

  app.post<{
    Params: { runId: string };
    Body: { participantId?: string; action?: AgentAction };
  }>("/api/runs/:runId/actions", async (request, reply) => {
    const { participantId, action } = request.body ?? {};
    if (!participantId || !action?.id || !action.type || !action.arguments) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "participantId and a complete normalized action are required.",
        statusCode: 400
      });
    }
    const accepted = system.orchestrator.submitExternalAction(
      request.params.runId,
      participantId,
      action
    );
    if (!accepted) {
      return reply.status(409).send({
        error: "Conflict",
        message: "That participant does not currently have a pending human turn.",
        statusCode: 409
      });
    }
    return reply.status(202).send({ accepted: true });
  });

  app.post<{ Body: Partial<ExperimentConfig> }>("/api/runs", async (request, reply) => {
    const body = request.body ?? {};
    const isRoyalChess = body.environmentId === "royal-chess-v1";
    const isBioCraft = body.environmentId === "biocraft-v1";
    const isChemCraft = body.environmentId === "chemcraft-v1";
    const isAgentRumble = body.environmentId === "agent-rumble-v1";
    const isPersonaCraft = body.environmentId === "personacraft-v1";
    const isPhysicalAI = body.environmentId === "physical-ai-mission-lab-v1";
    const rumbleParticipants = [
      { id: "pink", kind: "agent" as const, agentId: "rumble-tactician", displayName: "PINK PULSE", role: "balanced" },
      { id: "cyan", kind: "agent" as const, agentId: "rumble-tactician", displayName: "CYAN SHIFT", role: "agile" },
      { id: "gold", kind: "agent" as const, agentId: "rumble-tactician", displayName: "GOLD CRUSH", role: "heavy" },
      { id: "lime", kind: "agent" as const, agentId: "rumble-tactician", displayName: "LIME BYTE", role: "balanced" }
    ];
    const personaParticipants = [
      { id: "pink", kind: "agent" as const, agentId: "council-strategist", displayName: "Ada Lovelace", role: "architect" },
      { id: "cyan", kind: "agent" as const, agentId: "council-strategist", displayName: "Sun Tzu", role: "strategist" },
      { id: "gold", kind: "agent" as const, agentId: "council-strategist", displayName: "Cleopatra", role: "diplomat" },
      { id: "violet", kind: "agent" as const, agentId: "council-strategist", displayName: "Alan Turing", role: "logician" }
    ];
    const physicalParticipants = [
      {
        id: "supervisor",
        kind: "agent" as const,
        agentId: "mission-coordinator",
        displayName: "MISSION COORDINATOR",
        role: "supervisor"
      }
    ];
    const royalParticipants = [
      {
        id: "white",
        kind: "agent" as const,
        agentId: body.agentId ?? "royal-greedy",
        displayName: body.agentId ?? "Crown Tactician",
        role: "white"
      },
      {
        id: "black",
        kind: "agent" as const,
        agentId: "royal-positional",
        displayName: "Court Strategist",
        role: "black"
      }
    ];
    const config: ExperimentConfig = {
      name:
        body.name ??
        (isRoyalChess
          ? "Royal Chess match"
          : isBioCraft
            ? "BioCraft mutation analysis"
            : isChemCraft
              ? "ChemCraft molecular optimization"
              : isAgentRumble
                ? "Agent Rumble neon coliseum"
              : isPersonaCraft
                ? "PersonaCraft Grand AI Council"
              : isPhysicalAI
                ? "Physical AI Warehouse Rescue Relay"
            : "Headless Grid run"),
      environmentId: body.environmentId ?? "headless-grid",
      agentId:
        body.agentId ??
        (isRoyalChess
          ? "royal-greedy"
          : isBioCraft
            ? "biocraft-researcher"
            : isChemCraft
              ? "chemcraft-researcher"
              : isAgentRumble
                ? "rumble-tactician"
              : isPersonaCraft
                ? "council-strategist"
              : isPhysicalAI
                ? "mission-coordinator"
            : "scripted-agent"),
      participants:
        body.participants ??
        (isRoyalChess
          ? royalParticipants
          : isAgentRumble
            ? rumbleParticipants
            : isPersonaCraft
              ? personaParticipants
            : isPhysicalAI
              ? physicalParticipants
              : undefined),
      evaluatorIds:
        body.evaluatorIds ??
        (isRoyalChess
          ? ["chess-result", "chess-legal-actions"]
          : isBioCraft
            ? ["biocraft-scientific-score"]
            : isChemCraft
              ? ["chemcraft-scientific-score"]
              : isAgentRumble
                ? ["rumble-match-score"]
              : isPersonaCraft
                ? ["personacraft-council-score"]
              : isPhysicalAI
                ? ["physical-ai-mission-score"]
          : ["success", "step-efficiency", "invalid-actions", "collisions"]),
      seed: body.seed,
      scenario:
        body.scenario ??
        (isRoyalChess
          ? {
              id: "standard",
              name: "Standard Royal Match",
              environmentId: "royal-chess-v1",
              parameters: {
                whiteParticipantId: "white",
                blackParticipantId: "black",
                maxPlies: 120
              }
            }
          : isBioCraft
            ? {
                id: "ubiquitin-preservation-001",
                name: "Ubiquitin Functional Preservation",
                environmentId: "biocraft-v1",
                parameters: { maxToolCalls: 12 }
              }
          : isChemCraft
            ? {
                id: "balanced-lead-001",
                name: "Balanced Local-Anesthetic Lead Optimization",
                environmentId: "chemcraft-v1",
                parameters: { maxToolCalls: 18 }
              }
          : isAgentRumble
            ? {
                id: "neon-coliseum-royal",
                name: "Neon Coliseum Royal Rumble",
                environmentId: "agent-rumble-v1",
                parameters: {
                  mode: "royal_rumble",
                  participantIds: ["pink", "cyan", "gold", "lime"],
                  maxRounds: 28,
                  displayNames: {
                    pink: "PINK PULSE",
                    cyan: "CYAN SHIFT",
                    gold: "GOLD CRUSH",
                    lime: "LIME BYTE"
                  },
                  archetypes: {
                    pink: "balanced",
                    cyan: "agile",
                    gold: "heavy",
                    lime: "balanced"
                  }
                }
              }
          : isPersonaCraft
            ? {
                id: "ai-accord-2040",
                name: "The AI Accord of 2040",
                environmentId: "personacraft-v1",
                parameters: {
                  mode: "debate",
                  participantIds: ["pink", "cyan", "gold", "violet"],
                  maxRounds: 3,
                  displayNames: {
                    pink: "Ada Lovelace",
                    cyan: "Sun Tzu",
                    gold: "Cleopatra",
                    violet: "Alan Turing"
                  }
                }
              }
          : isPhysicalAI
            ? {
                id: "warehouse-rescue-relay-v1",
                name: "Warehouse Rescue Relay",
                environmentId: "physical-ai-mission-lab-v1",
                parameters: {
                  mode: "single_supervisor",
                  participantIds: ["supervisor"],
                  timeLimitSeconds: 360
                }
              }
          : undefined),
      episodeLimits: {
        maxSteps:
          body.episodeLimits?.maxSteps ??
          (isRoyalChess
            ? 120
            : isBioCraft
              ? 16
              : isChemCraft
                ? 12
                : isAgentRumble
                  ? 140
                  : isPersonaCraft
                    ? 52
                  : isPhysicalAI
                    ? 24
                    : 30),
        maxDurationMs:
          body.episodeLimits?.maxDurationMs ??
          (isRoyalChess
            ? 120_000
            : isBioCraft
              ? 90_000
              : isChemCraft
                ? 120_000
                : isAgentRumble
                  ? 120_000
                : isPersonaCraft
                  ? 120_000
                : isPhysicalAI
                  ? 120_000
                : 30_000),
        maxToolCalls:
          body.episodeLimits?.maxToolCalls ??
          (isBioCraft ? 12 : isChemCraft ? 18 : undefined),
        maxTokens: body.episodeLimits?.maxTokens,
        maxCostUsd: body.episodeLimits?.maxCostUsd
      }
    };

    assertRegistered(system, config);
    const started = await system.orchestrator.startExperiment(config);
    void started.completion.catch((error: unknown) => {
      app.log.error(error, "Background run failed");
    });
    return reply.status(202).send({
      runId: started.run.id,
      episodeId: started.run.episodeId,
      status: started.run.status,
      streamUrl: `/ws/runs/${started.run.id}`
    });
  });

  app.get<{ Params: { runId: string } }>(
    "/ws/runs/:runId",
    { websocket: true },
    (socket, request) => {
      const runId = request.params.runId;
      const sent = new Set<string>();
      const sendEvent = (event: ArenaEvent) => {
        if (sent.has(event.id) || socket.readyState !== socket.OPEN) return;
        sent.add(event.id);
        socket.send(JSON.stringify({ type: "event", event }));
      };
      const unsubscribe = system.eventBus.subscribe({ runId }, sendEvent);

      void system.runRepository.get(runId).then((run) => {
        if (!run || socket.readyState !== socket.OPEN) return;
        socket.send(JSON.stringify({ type: "snapshot", run }));
        for (const event of run.events) sendEvent(event);
      });

      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
    }
  );

  app.addHook("onClose", async () => {
    await system.plugins.dispose();
  });

  return { app, system };
}

function assertRegistered(system: ArenaSystem, config: ExperimentConfig): void {
  if (!system.registries.environments.has(config.environmentId)) {
    throw Object.assign(
      new Error(`Environment "${config.environmentId}" is not registered.`),
      { statusCode: 400 }
    );
  }
  if (!system.registries.agents.has(config.agentId)) {
    throw Object.assign(new Error(`Agent "${config.agentId}" is not registered.`), {
      statusCode: 400
    });
  }
  for (const participant of config.participants ?? []) {
    if (
      participant.kind === "agent" &&
      (!participant.agentId || !system.registries.agents.has(participant.agentId))
    ) {
      throw Object.assign(
        new Error(
          `Participant "${participant.id}" references unregistered agent "${participant.agentId}".`
        ),
        { statusCode: 400 }
      );
    }
  }
  for (const evaluatorId of config.evaluatorIds) {
    if (!system.registries.evaluators.has(evaluatorId)) {
      throw Object.assign(
        new Error(`Evaluator "${evaluatorId}" is not registered.`),
        { statusCode: 400 }
      );
    }
  }
}
