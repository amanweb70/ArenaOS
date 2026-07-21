#!/usr/bin/env node
import { FileRunRepository, createArenaSystem } from "@arena/core";
import { headlessGridPlugin } from "@arena/plugin-headless-grid";
import { nativeEvaluatorsPlugin } from "@arena/plugin-native-evaluators";
import { scriptedAgentPlugin } from "@arena/plugin-scripted-agent";
import { royalChessPlugin } from "@arena/plugin-royal-chess";
import { bioCraftPlugin } from "@arena/plugin-biocraft";
import { chemCraftPlugin } from "@arena/plugin-chemcraft";
import { agentRumblePlugin } from "@arena/plugin-agent-rumble";
import { personaCraftPlugin } from "@arena/plugin-personacraft";
import { physicalAIPlugin } from "@arena/plugin-physical-ai";
import { openRouterAgentPlugin } from "@arena/plugin-openrouter-agent";
import type { ArenaEvent, RunRecord } from "@arena/contracts";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) loadEnvFile(path);
}

const storageDirectory = resolve(process.cwd(), ".arena", "runs");
const system = createArenaSystem(new FileRunRepository(storageDirectory));
const displayedEventTypes = new Set([
  "experiment.started",
  "runtime.ready",
  "episode.started",
  "environment.step_completed",
  "agent.action_rejected",
  "evaluator.episode_scored",
  "episode.completed",
  "experiment.failed"
]);

await system.plugins.register(headlessGridPlugin);
await system.plugins.register(scriptedAgentPlugin);
await system.plugins.register(nativeEvaluatorsPlugin);
await system.plugins.register(royalChessPlugin);
await system.plugins.register(bioCraftPlugin);
await system.plugins.register(chemCraftPlugin);
await system.plugins.register(agentRumblePlugin);
await system.plugins.register(personaCraftPlugin);
await system.plugins.register(physicalAIPlugin);
await system.plugins.register(openRouterAgentPlugin);

const args = process.argv.slice(2);
const command = args[0] ?? "help";

try {
  switch (command) {
    case "run":
      await runCommand(args.slice(1));
      break;
    case "inspect":
      await inspectCommand(args[1]);
      break;
    case "replay":
      await replayCommand(args[1]);
      break;
    case "runs":
      await listRuns();
      break;
    case "environment":
    case "environments":
      listEnvironments();
      break;
    case "agent":
    case "agents":
      listAgents();
      break;
    case "plugin":
    case "plugins":
      listPlugins();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      throw new Error(`Unknown command "${command}".`);
  }
} catch (error) {
  console.error(`ArenaOS error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await system.plugins.dispose();
}

async function runCommand(commandArgs: string[]): Promise<void> {
  const environmentId = commandArgs.find((arg) => !arg.startsWith("-"));
  if (!environmentId) {
    throw new Error("Usage: arena run <environment-id> --agent <agent-id>");
  }
  const royalChess = environmentId === "royal-chess-v1";
  const bioCraft = environmentId === "biocraft-v1";
  const chemCraft = environmentId === "chemcraft-v1";
  const agentRumble = environmentId === "agent-rumble-v1";
  const personaCraft = environmentId === "personacraft-v1";
  const physicalAI = environmentId === "physical-ai-mission-lab-v1";
  const agentId =
    option(commandArgs, "--agent") ??
    (royalChess
      ? "royal-greedy"
      : bioCraft
        ? "biocraft-researcher"
        : chemCraft
          ? "chemcraft-researcher"
        : agentRumble
          ? "rumble-tactician"
        : personaCraft
          ? "council-strategist"
        : physicalAI
          ? "mission-coordinator"
        : "scripted-agent");
  const opponentId = option(commandArgs, "--opponent") ?? "royal-positional";
  const maxSteps = Number(
    option(commandArgs, "--max-steps") ??
      (royalChess ? "120" : bioCraft ? "16" : chemCraft ? "12" : agentRumble ? "140" : personaCraft ? "52" : physicalAI ? "24" : "30")
  );
  const maxTokens = Number(option(commandArgs, "--max-tokens") ?? "100000");
  const maxCostUsd = Number(option(commandArgs, "--max-cost-usd") ?? "5");
  const json = commandArgs.includes("--json");
  const quiet = commandArgs.includes("--quiet") || json;
  const evaluatorIds = (
    option(commandArgs, "--evaluators") ??
    (royalChess
      ? "chess-result,chess-legal-actions"
      : bioCraft
        ? "biocraft-scientific-score"
        : chemCraft
          ? "chemcraft-scientific-score"
        : agentRumble
          ? "rumble-match-score"
        : personaCraft
          ? "personacraft-council-score"
        : physicalAI
          ? "physical-ai-mission-score"
      : "success,step-efficiency,invalid-actions,collisions")
  )
    .split(",")
    .filter(Boolean);

  const unsubscribe = quiet
    ? () => undefined
    : system.eventBus.subscribe({}, (event) => {
        if (displayedEventTypes.has(event.type)) {
          printLiveEvent(event);
        }
      });

  const run = await system.orchestrator.runExperiment({
    name: `${environmentId} / ${agentId}`,
    environmentId,
    agentId,
    participants: royalChess
      ? [
          { id: "white", kind: "agent", agentId, displayName: agentId, role: "white" },
          {
            id: "black",
            kind: "agent",
            agentId: opponentId,
            displayName: opponentId,
            role: "black"
          }
        ]
      : agentRumble
        ? [
            { id: "pink", kind: "agent", agentId, displayName: "PINK PULSE", role: "balanced" },
            { id: "cyan", kind: "agent", agentId, displayName: "CYAN SHIFT", role: "agile" },
            { id: "gold", kind: "agent", agentId, displayName: "GOLD CRUSH", role: "heavy" },
            { id: "lime", kind: "agent", agentId, displayName: "LIME BYTE", role: "balanced" }
          ]
      : personaCraft
        ? [
            { id: "pink", kind: "agent", agentId, displayName: "Ada Lovelace", role: "architect" },
            { id: "cyan", kind: "agent", agentId, displayName: "Sun Tzu", role: "strategist" },
            { id: "gold", kind: "agent", agentId, displayName: "Cleopatra", role: "diplomat" },
            { id: "violet", kind: "agent", agentId, displayName: "Alan Turing", role: "logician" }
          ]
      : physicalAI
        ? [
            {
              id: "supervisor",
              kind: "agent",
              agentId,
              displayName: "MISSION COORDINATOR",
              role: "supervisor"
            }
          ]
        : undefined,
    evaluatorIds,
    scenario: royalChess
      ? {
          id: "standard",
          name: "Standard Royal Match",
          environmentId,
          parameters: {
            whiteParticipantId: "white",
            blackParticipantId: "black",
            maxPlies: maxSteps
          }
        }
      : bioCraft
        ? {
            id: "ubiquitin-preservation-001",
            name: "Ubiquitin Functional Preservation",
            environmentId,
            parameters: { maxToolCalls: 12 }
          }
      : chemCraft
        ? {
            id: "balanced-lead-001",
            name: "Balanced Local-Anesthetic Lead Optimization",
            environmentId,
            parameters: { maxToolCalls: 18 }
          }
      : agentRumble
        ? {
            id: "neon-coliseum-royal",
            name: "Neon Coliseum Royal Rumble",
            environmentId,
            parameters: {
              mode: "royal_rumble",
              participantIds: ["pink", "cyan", "gold", "lime"],
              maxRounds: Math.max(2, Math.floor(maxSteps / 4)),
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
      : personaCraft
        ? {
            id: "ai-accord-2040",
            name: "The AI Accord of 2040",
            environmentId,
            parameters: {
              mode: "debate",
              participantIds: ["pink", "cyan", "gold", "violet"],
              maxRounds: Math.max(1, Math.floor(maxSteps / 16)),
              displayNames: {
                pink: "Ada Lovelace",
                cyan: "Sun Tzu",
                gold: "Cleopatra",
                violet: "Alan Turing"
              }
            }
          }
      : physicalAI
        ? {
            id: "warehouse-rescue-relay-v1",
            name: "Warehouse Rescue Relay",
            environmentId,
            parameters: {
              mode: "single_supervisor",
              participantIds: ["supervisor"],
              timeLimitSeconds: 360
            }
          }
      : undefined,
    episodeLimits: {
      maxSteps,
      maxDurationMs:
        bioCraft
          ? 90_000
          : chemCraft || agentRumble || personaCraft || physicalAI
            ? 120_000
            : undefined,
      maxToolCalls: bioCraft ? 12 : chemCraft ? 18 : undefined,
      maxTokens,
      maxCostUsd
    }
  });
  unsubscribe();

  if (json) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  printRunSummary(run);
}

async function inspectCommand(runId: string | undefined): Promise<void> {
  if (!runId) {
    throw new Error("Usage: arena inspect <run-id>");
  }
  const run = await system.runRepository.get(runId);
  if (!run) {
    throw new Error(`Run "${runId}" was not found.`);
  }
  printRunSummary(run);
  console.log(`Events: ${run.events.length}`);
  console.log(`Replay frames: ${run.replay.length}`);
  if (run.error) {
    console.log(`Error: ${run.error.code} - ${run.error.message}`);
  }
}

async function replayCommand(runId: string | undefined): Promise<void> {
  if (!runId) {
    throw new Error("Usage: arena replay <run-id>");
  }
  const run = await system.runRepository.get(runId);
  if (!run) {
    throw new Error(`Run "${runId}" was not found.`);
  }
  console.log(`Replay ${run.id} (${run.replay.length} frames)`);
  for (const frame of run.replay) {
    const state = frame.state as {
      width?: number;
      height?: number;
      agent?: { x: number; y: number };
      goal?: { x: number; y: number };
      obstacles?: Array<{ x: number; y: number }>;
    };
    console.log(`\nStep ${frame.step}`);
    console.log(renderGrid(state));
  }
}

async function listRuns(): Promise<void> {
  const runs = await system.runRepository.list();
  if (runs.length === 0) {
    console.log("No runs have been recorded.");
    return;
  }
  for (const run of runs) {
    console.log(
      `${run.id}  ${run.status.padEnd(9)}  ${run.config.environmentId}  ${run.config.agentId}  steps=${run.steps}`
    );
  }
}

function listEnvironments(): void {
  for (const { value } of system.registries.environments.list()) {
    console.log(
      `${value.metadata.id}\t${value.metadata.name}\t${value.metadata.version}\t${value.metadata.runtime}`
    );
  }
}

function listAgents(): void {
  for (const { value } of system.registries.agents.list()) {
    console.log(
      `${value.metadata.id}\t${value.metadata.name}\t${value.metadata.version}`
    );
  }
}

function listPlugins(): void {
  for (const plugin of system.plugins.list()) {
    console.log(
      `${plugin.manifest.id}\t${plugin.manifest.name}\t${plugin.manifest.version}`
    );
  }
}

function printRunSummary(run: RunRecord): void {
  console.log("\nArenaOS run complete");
  console.log(`Run: ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(`Environment: ${run.config.environmentId}`);
  console.log(`Agent: ${run.config.agentId}`);
  console.log(`Steps: ${run.steps}`);
  console.log(`Termination: ${run.terminationReason ?? "unknown"}`);
  if (run.usage && run.usage.totalTokens > 0) {
    console.log(
      "Usage: " +
        run.usage.totalTokens +
        " tokens / $" +
        run.usage.costUsd.toFixed(6)
    );
  }
  console.log("Evaluations:");
  for (const evaluation of run.evaluations) {
    const score =
      evaluation.score === undefined ? "" : ` score=${evaluation.score.toFixed(3)}`;
    const passed =
      evaluation.passed === undefined ? "" : ` passed=${evaluation.passed}`;
    console.log(`  - ${evaluation.evaluatorId}:${score}${passed}`);
  }
  console.log(`Inspect: pnpm arena inspect ${run.id}`);
  console.log(`Replay: pnpm arena replay ${run.id}`);
}

function printLiveEvent(event: ArenaEvent): void {
  const step = event.step === undefined ? "" : ` step=${event.step}`;
  if (event.type === "environment.step_completed") {
    const payload = event.payload as {
      action?: { type?: string; arguments?: unknown };
      reward?: number;
      state?: { agent?: { x: number; y: number } };
    };
    const position = payload.state?.agent;
    const at = position ? ` position=(${position.x},${position.y})` : "";
    console.log(
      `[${event.type}]${step} action=${payload.action?.type ?? "unknown"} reward=${payload.reward ?? 0}${at}`
    );
    return;
  }
  console.log(`[${event.type}]${step}`);
}

function renderGrid(state: {
  width?: number;
  height?: number;
  agent?: { x: number; y: number };
  goal?: { x: number; y: number };
  obstacles?: Array<{ x: number; y: number }>;
}): string {
  const width = state.width ?? 0;
  const height = state.height ?? 0;
  const obstacles = new Set(
    (state.obstacles ?? []).map((position) => `${position.x},${position.y}`)
  );
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const cells: string[] = [];
    for (let x = 0; x < width; x += 1) {
      if (state.agent?.x === x && state.agent.y === y) {
        cells.push("A");
      } else if (state.goal?.x === x && state.goal.y === y) {
        cells.push("G");
      } else if (obstacles.has(`${x},${y}`)) {
        cells.push("#");
      } else {
        cells.push(".");
      }
    }
    rows.push(cells.join(" "));
  }
  return rows.join("\n");
}

function option(commandArgs: string[], name: string): string | undefined {
  const index = commandArgs.indexOf(name);
  return index === -1 ? undefined : commandArgs[index + 1];
}

function printHelp(): void {
  console.log(`ArenaOS CLI

Commands:
  arena environments
  arena agents
  arena plugins
  arena run <environment-id> --agent <agent-id>
  arena runs
  arena inspect <run-id>
  arena replay <run-id>

Example:
  pnpm arena run headless-grid --agent scripted-agent`);
}
