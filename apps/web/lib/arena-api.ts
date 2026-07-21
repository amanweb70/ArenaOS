import type { AgentAction, ExperimentConfig, RunRecord } from "@arena/contracts";
import type {
  AgentSummary,
  EnvironmentSummary,
  EvaluatorSummary,
  EnvironmentBuildArtifact,
  EnvironmentBuildRecord,
  GeneratedEnvironmentPreview,
  RunStartResponse
} from "./types";

export class ArenaApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ArenaApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined;
    throw new ArenaApiError(
      detail?.message ?? `Arena API request failed (${response.status}).`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export const arenaApi = {
  health: () => request<{ status: string; service: string; version: string }>("/api/health"),
  environments: () => request<EnvironmentSummary[]>("/api/environments"),
  agents: () => request<AgentSummary[]>("/api/agents"),
  evaluators: () => request<EvaluatorSummary[]>("/api/evaluators"),
  runs: () => request<RunRecord[]>("/api/run-summaries"),
  run: (runId: string) => request<RunRecord>(`/api/runs/${runId}`),
  replay: (runId: string) => request<RunRecord["replay"]>(`/api/runs/${runId}/replay`),
  submitAction: (runId: string, participantId: string, action: AgentAction) =>
    request<{ accepted: true }>(`/api/runs/${runId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId, action })
    }),
  startRun: (config: Partial<ExperimentConfig>, signal?: AbortSignal) =>
    request<RunStartResponse>("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
      signal
    }),
  environmentBuilderStatus: () => request<{ configured: boolean; model: string; keyExposed: false; isolation: string }>("/api/environment-builds/status"),
  environmentBuilds: () => request<EnvironmentBuildRecord[]>("/api/environment-builds"),
  environmentBuild: (buildId: string) => request<EnvironmentBuildRecord>(`/api/environment-builds/${buildId}`),
  createEnvironmentBuild: (input: EnvironmentBuildRecord["request"]) => request<EnvironmentBuildRecord & { streamUrl: string }>("/api/environment-builds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  refineEnvironmentBuild: (buildId: string, message: string) => request<EnvironmentBuildRecord>(`/api/environment-builds/${buildId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) }),
  cancelEnvironmentBuild: (buildId: string) => request<EnvironmentBuildRecord>(`/api/environment-builds/${buildId}/cancel`, { method: "POST" }),
  approveEnvironmentBuild: (buildId: string) => request<EnvironmentBuildRecord>(`/api/environment-builds/${buildId}/approve`, { method: "POST" }),
  environmentBuildArtifacts: (buildId: string) => request<EnvironmentBuildArtifact[]>(`/api/environment-builds/${buildId}/artifacts`),
  environmentBuildPreview: (buildId: string) => request<GeneratedEnvironmentPreview>(`/api/environment-builds/${buildId}/preview`)
};

export function getRunSocketUrl(runId: string): string {
  if (typeof window === "undefined") return "";
  const configured = process.env.NEXT_PUBLIC_ARENA_WS_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/ws/runs/${runId}`;
  if (window.location.hostname === "localhost" && window.location.port === "3000") {
    return `ws://127.0.0.1:4000/ws/runs/${runId}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/runs/${runId}`;
}

export function getEnvironmentBuildSocketUrl(buildId: string): string {
  if (typeof window === "undefined") return "";
  const configured = process.env.NEXT_PUBLIC_ARENA_WS_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/ws/environment-builds/${buildId}`;
  if (window.location.hostname === "localhost" && window.location.port === "3000") return `ws://127.0.0.1:4000/ws/environment-builds/${buildId}`;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/environment-builds/${buildId}`;
}
