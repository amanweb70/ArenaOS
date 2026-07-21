import type { ChemCraftState } from "../../../lib/types.js";

export function isChemCraftState(value: unknown): value is ChemCraftState {
  return Boolean(
    value &&
      typeof value === "object" &&
      "molecularAssets" in value &&
      "toolHistory" in value &&
      "reproducibility" in value
  );
}

export function chemCraftProgressIndex(state: ChemCraftState): number {
  return (
    state.toolHistory.length * 10 +
    state.workspace.notes.length * 3 +
    (state.submission ? 2 : 0) +
    (state.evaluation ? 1 : 0)
  );
}

export function buildChemCraftReplayFrames(values: unknown[]): ChemCraftState[] {
  const frames = values.filter(isChemCraftState).map((state) => structuredClone(state));
  const unique = new Map<string, ChemCraftState>();
  for (const state of frames) {
    const key = [
      state.toolHistory.length,
      state.workspace.notes.length,
      Boolean(state.submission),
      Boolean(state.evaluation),
      state.status
    ].join(":");
    unique.set(key, state);
  }
  return [...unique.values()].sort(
    (left, right) => chemCraftProgressIndex(left) - chemCraftProgressIndex(right)
  );
}
