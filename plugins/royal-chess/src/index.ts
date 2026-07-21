import {
  type Agent,
  type AgentActInput,
  type AgentActResult,
  type AgentAction,
  type AgentFactory,
  type AgentInitializeContext,
  type AgentMetadata,
  type ArenaEvent,
  type ArenaPlugin,
  type ComponentMetadata,
  type Environment,
  type EnvironmentCapabilities,
  type EnvironmentFactory,
  type EnvironmentInitializeContext,
  type EnvironmentMetadata,
  type EnvironmentResetInput,
  type EnvironmentResetResult,
  type EnvironmentStepResult,
  type EpisodeEvaluationInput,
  type EpisodeEvaluationResult,
  type Evaluator,
  type EvaluatorFactory,
  type JsonSchema,
  type Observation
} from "@arena/contracts";
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { randomUUID } from "node:crypto";

export type ChessSide = "white" | "black";

export interface RoyalChessMoveArguments {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export type RoyalChessAction = AgentAction<RoyalChessMoveArguments>;

export interface RoyalChessMoveRecord {
  ply: number;
  side: ChessSide;
  from: string;
  to: string;
  san: string;
  uci: string;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  flags: string;
  fenBefore: string;
  fenAfter: string;
  inCheck: boolean;
  isCheckmate: boolean;
}

export interface RoyalChessPiece {
  square: string;
  type: PieceSymbol;
  side: ChessSide;
}

export interface RoyalChessResult {
  type:
    | "checkmate"
    | "stalemate"
    | "repetition"
    | "fifty_move_rule"
    | "insufficient_material"
    | "move_limit"
    | "draw";
  winner?: ChessSide;
  loser?: ChessSide;
  reason: string;
}

export interface RoyalChessState {
  fen: string;
  pgn: string;
  turn: ChessSide;
  ply: number;
  fullMoveNumber: number;
  status: "ready" | "running" | "completed";
  inCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  result?: RoyalChessResult;
  lastMove?: RoyalChessMoveRecord;
  history: RoyalChessMoveRecord[];
  board: RoyalChessPiece[];
  capturedPieces: { white: PieceSymbol[]; black: PieceSymbol[] };
  invalidActions: { white: number; black: number };
  participants: { white: string; black: string };
  maxPlies: number;
}

export interface RoyalChessObservation {
  environmentId: "royal-chess-v1";
  side: ChessSide;
  turn: ChessSide;
  fen: string;
  pgn: string;
  ply: number;
  fullMoveNumber: number;
  legalMoves: Array<{
    from: string;
    to: string;
    promotion?: "q" | "r" | "b" | "n";
    san: string;
    uci: string;
    piece: PieceSymbol;
    captured?: PieceSymbol;
  }>;
  lastMove?: RoyalChessMoveRecord;
  status: {
    inCheck: boolean;
    isCheckmate: boolean;
    isDraw: boolean;
  };
  material: { white: number; black: number };
  remainingPlies: number;
}

const metadata: EnvironmentMetadata = {
  id: "royal-chess-v1",
  name: "Royal Chess Arena",
  version: "1.0.0",
  description:
    "A fully observable royal chess arena for head-to-head AI agent competition.",
  tags: ["chess", "strategy", "multi-agent", "3d", "competitive", "deterministic"],
  runtime: "in-process"
};

const actionSchema: JsonSchema = {
  type: "object",
  required: ["id", "type", "arguments"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    type: { const: "chess.move" },
    summary: { type: "string" },
    metadata: { type: "object" },
    arguments: {
      type: "object",
      required: ["from", "to"],
      additionalProperties: false,
      properties: {
        from: { type: "string", pattern: "^[a-h][1-8]$" },
        to: { type: "string", pattern: "^[a-h][1-8]$" },
        promotion: { enum: ["q", "r", "b", "n"] }
      }
    }
  }
};

const observationSchema: JsonSchema = {
  type: "object",
  required: [
    "environmentId",
    "side",
    "turn",
    "fen",
    "pgn",
    "ply",
    "fullMoveNumber",
    "legalMoves",
    "status",
    "material",
    "remainingPlies"
  ],
  properties: {
    environmentId: { const: "royal-chess-v1" },
    side: { enum: ["white", "black"] },
    turn: { enum: ["white", "black"] },
    fen: { type: "string" },
    pgn: { type: "string" },
    ply: { type: "integer", minimum: 0 },
    fullMoveNumber: { type: "integer", minimum: 1 },
    legalMoves: { type: "array" },
    status: { type: "object" },
    material: { type: "object" },
    remainingPlies: { type: "integer", minimum: 0 }
  }
};

export class RoyalChessEnvironment
  implements Environment<RoyalChessObservation, RoyalChessAction, RoyalChessState>
{
  readonly metadata = metadata;
  #episodeId = "";
  #chess = new Chess();
  #state = initialState();
  #pauseBetweenMovesMs = 0;

  async initialize(context: EnvironmentInitializeContext): Promise<void> {
    this.#episodeId = context.episodeId;
  }

  async reset(
    input: EnvironmentResetInput
  ): Promise<EnvironmentResetResult<RoyalChessObservation, RoyalChessState>> {
    this.#episodeId = input.episodeId;
    const parameters = input.scenario?.parameters ?? {};
    const initialFen =
      typeof parameters.initialFen === "string" ? parameters.initialFen : undefined;
    this.#pauseBetweenMovesMs =
      typeof parameters.pauseBetweenMovesMs === "number"
        ? Math.max(0, Math.min(3_000, parameters.pauseBetweenMovesMs))
        : 0;
    this.#chess = initialFen ? new Chess(initialFen) : new Chess();
    this.#state = {
      ...initialState(),
      fen: this.#chess.fen(),
      pgn: this.#chess.pgn(),
      board: boardPieces(this.#chess),
      turn: side(this.#chess.turn()),
      maxPlies:
        typeof parameters.maxPlies === "number"
          ? Math.max(1, Math.floor(parameters.maxPlies))
          : 120,
      participants: {
        white:
          typeof parameters.whiteParticipantId === "string"
            ? parameters.whiteParticipantId
            : "white",
        black:
          typeof parameters.blackParticipantId === "string"
            ? parameters.blackParticipantId
            : "black"
      },
      status: "running"
    };
    return {
      observation: this.observation(),
      state: structuredClone(this.#state)
    };
  }

  async step(
    action: RoyalChessAction
  ): Promise<EnvironmentStepResult<RoyalChessObservation, RoyalChessState>> {
    const actingSide = side(this.#chess.turn());
    const before = this.#chess.fen();
    let move: Move;
    try {
      move = this.#chess.move({
        from: action.arguments.from as Square,
        to: action.arguments.to as Square,
        promotion: action.arguments.promotion
      });
    } catch {
      this.#state.invalidActions[actingSide] += 1;
      const event = chessEvent(
        "chess.invalid_move",
        this.#episodeId,
        this.#state.ply + 1,
        {
          side: actingSide,
          action,
          reason: "illegal_move",
          fen: before
        }
      );
      return {
        observation: this.observation(),
        state: structuredClone(this.#state),
        reward: -1,
        terminated: false,
        truncated: false,
        events: [event],
        info: { accepted: false, rejectionReason: "illegal_move" }
      };
    }

    const record: RoyalChessMoveRecord = {
      ply: this.#state.ply + 1,
      side: actingSide,
      from: move.from,
      to: move.to,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion,
      flags: move.flags,
      fenBefore: before,
      fenAfter: this.#chess.fen(),
      inCheck: this.#chess.inCheck(),
      isCheckmate: this.#chess.isCheckmate()
    };

    if (move.captured) {
      const capturedSide = actingSide === "white" ? "black" : "white";
      this.#state.capturedPieces[capturedSide].push(move.captured);
    }
    this.#state.history.push(record);
    this.#state.lastMove = record;
    this.#state.ply += 1;
    this.#state.fen = this.#chess.fen();
    this.#state.pgn = this.#chess.pgn();
    this.#state.turn = side(this.#chess.turn());
    this.#state.fullMoveNumber = Number(this.#state.fen.split(" ")[5] ?? "1");
    this.#state.inCheck = this.#chess.inCheck();
    this.#state.isCheckmate = this.#chess.isCheckmate();
    this.#state.isDraw = this.#chess.isDraw();
    this.#state.board = boardPieces(this.#chess);

    const moveLimit = this.#state.ply >= this.#state.maxPlies;
    const gameOver = this.#chess.isGameOver();
    const terminated = gameOver || moveLimit;
    if (terminated) {
      this.#state.status = "completed";
      this.#state.result = resultFor(this.#chess, actingSide, moveLimit);
    }

    const events = [
      chessEvent("chess.move_accepted", this.#episodeId, this.#state.ply, {
        move: record,
        turn: this.#state.turn
      })
    ];
    if (move.captured) {
      events.push(
        chessEvent("chess.piece_captured", this.#episodeId, this.#state.ply, {
          by: actingSide,
          piece: move.captured,
          square: move.to
        })
      );
    }
    if (this.#state.inCheck) {
      events.push(
        chessEvent(
          this.#state.isCheckmate ? "chess.checkmate" : "chess.check",
          this.#episodeId,
          this.#state.ply,
          { threatenedSide: this.#state.turn, move: record.san }
        )
      );
    }
    if (this.#state.result) {
      events.push(
        chessEvent("chess.match_completed", this.#episodeId, this.#state.ply, {
          result: this.#state.result
        })
      );
    }

    if (this.#pauseBetweenMovesMs > 0 && !terminated) {
      await new Promise((resolve) => setTimeout(resolve, this.#pauseBetweenMovesMs));
    }

    return {
      observation: this.observation(),
      state: structuredClone(this.#state),
      reward: this.#state.isCheckmate ? 1 : move.captured ? 0.1 : 0,
      terminated: gameOver,
      truncated: !gameOver && moveLimit,
      terminationReason: this.#state.result?.type,
      events,
      info: {
        accepted: true,
        san: record.san,
        uci: record.uci,
        inCheck: this.#state.inCheck,
        material: material(this.#chess)
      }
    };
  }

  async getState(): Promise<RoyalChessState> {
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
      realtime: true,
      multiAgent: true,
      renderable: true,
      supportsSnapshots: true,
      supportsPause: false,
      supportsResume: false,
      supportsSeeding: true
    };
  }

  async close(): Promise<void> {}

  private observation(): Observation<RoyalChessObservation> {
    const currentSide = side(this.#chess.turn());
    const activeParticipantId = this.#state.participants[currentSide];
    return {
      id: randomUUID(),
      episodeId: this.#episodeId,
      step: this.#state.ply,
      timestamp: new Date().toISOString(),
      activeParticipantId,
      data: {
        environmentId: "royal-chess-v1",
        side: currentSide,
        turn: currentSide,
        fen: this.#chess.fen(),
        pgn: this.#chess.pgn(),
        ply: this.#state.ply,
        fullMoveNumber: this.#state.fullMoveNumber,
        legalMoves: this.#chess.moves({ verbose: true }).map((move) => ({
          from: move.from,
          to: move.to,
          promotion: move.promotion as "q" | "r" | "b" | "n" | undefined,
          san: move.san,
          uci: `${move.from}${move.to}${move.promotion ?? ""}`,
          piece: move.piece,
          captured: move.captured
        })),
        lastMove: this.#state.lastMove,
        status: {
          inCheck: this.#chess.inCheck(),
          isCheckmate: this.#chess.isCheckmate(),
          isDraw: this.#chess.isDraw()
        },
        material: material(this.#chess),
        remainingPlies: Math.max(0, this.#state.maxPlies - this.#state.ply)
      },
      availableActions: ["chess.move"]
    };
  }
}

type Strategy = "royal-greedy" | "royal-positional";

class RoyalChessAgent implements Agent<RoyalChessObservation, RoyalChessAction> {
  readonly metadata: AgentMetadata;
  readonly #strategy: Strategy;

  constructor(strategy: Strategy) {
    this.#strategy = strategy;
    this.metadata =
      strategy === "royal-greedy"
        ? {
            id: "royal-greedy",
            name: "Crown Tactician",
            version: "1.0.0",
            description: "A deterministic material-first tactical chess baseline.",
            provider: "ArenaOS",
            model: "greedy-search",
            tags: ["chess", "baseline", "tactical"]
          }
        : {
            id: "royal-positional",
            name: "Court Strategist",
            version: "1.0.0",
            description: "A deterministic development and center-control chess baseline.",
            provider: "ArenaOS",
            model: "positional-heuristic",
            tags: ["chess", "baseline", "positional"]
          };
  }

  async initialize(_context: AgentInitializeContext): Promise<void> {}

  async act(
    input: AgentActInput<RoyalChessObservation>
  ): Promise<AgentActResult<RoyalChessAction>> {
    const moves = input.observation.data.legalMoves;
    if (!moves.length) throw new Error("Royal Chess agent received no legal moves.");
    const ranked = moves
      .map((move) => ({
        move,
        score:
          this.#strategy === "royal-greedy"
            ? tacticalScore(move)
            : positionalScore(move, input.observation.data.ply)
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.move.uci.localeCompare(right.move.uci)
      );
    const selected = ranked[0]!.move;
    return {
      action: {
        id: randomUUID(),
        type: "chess.move",
        arguments: {
          from: selected.from,
          to: selected.to,
          promotion: selected.promotion
        },
        summary:
          this.#strategy === "royal-greedy"
            ? `Prioritized tactical value and selected ${selected.san}.`
            : `Prioritized development and center control with ${selected.san}.`,
        metadata: {
          strategy: this.#strategy,
          legalMovesConsidered: moves.length
        }
      }
    };
  }

  async reset(): Promise<void> {}
  async close(): Promise<void> {}
}

class ChessResultEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "chess-result",
    name: "Chess Match Result",
    version: "1.0.0",
    tags: ["chess"]
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as RoyalChessState;
    const decisive = Boolean(state.result?.winner);
    return {
      evaluatorId: this.metadata.id,
      score: decisive ? 1 : 0.5,
      passed: state.status === "completed",
      metrics: [
        { name: "plies", value: state.ply, unit: "plies" },
        { name: "decisive_result", value: decisive },
        { name: "winner", value: state.result?.winner ?? "draw" }
      ],
      summary: state.result?.reason ?? "Match did not produce a result."
    };
  }
}

class ChessLegalActionEvaluator implements Evaluator {
  readonly metadata: ComponentMetadata = {
    id: "chess-legal-actions",
    name: "Chess Legal-Action Rate",
    version: "1.0.0",
    tags: ["chess"]
  };

  async evaluateEpisode(
    input: EpisodeEvaluationInput
  ): Promise<EpisodeEvaluationResult> {
    const state = input.finalState as RoyalChessState;
    const invalid = state.invalidActions.white + state.invalidActions.black;
    const total = state.ply + invalid;
    const rate = total ? state.ply / total : 1;
    return {
      evaluatorId: this.metadata.id,
      score: rate,
      passed: invalid === 0,
      metrics: [
        { name: "legal_action_rate", value: rate },
        { name: "invalid_actions", value: invalid }
      ],
      summary: `${(rate * 100).toFixed(1)}% of attempted moves were legal.`
    };
  }
}

function initialState(): RoyalChessState {
  const chess = new Chess();
  return {
    fen: chess.fen(),
    pgn: "",
    turn: "white",
    ply: 0,
    fullMoveNumber: 1,
    status: "ready",
    inCheck: false,
    isCheckmate: false,
    isDraw: false,
    history: [],
    board: boardPieces(chess),
    capturedPieces: { white: [], black: [] },
    invalidActions: { white: 0, black: 0 },
    participants: { white: "white", black: "black" },
    maxPlies: 120
  };
}

function side(color: Color): ChessSide {
  return color === "w" ? "white" : "black";
}

function boardPieces(chess: Chess): RoyalChessPiece[] {
  return chess
    .board()
    .flat()
    .filter((piece): piece is NonNullable<typeof piece> => Boolean(piece))
    .map((piece) => ({
      square: piece.square,
      type: piece.type,
      side: side(piece.color)
    }));
}

const pieceValues: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

function material(chess: Chess): { white: number; black: number } {
  return boardPieces(chess).reduce(
    (score, piece) => {
      score[piece.side] += pieceValues[piece.type];
      return score;
    },
    { white: 0, black: 0 }
  );
}

function tacticalScore(move: RoyalChessObservation["legalMoves"][number]): number {
  return (
    (move.san.includes("#") ? 10_000 : 0) +
    (move.san.includes("+") ? 25 : 0) +
    (move.captured ? pieceValues[move.captured] * 100 : 0) +
    (move.promotion ? pieceValues[move.promotion] * 80 : 0) +
    centerScore(move.to)
  );
}

function positionalScore(
  move: RoyalChessObservation["legalMoves"][number],
  ply: number
): number {
  const development =
    ply < 20 && ["n", "b"].includes(move.piece) && ["1", "8"].includes(move.from[1]!)
      ? 35
      : 0;
  const castle = move.san === "O-O" || move.san === "O-O-O" ? 80 : 0;
  return (
    castle +
    development +
    centerScore(move.to) * 8 +
    (move.captured ? pieceValues[move.captured] * 25 : 0) +
    (move.san.includes("+") ? 12 : 0) +
    (move.san.includes("#") ? 10_000 : 0)
  );
}

function centerScore(square: string): number {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return 7 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
}

function resultFor(
  chess: Chess,
  lastMover: ChessSide,
  moveLimit: boolean
): RoyalChessResult {
  if (chess.isCheckmate()) {
    const loser = side(chess.turn());
    return {
      type: "checkmate",
      winner: lastMover,
      loser,
      reason: `${lastMover === "white" ? "Ivory" : "Obsidian"} Crown delivered checkmate.`
    };
  }
  if (chess.isStalemate()) return { type: "stalemate", reason: "Draw by stalemate." };
  if (chess.isThreefoldRepetition()) {
    return { type: "repetition", reason: "Draw by threefold repetition." };
  }
  if (chess.isInsufficientMaterial()) {
    return { type: "insufficient_material", reason: "Draw by insufficient material." };
  }
  if (moveLimit) return { type: "move_limit", reason: "Draw by configured move limit." };
  return { type: "draw", reason: "The rules engine declared a draw." };
}

function chessEvent(
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

function agentFactory(strategy: Strategy): AgentFactory {
  const instance = new RoyalChessAgent(strategy);
  return {
    metadata: instance.metadata,
    create: () => new RoyalChessAgent(strategy)
  };
}

function evaluatorFactory(
  EvaluatorClass: new () => Evaluator
): EvaluatorFactory {
  const instance = new EvaluatorClass();
  return {
    metadata: instance.metadata,
    create: () => new EvaluatorClass()
  };
}

const environmentFactory: EnvironmentFactory = {
  metadata,
  create: () => new RoyalChessEnvironment()
};

export const royalChessPlugin: ArenaPlugin = {
  manifest: {
    id: "arena.royal-chess",
    name: "Royal Chess Arena",
    version: "1.0.0",
    description: "Multi-agent chess environment, baselines, and native chess evaluators."
  },
  async register(context) {
    context.environments.register(metadata.id, environmentFactory);
    for (const factory of [
      agentFactory("royal-greedy"),
      agentFactory("royal-positional")
    ]) {
      context.agents.register(factory.metadata.id, factory);
    }
    for (const factory of [
      evaluatorFactory(ChessResultEvaluator),
      evaluatorFactory(ChessLegalActionEvaluator)
    ]) {
      context.evaluators.register(factory.metadata.id, factory);
    }
  }
};
