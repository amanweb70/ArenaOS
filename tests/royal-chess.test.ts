import { describe, expect, it } from "vitest";
import { createArenaSystem } from "@arena/core";
import {
  RoyalChessEnvironment,
  royalChessPlugin
} from "@arena/plugin-royal-chess";
import { randomUUID } from "node:crypto";
import {
  boardPointToSquare,
  squareToBoardPosition
} from "../apps/web/features/environments/royal-chess/royal-chess-coordinates.js";

function move(from: string, to: string) {
  return {
    id: randomUUID(),
    type: "chess.move",
    arguments: { from, to }
  };
}

describe("Royal Chess Arena", () => {
  it("projects every visible board square back to the same logical square", () => {
    for (const file of "abcdefgh") {
      for (let rank = 1; rank <= 8; rank += 1) {
        const square = `${file}${rank}`;
        const [x, , z] = squareToBoardPosition(square);
        expect(boardPointToSquare(x, z)).toBe(square);
      }
    }
    expect(boardPointToSquare(9, 9)).toBeUndefined();
  });

  it("applies legal moves and detects checkmate through the authoritative engine", async () => {
    const environment = new RoyalChessEnvironment();
    await environment.initialize({ episodeId: "chess-episode" });
    await environment.reset({ episodeId: "chess-episode" });

    await environment.step(move("f2", "f3"));
    await environment.step(move("e7", "e5"));
    await environment.step(move("g2", "g4"));
    const result = await environment.step(move("d8", "h4"));

    expect(result.terminated).toBe(true);
    expect(result.terminationReason).toBe("checkmate");
    expect(result.state?.result?.winner).toBe("black");
    expect(result.state?.history.map((item) => item.san)).toEqual([
      "f3",
      "e5",
      "g4",
      "Qh4#"
    ]);
  });

  it("routes alternating turns to independently configured participants", async () => {
    const system = createArenaSystem();
    await system.plugins.register(royalChessPlugin);

    const run = await system.orchestrator.runExperiment({
      name: "Royal baseline match",
      environmentId: "royal-chess-v1",
      agentId: "royal-greedy",
      participants: [
        {
          id: "white",
          kind: "agent",
          agentId: "royal-greedy",
          displayName: "Crown Tactician",
          role: "white"
        },
        {
          id: "black",
          kind: "agent",
          agentId: "royal-positional",
          displayName: "Court Strategist",
          role: "black"
        }
      ],
      evaluatorIds: ["chess-result", "chess-legal-actions"],
      scenario: {
        id: "standard",
        name: "Standard Royal Match",
        environmentId: "royal-chess-v1",
        parameters: {
          whiteParticipantId: "white",
          blackParticipantId: "black",
          maxPlies: 20
        }
      },
      episodeLimits: { maxSteps: 20, maxDurationMs: 30_000 }
    });

    expect(run.status).toBe("completed");
    expect(run.steps).toBeGreaterThan(1);
    const generated = run.events.filter(
      (event) => event.type === "agent.action_generated"
    );
    expect(
      generated.slice(0, 4).map(
        (event) =>
          (event.payload as { participant: { id: string } }).participant.id
      )
    ).toEqual(["white", "black", "white", "black"]);
    expect(run.replay).toHaveLength(run.steps);
    expect(
      run.replay.every((frame, index) => {
        const state = frame.state as { ply?: number; fen?: string; history?: Array<{ fenAfter: string }> };
        return (
          state.ply === index + 1 &&
          state.fen === state.history?.at(-1)?.fenAfter
        );
      })
    ).toBe(true);
  });

  it("rejects an illegal human-style move without advancing or corrupting the position", async () => {
    const environment = new RoyalChessEnvironment();
    await environment.initialize({ episodeId: "illegal-chess-move" });
    const reset = await environment.reset({ episodeId: "illegal-chess-move" });
    const result = await environment.step(move("e2", "e5"));

    expect(result.info).toMatchObject({ accepted: false, rejectionReason: "illegal_move" });
    expect(result.state?.ply).toBe(0);
    expect(result.state?.fen).toBe(reset.state?.fen);
    expect(result.state?.invalidActions.white).toBe(1);
    expect(result.events?.map((event) => event.type)).toContain("chess.invalid_move");
  });

  it("supports promotion choices through the authoritative rules engine", async () => {
    const environment = new RoyalChessEnvironment();
    await environment.initialize({ episodeId: "promotion" });
    await environment.reset({
      episodeId: "promotion",
      scenario: {
        id: "promotion-test",
        name: "Promotion test",
        environmentId: "royal-chess-v1",
        parameters: { initialFen: "7k/P7/8/8/8/8/8/7K w - - 0 1" }
      }
    });

    const result = await environment.step({
      ...move("a7", "a8"),
      arguments: { from: "a7", to: "a8", promotion: "n" }
    });

    expect(result.info).toMatchObject({ accepted: true });
    expect(result.state?.lastMove?.promotion).toBe("n");
    expect(result.state?.board).toContainEqual({ square: "a8", type: "n", side: "white" });
  });
});
