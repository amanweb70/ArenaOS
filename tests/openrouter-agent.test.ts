import { describe, expect, it, vi } from "vitest";
import {
  OpenRouterArenaAgent,
  configsFromEnvironment,
  createOpenRouterAgentPlugin,
  parseAgentAction
} from "@arena/plugin-openrouter-agent";
import { createArenaSystem } from "@arena/core";
import { headlessGridPlugin } from "@arena/plugin-headless-grid";
import { nativeEvaluatorsPlugin } from "@arena/plugin-native-evaluators";
import type {
  AgentInitializeContext,
  ArenaError,
  Observation
} from "@arena/contracts";
import { OPENROUTER_MODEL_CATALOG } from "@arena/contracts";

const actionSchema = {
  type: "object",
  required: ["id", "type", "arguments"],
  properties: {
    id: { type: "string" },
    type: { const: "move" },
    arguments: {
      type: "object",
      required: ["direction"],
      properties: {
        direction: { enum: ["north", "south", "east", "west"] }
      }
    }
  }
};

const initializeContext: AgentInitializeContext = {
  episodeId: "episode-test",
  environment: {
    id: "headless-grid",
    name: "Headless Grid",
    version: "0.1.0",
    runtime: "in-process"
  },
  actionSchema
};

const observation: Observation = {
  id: "observation-test",
  episodeId: "episode-test",
  step: 0,
  timestamp: "2026-01-01T00:00:00.000Z",
  data: {
    width: 4,
    height: 4,
    self: { x: 0, y: 0 },
    goal: { x: 3, y: 0 },
    visibleObstacles: [],
    remainingSteps: 10
  },
  availableActions: ["move"]
};

function completion(content: string, usage = true): Response {
  return Response.json({
    id: "gen-test",
    model: "openai/test-model",
    provider: "Test Provider",
    choices: [
      {
        message: { role: "assistant", content },
        finish_reason: "stop",
        native_finish_reason: "stop"
      }
    ],
    usage: usage
      ? { prompt_tokens: 41, completion_tokens: 9, total_tokens: 50, cost: 0.002 }
      : undefined
  });
}

function createAgent(fetchImplementation: typeof fetch, overrides = {}) {
  return new OpenRouterArenaAgent(
    {
      id: "openrouter:test",
      model: "openai/test-model",
      apiKey: "test-key",
      timeoutMs: 1_000,
      ...overrides
    },
    fetchImplementation
  );
}

describe("OpenRouter agent plugin", () => {
  it("parses plain and markdown-wrapped JSON actions", () => {
    const plain = parseAgentAction(
      '{"type":"move","arguments":{"direction":"east"},"summary":"Advance"}'
    );
    const fence = String.fromCharCode(96).repeat(3);
    const wrapped = parseAgentAction(
      fence +
        "json\n" +
        '{"type":"move","arguments":{"direction":"south"}}\n' +
        fence
    );
    expect(plain.arguments).toEqual({ direction: "east" });
    expect(wrapped.arguments).toEqual({ direction: "south" });
  });

  it("returns normalized actions and provider telemetry", async () => {
    const requestBodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return completion(
        '{"type":"move","arguments":{"direction":"east"},"summary":"Clear route"}'
      );
    }) as unknown as typeof fetch;
    const agent = createAgent(fetchMock);
    await agent.initialize(initializeContext);
    const result = await agent.act({
      observation,
      actionSchema,
      step: 1
    });
    expect(result.action).toMatchObject({
      type: "move",
      arguments: { direction: "east" },
      summary: "Clear route",
      metadata: {
        provider: "openrouter",
        model: "openai/test-model",
        requestId: "gen-test",
        parseAttempts: 1
      }
    });
    expect(result.usage).toEqual({
      inputTokens: 41,
      outputTokens: 9,
      costUsd: 0.002
    });
    expect(requestBodies[0]).toMatchObject({
      model: "openai/test-model",
      stream: false,
      usage: { include: true },
      provider: { allow_fallbacks: true, data_collection: "deny" }
    });
    expect(JSON.stringify(requestBodies[0])).not.toContain("test-key");
  });

  it("retries malformed model output once, then fails clearly", async () => {
    const fetchMock = vi.fn(async () => completion("not json")) as unknown as typeof fetch;
    const agent = createAgent(fetchMock, { maxRetries: 1 });
    await agent.initialize(initializeContext);
    await expect(
      agent.act({ observation, actionSchema, step: 1 })
    ).rejects.toMatchObject({
      code: "OPENROUTER_INVALID_ACTION",
      category: "agent",
      recoverable: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not register agents when the private key is unavailable", () => {
    expect(
      configsFromEnvironment({
        OPENROUTER_MODELS: "openai/a,anthropic/b"
      })
    ).toEqual([]);
  });

  it("registers the curated catalog plus optional extra models with exact slugs", () => {
    const configs = configsFromEnvironment({
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODELS: "google/gemini-test,openrouter/auto"
    });
    expect(configs.map((config) => config.model)).toEqual([
      ...OPENROUTER_MODEL_CATALOG.map((model) => model.id),
      "google/gemini-test"
    ]);
    expect(configs.map((config) => config.id)).toContain(
      "openrouter:x-ai/grok-4.5"
    );
    expect(configs.find((config) => config.model === "openai/gpt-5.5")?.name)
      .toBe("GPT-5.5 · OpenAI");
  });

  it("normalizes timeout and HTTP provider failures without exposing keys", async () => {
    const timeoutFetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    ) as unknown as typeof fetch;
    const timeoutAgent = createAgent(timeoutFetch, { timeoutMs: 15 });
    await timeoutAgent.initialize(initializeContext);
    await expect(
      timeoutAgent.act({ observation, actionSchema, step: 1 })
    ).rejects.toMatchObject({ code: "OPENROUTER_TIMEOUT" });

    const errorFetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 429,
            message: "Rate limit exceeded",
            metadata: { error_type: "rate_limit_exceeded" }
          }
        },
        { status: 429, headers: { "retry-after": "2" } }
      )
    ) as unknown as typeof fetch;
    const errorAgent = createAgent(errorFetch);
    await errorAgent.initialize(initializeContext);
    let failure: ArenaError | undefined;
    try {
      await errorAgent.act({ observation, actionSchema, step: 1 });
    } catch (error) {
      failure = error as ArenaError;
    }
    expect(failure).toMatchObject({
      code: "OPENROUTER_RATE_LIMIT_EXCEEDED",
      category: "agent",
      recoverable: true,
      metadata: { status: 429, retryAfterSeconds: 2 }
    });
    expect(JSON.stringify(failure)).not.toContain("test-key");
  });

  it("runs a complete persisted ArenaOS replay through the mocked transport", async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      const prompt = body.messages.find((message) => message.role === "user")?.content ?? "";
      const start = prompt.indexOf("Current observation:\n") + "Current observation:\n".length;
      const end = prompt.indexOf("\nAuthoritative JSON Schema", start);
      const current = JSON.parse(prompt.slice(start, end)) as {
        data: {
          self: { x: number; y: number };
          goal: { x: number; y: number };
          visibleObstacles: Array<{ x: number; y: number }>;
          width: number;
          height: number;
        };
      };
      const direction = nextGridDirection(current.data);
      return completion(
        JSON.stringify({
          type: "move",
          arguments: { direction },
          summary: "Follow the shortest safe route"
        })
      );
    }) as unknown as typeof fetch;

    const system = createArenaSystem();
    await system.plugins.register(headlessGridPlugin);
    await system.plugins.register(nativeEvaluatorsPlugin);
    await system.plugins.register(
      createOpenRouterAgentPlugin({
        agents: [
          {
            id: "openrouter:test-grid",
            model: "openai/test-grid",
            apiKey: "test-key",
            maxRetries: 0
          }
        ],
        fetch: fetchMock
      })
    );
    const run = await system.orchestrator.runExperiment({
      name: "Mocked OpenRouter grid",
      environmentId: "headless-grid",
      agentId: "openrouter:test-grid",
      evaluatorIds: ["success"],
      seed: 7,
      episodeLimits: {
        maxSteps: 30,
        maxTokens: 10_000,
        maxCostUsd: 1
      }
    });

    expect(run.status).toBe("completed");
    expect(run.terminationReason).toBe("goal_reached");
    expect(run.replay.length).toBeGreaterThan(0);
    expect(run.usage?.totalTokens).toBeGreaterThan(0);
    expect(
      run.events.some((event) => event.type === "agent.usage_recorded")
    ).toBe(true);
    expect(
      run.events
        .filter((event) => event.type === "agent.action_generated")
        .every((event) =>
          JSON.stringify(event.payload).includes('"provider":"openrouter"')
        )
    ).toBe(true);
  });
});

function nextGridDirection(input: {
  self: { x: number; y: number };
  goal: { x: number; y: number };
  visibleObstacles: Array<{ x: number; y: number }>;
  width: number;
  height: number;
}): "north" | "south" | "east" | "west" {
  const directions = [
    { name: "east" as const, dx: 1, dy: 0 },
    { name: "south" as const, dx: 0, dy: 1 },
    { name: "west" as const, dx: -1, dy: 0 },
    { name: "north" as const, dx: 0, dy: -1 }
  ];
  const queue = [{ position: input.self, path: [] as typeof directions }];
  const seen = new Set([input.self.x + "," + input.self.y]);
  const blocked = new Set(
    input.visibleObstacles.map((position) => position.x + "," + position.y)
  );
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (
      current.position.x === input.goal.x &&
      current.position.y === input.goal.y
    ) {
      return current.path[0]?.name ?? "north";
    }
    for (const direction of directions) {
      const x = current.position.x + direction.dx;
      const y = current.position.y + direction.dy;
      const key = x + "," + y;
      if (
        x < 0 ||
        y < 0 ||
        x >= input.width ||
        y >= input.height ||
        blocked.has(key) ||
        seen.has(key)
      ) {
        continue;
      }
      seen.add(key);
      queue.push({
        position: { x, y },
        path: [...current.path, direction]
      });
    }
  }
  throw new Error("No safe grid route.");
}
