import {
  type ArenaEvent,
  type ArenaPlugin,
  type ComponentMetadata,
  type EpisodeEvaluationInput,
  type EpisodeEvaluationResult,
  type Evaluator,
  type EvaluatorFactory
} from "@arena/contracts";

interface GridState {
  agent?: { x: number; y: number };
  goal?: { x: number; y: number };
  maxSteps?: number;
  collisions?: number;
}

class SuccessEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "success",
    name: "Task Success",
    version: "0.1.0"
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as GridState;
    const success =
      state.agent?.x === state.goal?.x && state.agent?.y === state.goal?.y;
    return {
      evaluatorId: this.metadata.id,
      score: success ? 1 : 0,
      passed: success,
      metrics: [{ name: "success", value: success }],
      summary: success ? "The agent reached the goal." : "The goal was not reached."
    };
  }
}

class StepEfficiencyEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "step-efficiency",
    name: "Step Efficiency",
    version: "0.1.0"
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as GridState;
    const budget = state.maxSteps ?? input.context.config.episodeLimits.maxSteps ?? 1;
    const score = Math.max(0, 1 - Math.max(0, input.steps - 1) / budget);
    return {
      evaluatorId: this.metadata.id,
      score,
      metrics: [
        { name: "steps", value: input.steps, unit: "steps" },
        { name: "step_efficiency", value: score }
      ],
      summary: `Completed in ${input.steps} step${input.steps === 1 ? "" : "s"}.`
    };
  }
}

class InvalidActionEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "invalid-actions",
    name: "Invalid Actions",
    version: "0.1.0"
  };
  #invalidActions = 0;

  async onEvent(event: ArenaEvent): Promise<void> {
    if (event.type === "agent.action_rejected") {
      this.#invalidActions += 1;
    }
  }

  async evaluateEpisode(): Promise<EpisodeEvaluationResult> {
    return {
      evaluatorId: this.metadata.id,
      score: this.#invalidActions === 0 ? 1 : 0,
      passed: this.#invalidActions === 0,
      metrics: [{ name: "invalid_actions", value: this.#invalidActions }],
      summary:
        this.#invalidActions === 0
          ? "Every generated action passed schema validation."
          : `${this.#invalidActions} action(s) failed schema validation.`
    };
  }
}

class CollisionEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "collisions",
    name: "Collision Attempts",
    version: "0.1.0"
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as GridState;
    const collisions = state.collisions ?? 0;
    return {
      evaluatorId: this.metadata.id,
      score: collisions === 0 ? 1 : 1 / (collisions + 1),
      passed: collisions === 0,
      metrics: [{ name: "collision_attempts", value: collisions }],
      summary: `${collisions} collision attempt${collisions === 1 ? "" : "s"}.`
    };
  }
}

function factory(
  evaluator: new () => Evaluator
): EvaluatorFactory {
  const instance = new evaluator();
  return {
    metadata: instance.metadata,
    create: () => new evaluator()
  };
}

const factories = [
  factory(SuccessEvaluator),
  factory(StepEfficiencyEvaluator),
  factory(InvalidActionEvaluator),
  factory(CollisionEvaluator)
];

export const nativeEvaluatorsPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.native-evaluators",
    name: "Native Evaluators",
    version: "0.1.0"
  },
  async register(context) {
    for (const evaluatorFactory of factories) {
      context.evaluators.register(
        evaluatorFactory.metadata.id,
        evaluatorFactory
      );
    }
  }
};
