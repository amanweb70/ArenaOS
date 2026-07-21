import {
  type AgentAction,
  type ArenaEvent,
  type ArenaPlugin,
  type Environment,
  type EnvironmentCapabilities,
  type EnvironmentFactory,
  type EnvironmentInitializeContext,
  type EnvironmentMetadata,
  type EnvironmentResetInput,
  type EnvironmentResetResult,
  type EnvironmentStepResult,
  type JsonSchema,
  type Observation
} from "@arena/contracts";
import { randomUUID } from "node:crypto";

export type Direction = "north" | "south" | "east" | "west";

export type GridAction =
  | AgentAction<{ direction: Direction }>
  | AgentAction<Record<string, never>>;

export interface Position {
  x: number;
  y: number;
}

export interface GridState {
  width: number;
  height: number;
  agent: Position;
  goal: Position;
  obstacles: Position[];
  step: number;
  maxSteps: number;
  collisions: number;
}

export interface GridObservation {
  width: number;
  height: number;
  self: Position;
  goal: Position;
  visibleObstacles: Position[];
  remainingSteps: number;
}

const metadata: EnvironmentMetadata = {
  id: "headless-grid",
  name: "Headless Grid",
  version: "0.1.0",
  description: "A deterministic grid world for validating the ArenaOS platform spine.",
  tags: ["deterministic", "headless", "reference"],
  runtime: "in-process"
};

const actionSchema: JsonSchema = {
  type: "object",
  required: ["id", "type", "arguments"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    type: { enum: ["move", "wait"] },
    summary: { type: "string" },
    metadata: { type: "object" },
    arguments: { type: "object" }
  },
  allOf: [
    {
      if: { properties: { type: { const: "move" } } },
      then: {
        properties: {
          arguments: {
            type: "object",
            required: ["direction"],
            additionalProperties: false,
            properties: {
              direction: {
                enum: ["north", "south", "east", "west"]
              }
            }
          }
        }
      }
    },
    {
      if: { properties: { type: { const: "wait" } } },
      then: {
        properties: {
          arguments: {
            type: "object",
            maxProperties: 0
          }
        }
      }
    }
  ]
};

const observationSchema: JsonSchema = {
  type: "object",
  required: [
    "width",
    "height",
    "self",
    "goal",
    "visibleObstacles",
    "remainingSteps"
  ],
  properties: {
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    self: { $ref: "#/$defs/position" },
    goal: { $ref: "#/$defs/position" },
    visibleObstacles: {
      type: "array",
      items: { $ref: "#/$defs/position" }
    },
    remainingSteps: { type: "integer", minimum: 0 }
  },
  $defs: {
    position: {
      type: "object",
      required: ["x", "y"],
      additionalProperties: false,
      properties: {
        x: { type: "integer" },
        y: { type: "integer" }
      }
    }
  }
};

export class HeadlessGridEnvironment
  implements Environment<GridObservation, GridAction, GridState>
{
  readonly metadata = metadata;
  #episodeId = "";
  #state: GridState = defaultState();

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
  }

  async reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<GridObservation, GridState>> {
    this.#episodeId = input.episodeId;
    const provided = input.scenario?.initialState as Partial<GridState> | undefined;
    const parameters = input.scenario?.parameters ?? {};
    this.#state = {
      ...defaultState(),
      ...structuredClone(provided),
      maxSteps:
        typeof parameters.maxSteps === "number"
          ? parameters.maxSteps
          : (provided?.maxSteps ?? 30),
      step: 0,
      collisions: 0
    };
    this.assertValidState();
    return {
      observation: this.createObservation(),
      state: structuredClone(this.#state)
    };
  }

  async step(
    action: GridAction
  ): Promise<EnvironmentStepResult<GridObservation, GridState>> {
    this.#state.step += 1;
    const events: ArenaEvent[] = [];
    let reward = -0.01;

    if (action.type === "move") {
      const direction = (action.arguments as { direction: Direction }).direction;
      const candidate = move(this.#state.agent, direction);
      if (this.isBlocked(candidate)) {
        this.#state.collisions += 1;
        reward = -0.1;
        events.push(
          environmentEvent(
            "grid.collision_attempted",
            this.#episodeId,
            this.#state.step,
            { from: this.#state.agent, attempted: candidate }
          )
        );
      } else {
        this.#state.agent = candidate;
      }
    }

    const reachedGoal = samePosition(this.#state.agent, this.#state.goal);
    const exhausted = this.#state.step >= this.#state.maxSteps;
    if (reachedGoal) {
      reward = 1;
      events.push(
        environmentEvent(
          "grid.goal_reached",
          this.#episodeId,
          this.#state.step,
          { goal: this.#state.goal }
        )
      );
    }

    return {
      observation: this.createObservation(),
      state: structuredClone(this.#state),
      reward,
      terminated: reachedGoal,
      truncated: !reachedGoal && exhausted,
      terminationReason: reachedGoal
        ? "goal_reached"
        : exhausted
          ? "environment_step_limit"
          : undefined,
      events,
      info: {
        collisions: this.#state.collisions,
        distanceToGoal: manhattan(this.#state.agent, this.#state.goal)
      }
    };
  }

  async getState(): Promise<GridState> {
    return structuredClone(this.#state);
  }

  getActionSchema(): JsonSchema {
    return actionSchema;
  }

  getObservationSchema(): JsonSchema {
    return observationSchema;
  }

  getCapabilities(): EnvironmentCapabilities {
    return {
      deterministic: true,
      realtime: false,
      multiAgent: false,
      renderable: false,
      supportsSnapshots: true,
      supportsSeeding: true
    };
  }

  async close(): Promise<void> {}

  private createObservation(): Observation<GridObservation> {
    return {
      id: randomUUID(),
      episodeId: this.#episodeId,
      step: this.#state.step,
      timestamp: new Date().toISOString(),
      data: {
        width: this.#state.width,
        height: this.#state.height,
        self: structuredClone(this.#state.agent),
        goal: structuredClone(this.#state.goal),
        visibleObstacles: structuredClone(this.#state.obstacles),
        remainingSteps: Math.max(0, this.#state.maxSteps - this.#state.step)
      },
      availableActions: ["move", "wait"]
    };
  }

  private isBlocked(position: Position): boolean {
    return (
      position.x < 0 ||
      position.y < 0 ||
      position.x >= this.#state.width ||
      position.y >= this.#state.height ||
      this.#state.obstacles.some((obstacle) => samePosition(obstacle, position))
    );
  }

  private assertValidState(): void {
    const positions = [
      this.#state.agent,
      this.#state.goal,
      ...this.#state.obstacles
    ];
    for (const position of positions) {
      if (
        position.x < 0 ||
        position.y < 0 ||
        position.x >= this.#state.width ||
        position.y >= this.#state.height
      ) {
        throw new Error(`Grid position is outside the environment: ${JSON.stringify(position)}`);
      }
    }
  }
}

function defaultState(): GridState {
  return {
    width: 7,
    height: 7,
    agent: { x: 0, y: 0 },
    goal: { x: 6, y: 6 },
    obstacles: [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 4, y: 5 }
    ],
    step: 0,
    maxSteps: 30,
    collisions: 0
  };
}

function move(position: Position, direction: Direction): Position {
  const offsets: Record<Direction, Position> = {
    north: { x: 0, y: -1 },
    south: { x: 0, y: 1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 }
  };
  const offset = offsets[direction];
  return {
    x: position.x + offset.x,
    y: position.y + offset.y
  };
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function environmentEvent(
  type: string,
  episodeId: string,
  step: number,
  payload: unknown
): ArenaEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    episodeId,
    step,
    source: metadata.id,
    payload
  };
}

const factory: EnvironmentFactory = {
  metadata,
  create: () => new HeadlessGridEnvironment()
};

export const headlessGridPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.headless-grid",
    name: "Headless Grid",
    version: "0.1.0",
    description: "Reference environment plugin for ArenaOS."
  },
  async register(context) {
    context.environments.register(metadata.id, factory);
  }
};

