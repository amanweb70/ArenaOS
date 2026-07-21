import type { GridState } from "@/lib/types";

export function isGridState(value: unknown): value is GridState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GridState>;
  return (
    typeof state.width === "number" &&
    typeof state.height === "number" &&
    Boolean(state.agent) &&
    Boolean(state.goal) &&
    Array.isArray(state.obstacles)
  );
}

export function GridRenderer({
  state,
  compact = false
}: {
  state: GridState;
  compact?: boolean;
}) {
  const obstacles = new Set(state.obstacles.map((item) => `${item.x},${item.y}`));
  return (
    <div
      className={`grid-renderer ${compact ? "compact" : ""}`}
      style={{ gridTemplateColumns: `repeat(${state.width}, 1fr)` }}
      aria-label={`Grid state at step ${state.step}`}
    >
      {Array.from({ length: state.width * state.height }, (_, index) => {
        const x = index % state.width;
        const y = Math.floor(index / state.width);
        const agent = state.agent.x === x && state.agent.y === y;
        const goal = state.goal.x === x && state.goal.y === y;
        const obstacle = obstacles.has(`${x},${y}`);
        return (
          <span
            className={`${obstacle ? "obstacle" : ""} ${goal ? "goal" : ""}`}
            key={`${x}-${y}`}
          >
            {goal && <i className="goal-marker" />}
            {agent && <i className="agent-marker" />}
          </span>
        );
      })}
    </div>
  );
}

export function ReferenceGridPreview() {
  return (
    <GridRenderer
      compact
      state={{
        width: 7,
        height: 7,
        agent: { x: 1, y: 1 },
        goal: { x: 6, y: 6 },
        obstacles: [
          { x: 3, y: 0 },
          { x: 3, y: 1 },
          { x: 3, y: 2 },
          { x: 3, y: 3 },
          { x: 5, y: 3 },
          { x: 5, y: 4 }
        ],
        step: 4,
        maxSteps: 30,
        collisions: 0
      }}
    />
  );
}
