import type { ArenaEvent, RunRecord } from "@arena/contracts";

export function mergeEvents(current: ArenaEvent[], incoming: ArenaEvent[]): ArenaEvent[] {
  const events = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) events.set(event.id, event);
  return [...events.values()].sort((left, right) => {
    const stepDelta = (left.step ?? -1) - (right.step ?? -1);
    if (stepDelta !== 0) return stepDelta;
    return left.timestamp.localeCompare(right.timestamp);
  });
}

export function mergeRun(
  current: RunRecord | undefined,
  snapshot: RunRecord
): RunRecord {
  if (!current) return snapshot;
  return {
    ...current,
    ...snapshot,
    events: mergeEvents(current.events, snapshot.events),
    replay: snapshot.replay.length >= current.replay.length ? snapshot.replay : current.replay
  };
}
