import type { RunRecord } from "@arena/contracts";

export const terminalStatuses = new Set<RunRecord["status"]>([
  "completed",
  "failed",
  "cancelled"
]);

export function shortId(id: string, length = 8): string {
  return id.slice(0, length).toUpperCase();
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function durationMs(run: RunRecord): number | undefined {
  if (!run.startedAt) return undefined;
  return new Date(run.completedAt ?? Date.now()).getTime() - new Date(run.startedAt).getTime();
}

export function formatDuration(value?: number): string {
  if (value === undefined) return "—";
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

export function evaluation(run: RunRecord, evaluatorId: string) {
  return run.evaluations.find((item) => item.evaluatorId === evaluatorId);
}

export function successLabel(run: RunRecord): string {
  const result = evaluation(run, "success");
  if (!result) return run.status === "completed" ? "DONE" : "—";
  if (result.passed !== undefined) return result.passed ? "PASS" : "FAIL";
  return result.score === undefined ? "—" : String(result.score);
}
