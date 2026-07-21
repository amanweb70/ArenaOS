import {
  type Agent,
  type AgentActInput,
  type AgentActResult,
  type AgentAction,
  type AgentFactory,
  type AgentInitializeContext,
  type AgentMetadata,
  type ArenaPlugin
} from "@arena/contracts";
import { randomUUID } from "node:crypto";

type Direction = "north" | "south" | "east" | "west";

interface Position {
  x: number;
  y: number;
}

interface GridObservation {
  width: number;
  height: number;
  self: Position;
  goal: Position;
  visibleObstacles: Position[];
  remainingSteps: number;
}

const metadata: AgentMetadata = {
  id: "scripted-agent",
  name: "Scripted Shortest-Path Agent",
  version: "0.1.0",
  description: "A deterministic breadth-first-search baseline for Headless Grid.",
  provider: "arena"
};

export class ScriptedGridAgent
  implements Agent<GridObservation, AgentAction<{ direction: Direction }>>
{
  readonly metadata = metadata;

  async initialize(_context: AgentInitializeContext): Promise<void> {}

  async act(
    input: AgentActInput<GridObservation>
  ): Promise<AgentActResult<AgentAction<{ direction: Direction }>>> {
    const direction = nextDirection(input.observation.data);
    return {
      action: {
        id: randomUUID(),
        type: "move",
        arguments: { direction },
        summary: `Following the shortest known path ${direction}.`
      }
    };
  }

  async reset(): Promise<void> {}
  async close(): Promise<void> {}
}

function nextDirection(observation: GridObservation): Direction {
  const queue: Array<{ position: Position; path: Direction[] }> = [
    { position: observation.self, path: [] }
  ];
  const visited = new Set([key(observation.self)]);
  const obstacles = new Set(observation.visibleObstacles.map(key));
  const directions: Array<{ name: Direction; dx: number; dy: number }> = [
    { name: "east", dx: 1, dy: 0 },
    { name: "south", dx: 0, dy: 1 },
    { name: "west", dx: -1, dy: 0 },
    { name: "north", dx: 0, dy: -1 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (key(current.position) === key(observation.goal)) {
      const first = current.path[0];
      if (!first) {
        return "north";
      }
      return first;
    }

    for (const direction of directions) {
      const position = {
        x: current.position.x + direction.dx,
        y: current.position.y + direction.dy
      };
      const positionKey = key(position);
      if (
        position.x < 0 ||
        position.y < 0 ||
        position.x >= observation.width ||
        position.y >= observation.height ||
        obstacles.has(positionKey) ||
        visited.has(positionKey)
      ) {
        continue;
      }
      visited.add(positionKey);
      queue.push({
        position,
        path: [...current.path, direction.name]
      });
    }
  }

  throw new Error("The scripted agent could not find a path to the goal.");
}

function key(position: Position): string {
  return `${position.x},${position.y}`;
}

const factory: AgentFactory = {
  metadata,
  create: () => new ScriptedGridAgent()
};

export const scriptedAgentPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.scripted-agent",
    name: "Scripted Agent",
    version: "0.1.0"
  },
  async register(context) {
    context.agents.register(metadata.id, factory);
  }
};

