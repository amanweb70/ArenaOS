import {
  type AgentAction,
  type ArenaEvent,
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

export interface GeneratedPosition {
  x: number;
  y: number;
}

export interface GeneratedEnvironmentManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  instructions: string;
  category: string;
  tags: string[];
  visual: {
    style: string;
    accent: string;
    background: string;
    agentGlyph: string;
    goalGlyph: string;
  };
  world: {
    width: number;
    height: number;
    start: GeneratedPosition;
    goal: GeneratedPosition;
    obstacles: GeneratedPosition[];
  };
  mechanics: {
    maxSteps: number;
    moveReward: number;
    collisionPenalty: number;
    goalReward: number;
  };
}

type Direction = "north" | "south" | "east" | "west";
type GeneratedAction =
  | AgentAction<{ direction: Direction }>
  | AgentAction<Record<string, never>>;

export interface GeneratedEnvironmentState {
  width: number;
  height: number;
  agent: GeneratedPosition;
  goal: GeneratedPosition;
  obstacles: GeneratedPosition[];
  step: number;
  maxSteps: number;
  collisions: number;
  score: number;
}

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
              direction: { enum: ["north", "south", "east", "west"] }
            }
          }
        }
      }
    },
    {
      if: { properties: { type: { const: "wait" } } },
      then: {
        properties: { arguments: { type: "object", maxProperties: 0 } }
      }
    }
  ]
};

const observationSchema: JsonSchema = {
  type: "object",
  required: ["width", "height", "self", "goal", "visibleObstacles", "remainingSteps", "instructions"],
  properties: {
    width: { type: "integer", minimum: 3, maximum: 16 },
    height: { type: "integer", minimum: 3, maximum: 16 },
    self: { $ref: "#/$defs/position" },
    goal: { $ref: "#/$defs/position" },
    visibleObstacles: { type: "array", items: { $ref: "#/$defs/position" } },
    remainingSteps: { type: "integer", minimum: 0 },
    instructions: { type: "string" }
  },
  $defs: {
    position: {
      type: "object",
      required: ["x", "y"],
      additionalProperties: false,
      properties: { x: { type: "integer" }, y: { type: "integer" } }
    }
  }
};

export function createGeneratedEnvironmentFactory(
  manifest: GeneratedEnvironmentManifest
): EnvironmentFactory {
  const snapshot = structuredClone(manifest);
  const metadata: EnvironmentMetadata = {
    id: snapshot.id,
    name: snapshot.name,
    version: snapshot.version,
    description: snapshot.description,
    tags: [...snapshot.tags, "codex-generated"],
    runtime: "in-process"
  };
  return {
    metadata,
    create: () => new GeneratedGridEnvironment(snapshot, metadata)
  };
}

class GeneratedGridEnvironment
  implements Environment<Record<string, unknown>, GeneratedAction, GeneratedEnvironmentState>
{
  #episodeId = "";
  #state: GeneratedEnvironmentState;

  constructor(
    private readonly manifest: GeneratedEnvironmentManifest,
    readonly metadata: EnvironmentMetadata
  ) {
    this.#state = this.initialState();
  }

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
  }

  async reset(input: EnvironmentResetInput): Promise<EnvironmentResetResult<Record<string, unknown>, GeneratedEnvironmentState>> {
    this.#episodeId = input.episodeId;
    this.#state = this.initialState();
    return { observation: this.observation(), state: structuredClone(this.#state) };
  }

  async step(action: GeneratedAction): Promise<EnvironmentStepResult<Record<string, unknown>, GeneratedEnvironmentState>> {
    this.#state.step += 1;
    let reward = action.type === "wait" ? this.manifest.mechanics.moveReward : 0;
    const events: ArenaEvent[] = [];
    if (action.type === "move") {
      const candidate = move(this.#state.agent, action.arguments.direction);
      if (this.blocked(candidate)) {
        this.#state.collisions += 1;
        reward = this.manifest.mechanics.collisionPenalty;
        events.push(this.event("generated.collision", { from: this.#state.agent, attempted: candidate }));
      } else {
        this.#state.agent = candidate;
        reward = this.manifest.mechanics.moveReward;
      }
    }
    const success = equal(this.#state.agent, this.#state.goal);
    const exhausted = this.#state.step >= this.#state.maxSteps;
    if (success) {
      reward = this.manifest.mechanics.goalReward;
      events.push(this.event("generated.goal_reached", { goal: this.#state.goal }));
    }
    this.#state.score += reward;
    return {
      observation: this.observation(),
      state: structuredClone(this.#state),
      reward,
      terminated: success,
      truncated: !success && exhausted,
      terminationReason: success ? "goal_reached" : exhausted ? "environment_step_limit" : undefined,
      events,
      info: {
        collisions: this.#state.collisions,
        distanceToGoal: Math.abs(this.#state.agent.x - this.#state.goal.x) + Math.abs(this.#state.agent.y - this.#state.goal.y),
        visual: this.manifest.visual
      }
    };
  }

  async getState(): Promise<GeneratedEnvironmentState> {
    return structuredClone(this.#state);
  }

  getActionSchema(): JsonSchema { return actionSchema; }
  getObservationSchema(): JsonSchema { return observationSchema; }
  getCapabilities(): EnvironmentCapabilities {
    return { deterministic: true, realtime: false, multiAgent: false, renderable: true, supportsSnapshots: true, supportsSeeding: true };
  }
  async close(): Promise<void> {}

  private initialState(): GeneratedEnvironmentState {
    return {
      width: this.manifest.world.width,
      height: this.manifest.world.height,
      agent: structuredClone(this.manifest.world.start),
      goal: structuredClone(this.manifest.world.goal),
      obstacles: structuredClone(this.manifest.world.obstacles),
      step: 0,
      maxSteps: this.manifest.mechanics.maxSteps,
      collisions: 0,
      score: 0
    };
  }

  private observation(): Observation<Record<string, unknown>> {
    return {
      id: randomUUID(), episodeId: this.#episodeId, step: this.#state.step,
      timestamp: new Date().toISOString(),
      data: {
        width: this.#state.width, height: this.#state.height,
        self: structuredClone(this.#state.agent), goal: structuredClone(this.#state.goal),
        visibleObstacles: structuredClone(this.#state.obstacles),
        remainingSteps: Math.max(0, this.#state.maxSteps - this.#state.step),
        instructions: this.manifest.instructions,
        visual: this.manifest.visual
      },
      availableActions: ["move", "wait"]
    };
  }

  private blocked(position: GeneratedPosition): boolean {
    return position.x < 0 || position.y < 0 || position.x >= this.#state.width || position.y >= this.#state.height || this.#state.obstacles.some((item) => equal(item, position));
  }

  private event(type: string, payload: unknown): ArenaEvent {
    return { id: randomUUID(), type, timestamp: new Date().toISOString(), episodeId: this.#episodeId, step: this.#state.step, source: this.metadata.id, payload };
  }
}

function move(position: GeneratedPosition, direction: Direction): GeneratedPosition {
  const offsets: Record<Direction, GeneratedPosition> = {
    north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 }
  };
  const offset = offsets[direction];
  return { x: position.x + offset.x, y: position.y + offset.y };
}

function equal(a: GeneratedPosition, b: GeneratedPosition): boolean {
  return a.x === b.x && a.y === b.y;
}
