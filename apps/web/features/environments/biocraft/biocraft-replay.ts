import type { BioCraftState } from "../../../lib/types.js";

export function isBioCraftState(value: unknown): value is BioCraftState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BioCraftState>;
  return (
    typeof candidate.challengeId === "string" &&
    Array.isArray(candidate.toolHistory) &&
    Boolean(candidate.biologicalAssets) &&
    Boolean(candidate.workspace)
  );
}

export function bioCraftProgressIndex(state: BioCraftState): number {
  return (
    state.toolHistory.length +
    state.workspace.notes.length +
    (state.submission ? 1 : 0)
  );
}

export function buildBioCraftReplayFrames(candidates: unknown[]): BioCraftState[] {
  const frames = new Map<number, BioCraftState>();
  for (const candidate of candidates) {
    if (!isBioCraftState(candidate)) continue;
    frames.set(bioCraftProgressIndex(candidate), candidate);
  }
  return [...frames.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, state]) => state);
}
