import {
  type Agent,
  type AgentAction,
  type AgentActInput,
  type AgentActResult,
  type AgentFactory,
  type AgentInitializeContext,
  type AgentMetadata,
  type ArenaError,
  type ArenaPlugin,
  type JsonSchema,
  type Observation,
  OPENROUTER_MODEL_CATALOG,
  openRouterAgentId
} from "@arena/contracts";
import { randomUUID } from "node:crypto";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/auto";

export interface OpenRouterAgentConfig {
  id?: string;
  name?: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  appName?: string;
  siteUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxPromptCharacters?: number;
  dataCollection?: "allow" | "deny";
}

export interface OpenRouterPluginOptions {
  agents?: OpenRouterAgentConfig[];
  fetch?: typeof globalThis.fetch;
}

interface OpenRouterErrorBody {
  code?: number | string;
  message?: string;
  metadata?: { error_type?: string; provider_code?: string };
}

interface OpenRouterResponse {
  id?: string;
  model?: string;
  provider?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    error?: OpenRouterErrorBody;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: OpenRouterErrorBody;
}

interface ParsedAction {
  type: string;
  arguments: Record<string, unknown>;
  summary?: string;
}

export class OpenRouterArenaAgent implements Agent {
  readonly metadata: AgentMetadata;
  readonly #fetch: typeof globalThis.fetch;
  #environmentName = "ArenaOS environment";
  #actionSchema: JsonSchema = {};
  #participantLabel?: string;

  constructor(
    readonly config: OpenRouterAgentConfig,
    fetchImplementation: typeof globalThis.fetch = globalThis.fetch
  ) {
    if (!config.apiKey.trim()) throw new Error("OpenRouter API key is required.");
    if (!config.model.trim()) throw new Error("OpenRouter model is required.");
    this.#fetch = fetchImplementation;
    this.metadata = metadataFor(config);
  }

  async initialize(context: AgentInitializeContext): Promise<void> {
    this.#environmentName = context.environment.name;
    this.#actionSchema = context.actionSchema;
    this.#participantLabel =
      context.participant?.displayName ?? context.participant?.id;
  }

  async act(input: AgentActInput): Promise<AgentActResult<AgentAction>> {
    const startedAt = performance.now();
    const prompt = buildActionPrompt({
      environmentName: this.#environmentName,
      participantLabel: this.#participantLabel,
      observation: input.observation,
      actionSchema: input.actionSchema ?? this.#actionSchema,
      step: input.step,
      maxCharacters: this.config.maxPromptCharacters ?? 60_000
    });
    let lastParseError: Error | undefined;
    const attempts = Math.max(1, (this.config.maxRetries ?? 1) + 1);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const retryNote =
        attempt === 1
          ? ""
          : "\n\nYour previous response was invalid (" +
            lastParseError?.message +
            "). Return one JSON object only.";
      const response = await this.#generate(prompt + retryNote);
      try {
        const parsed = parseAgentAction(response.text);
        return {
          action: {
            id: randomUUID(),
            type: parsed.type,
            arguments: parsed.arguments,
            summary: parsed.summary,
            metadata: {
              provider: "openrouter",
              model: response.model,
              requestedModel: this.config.model,
              upstreamProvider: response.provider,
              requestId: response.id,
              latencyMs: Math.round(performance.now() - startedAt),
              finishReason: response.finishReason,
              nativeFinishReason: response.nativeFinishReason,
              parseAttempts: attempt
            }
          },
          usage: response.usage
        };
      } catch (error) {
        lastParseError =
          error instanceof Error ? error : new Error(String(error));
      }
    }

    throw arenaAgentError(
      "OPENROUTER_INVALID_ACTION",
      "Model " +
        this.config.model +
        " did not return a valid ArenaOS action after " +
        attempts +
        " attempts.",
      true,
      {
        model: this.config.model,
        attempts,
        parseError: lastParseError?.message
      }
    );
  }

  async reset(): Promise<void> {}
  async close(): Promise<void> {}

  async #generate(prompt: string): Promise<{
    text: string;
    id?: string;
    model: string;
    provider?: string;
    finishReason?: string | null;
    nativeFinishReason?: string | null;
    usage?: AgentActResult["usage"];
  }> {
    const controller = new AbortController();
    const timeoutMs = clampInteger(
      this.config.timeoutMs,
      10,
      300_000,
      45_000
    );
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const baseUrl = (this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    try {
      const response = await this.#fetch(baseUrl + "/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: "Bearer " + this.config.apiKey,
          "content-type": "application/json",
          ...(this.config.siteUrl
            ? { "HTTP-Referer": this.config.siteUrl }
            : {}),
          ...(this.config.appName ? { "X-Title": this.config.appName } : {})
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content:
                "You are an ArenaOS autonomous agent. Choose exactly one legal action. Return only a JSON object with type, arguments, and optional summary. Never use markdown."
            },
            { role: "user", content: prompt }
          ],
          temperature: clampNumber(this.config.temperature, 0, 2, 0),
          max_tokens: clampInteger(
            this.config.maxOutputTokens,
            32,
            8_192,
            800
          ),
          stream: false,
          usage: { include: true },
          provider: {
            allow_fallbacks: true,
            data_collection: this.config.dataCollection ?? "deny"
          }
        })
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as OpenRouterResponse;
      if (!response.ok || payload.error) {
        throw normalizeOpenRouterError(
          payload.error,
          response.status,
          response.headers.get("retry-after"),
          this.config.model
        );
      }
      const choice = payload.choices?.[0];
      if (choice?.error || choice?.finish_reason === "error") {
        throw normalizeOpenRouterError(
          choice.error,
          502,
          null,
          this.config.model
        );
      }
      const text = choice?.message?.content?.trim();
      if (!text) {
        throw arenaAgentError(
          "OPENROUTER_EMPTY_RESPONSE",
          "OpenRouter returned no action content for " + this.config.model + ".",
          true,
          { model: this.config.model, requestId: payload.id }
        );
      }
      return {
        text,
        id: payload.id,
        model: payload.model ?? this.config.model,
        provider: payload.provider,
        finishReason: choice?.finish_reason,
        nativeFinishReason: choice?.native_finish_reason,
        usage: {
          inputTokens: payload.usage?.prompt_tokens,
          outputTokens: payload.usage?.completion_tokens,
          costUsd: payload.usage?.cost
        }
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw arenaAgentError(
          "OPENROUTER_TIMEOUT",
          "OpenRouter request for " +
            this.config.model +
            " exceeded " +
            timeoutMs +
            "ms.",
          true,
          { model: this.config.model, timeoutMs }
        );
      }
      if (isArenaError(error)) throw error;
      throw arenaAgentError(
        "OPENROUTER_NETWORK_ERROR",
        error instanceof Error
          ? error.message
          : "OpenRouter could not be reached.",
        true,
        { provider: "openrouter", model: this.config.model }
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createOpenRouterAgentFactory(
  config: OpenRouterAgentConfig,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch
): AgentFactory {
  const metadata = metadataFor(config);
  return {
    metadata,
    create: () => new OpenRouterArenaAgent(config, fetchImplementation)
  };
}

export function createOpenRouterAgentPlugin(
  options: OpenRouterPluginOptions = {}
): ArenaPlugin {
  return {
    manifest: {
      id: "arena.openrouter-agent",
      name: "OpenRouter LLM Agents",
      version: "0.1.0",
      description:
        "Server-side model agents using one OpenRouter endpoint and API key."
    },
    async register(context) {
      const agents = options.agents ?? configsFromEnvironment();
      for (const config of agents) {
        const factory = createOpenRouterAgentFactory(config, options.fetch);
        context.agents.register(factory.metadata.id, factory);
      }
    }
  };
}

export const openRouterAgentPlugin = createOpenRouterAgentPlugin();

export function configsFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): OpenRouterAgentConfig[] {
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return [];
  const additionalModels = (environment.OPENROUTER_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = [
    ...OPENROUTER_MODEL_CATALOG.map((model) => model.id),
    ...additionalModels
  ];
  return [...new Set(models)].map((model) => ({
    id: openRouterAgentId(model),
    name: displayNameForModel(model),
    model,
    apiKey,
    baseUrl: environment.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL,
    appName: environment.OPENROUTER_APP_NAME ?? "ArenaOS",
    siteUrl: environment.OPENROUTER_SITE_URL,
    temperature: optionalNumber(environment.OPENROUTER_TEMPERATURE),
    maxOutputTokens: optionalNumber(
      environment.OPENROUTER_MAX_OUTPUT_TOKENS
    ),
    timeoutMs: optionalNumber(environment.OPENROUTER_TIMEOUT_MS),
    maxRetries: optionalNumber(environment.OPENROUTER_MAX_RETRIES),
    dataCollection:
      environment.OPENROUTER_DATA_COLLECTION === "allow" ? "allow" : "deny"
  }));
}

export function parseAgentAction(text: string): ParsedAction {
  const candidate = extractJsonObject(text);
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    throw new Error("response was not valid JSON");
  }
  if (!isRecord(value)) throw new Error("action must be a JSON object");
  if (typeof value.type !== "string" || !value.type.trim()) {
    throw new Error("action.type must be a non-empty string");
  }
  if (!isRecord(value.arguments)) {
    throw new Error("action.arguments must be a JSON object");
  }
  if (
    value.summary !== undefined &&
    typeof value.summary !== "string"
  ) {
    throw new Error("action.summary must be a string when provided");
  }
  return {
    type: value.type,
    arguments: value.arguments,
    summary: value.summary as string | undefined
  };
}

export function buildActionPrompt(input: {
  environmentName: string;
  participantLabel?: string;
  observation: Observation;
  actionSchema: JsonSchema;
  step: number;
  maxCharacters: number;
}): string {
  const observation = limitedJson(
    input.observation,
    input.maxCharacters
  );
  const schema = limitedJson(
    input.actionSchema,
    Math.min(30_000, input.maxCharacters)
  );
  return [
    "Environment: " + input.environmentName,
    "Actor: " + (input.participantLabel ?? "primary agent"),
    "Turn: " + input.step,
    "Available action types: " +
      JSON.stringify(input.observation.availableActions ?? []),
    "Current observation:",
    observation,
    "Authoritative JSON Schema for the complete ArenaOS action:",
    schema,
    "Choose one legal action for the current state. Your response must contain only:",
    '{"type":"action_type","arguments":{},"summary":"brief public rationale"}',
    "ArenaOS supplies the action id. Do not include private chain-of-thought."
  ].join("\n");
}

function metadataFor(config: OpenRouterAgentConfig): AgentMetadata {
  const catalogEntry = OPENROUTER_MODEL_CATALOG.find(
    (model) => model.id === config.model
  );
  return {
    id: config.id ?? openRouterAgentId(config.model),
    name: config.name ?? displayNameForModel(config.model),
    version: "0.1.0",
    description: "Live " + config.model + " inference through OpenRouter.",
    provider: "openrouter",
    model: config.model,
    tags: [
      "llm",
      "openrouter",
      "live",
      ...(catalogEntry?.featured ? ["featured"] : []),
      ...(catalogEntry && "automatic" in catalogEntry && catalogEntry.automatic
        ? ["automatic-routing"]
        : [])
    ]
  };
}

function displayNameForModel(model: string): string {
  const catalogEntry = OPENROUTER_MODEL_CATALOG.find(
    (candidate) => candidate.id === model
  );
  if (catalogEntry) {
    return `${catalogEntry.name} · ${catalogEntry.provider}`;
  }
  if (model === DEFAULT_MODEL) return "OpenRouter Auto";
  const parts = model.split("/");
  const provider = parts[0] ?? "model";
  const slug = parts.slice(1).join("/") || provider;
  const name = slug
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return name + " · " + provider;
}

function extractJsonObject(text: string): string {
  const fence = String.fromCharCode(96).repeat(3);
  let cleaned = text.trim();
  if (cleaned.startsWith(fence)) {
    const firstLine = cleaned.indexOf("\n");
    cleaned = firstLine >= 0 ? cleaned.slice(firstLine + 1) : cleaned.slice(3);
    if (cleaned.trimEnd().endsWith(fence)) {
      cleaned = cleaned.trimEnd().slice(0, -3);
    }
    cleaned = cleaned.trim();
  }
  const start = cleaned.indexOf("{");
  if (start < 0) return cleaned;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const character = cleaned[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, index + 1);
    }
  }
  return cleaned.slice(start);
}

function limitedJson(value: unknown, maxCharacters: number): string {
  const serialized = JSON.stringify(value, null, 2) ?? "null";
  if (serialized.length <= maxCharacters) return serialized;
  return (
    serialized.slice(0, maxCharacters) +
    "\n... [truncated by ArenaOS prompt budget]"
  );
}

function normalizeOpenRouterError(
  error: OpenRouterErrorBody | undefined,
  status: number,
  retryAfter: string | null,
  model: string
): ArenaError {
  const errorType = error?.metadata?.error_type;
  const recoverable =
    status === 408 || status === 429 || status === 502 || status === 503;
  return arenaAgentError(
    "OPENROUTER_" + String(errorType ?? status ?? "ERROR").toUpperCase(),
    error?.message ?? "OpenRouter request failed with HTTP " + status + ".",
    recoverable,
    {
      provider: "openrouter",
      model,
      status,
      errorType,
      providerCode: error?.metadata?.provider_code,
      retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined
    }
  );
}

function arenaAgentError(
  code: string,
  message: string,
  recoverable: boolean,
  metadata: Record<string, unknown>
): ArenaError {
  return { code, message, category: "agent", recoverable, metadata };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isArenaError(value: unknown): value is ArenaError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.category === "agent" &&
    typeof value.recoverable === "boolean"
  );
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return Math.round(clampNumber(value, minimum, maximum, fallback));
}

function clampNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return Math.min(maximum, Math.max(minimum, value ?? fallback));
}
