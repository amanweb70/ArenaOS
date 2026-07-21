import type { ArenaEvent, RunRecord } from "@arena/contracts";
import { describe, expect, it } from "vitest";
import { mergeEvents, mergeRun } from "../apps/web/lib/run-stream.js";

function event(id: string, step: number, timestamp: string): ArenaEvent {
  return { id, step, timestamp, type: "test.event", source: "test", payload: {} };
}

function run(events: ArenaEvent[]): RunRecord {
  return {
    id: "run-1",
    episodeId: "episode-1",
    experimentId: "experiment-1",
    config: {
      name: "test",
      environmentId: "headless-grid",
      agentId: "scripted-agent",
      evaluatorIds: [],
      episodeLimits: {}
    },
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    steps: 1,
    evaluations: [],
    events,
    replay: []
  };
}

describe("web run stream recovery", () => {
  it("deduplicates events and restores deterministic order", () => {
    const merged = mergeEvents(
      [event("two", 2, "2026-01-01T00:00:02.000Z")],
      [
        event("one", 1, "2026-01-01T00:00:01.000Z"),
        event("two", 2, "2026-01-01T00:00:02.000Z")
      ]
    );
    expect(merged.map((item) => item.id)).toEqual(["one", "two"]);
  });

  it("keeps locally observed replay frames when a recovery snapshot is older", () => {
    const current = { ...run([]), replay: [{ episodeId: "episode-1", step: 1, timestamp: "now", events: [] }] };
    const recovered = mergeRun(current, run([]));
    expect(recovered.replay).toHaveLength(1);
  });
});
