"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type {
  ChessPieceSymbol,
  EnvironmentSummary,
  RoyalChessState
} from "@/lib/types";
import { RoyalChessScene, type ChessCameraMode } from "./royal-chess-scene";
import { RoyalChessLauncher } from "./royal-chess-launcher";

export function RoyalChessEnvironmentPage({
  environment
}: {
  environment: EnvironmentSummary;
}) {
  const [camera, setCamera] = useState<ChessCameraMode>("broadcast");
  return (
    <div
      className="royal-environment-page"
      style={{ "--environment-accent": "#d5ad62" } as CSSProperties}
    >
      <section className="shell royal-environment-hero">
        <div className="royal-title">
          <Link href="/environments">← ALL ENVIRONMENTS</Link>
          <span>FLAGSHIP WORLD / 01</span>
          <h1>ROYAL<br />CHESS<br /><em>ARENA</em></h1>
          <p>
            Two intelligent systems enter a carved tournament chamber. Every move,
            hesitation, rejection, capture, and result becomes ArenaOS evidence.
          </p>
          <div className="tag-row">
            {(environment.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
        <div className="royal-showcase">
          <div className="royal-showcase-top">
            <span>CROWN PROTOCOL</span>
            <b><i /> ARENA READY</b>
          </div>
          <div className="royal-showcase-scene">
            <RoyalChessScene
              state={standardRoyalState}
              cameraMode={camera}
              interactive
            />
          </div>
          <div className="camera-switcher">
            {(["broadcast", "top", "white", "black", "free"] as ChessCameraMode[]).map(
              (mode) => (
                <button
                  className={camera === mode ? "active" : ""}
                  onClick={() => setCamera(mode)}
                  key={mode}
                >
                  {mode}
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <section className="royal-marquee">
        <div className="shell">
          <span>AGENT VS AGENT</span><i>◆</i>
          <span>AUTHORITATIVE RULES</span><i>◆</i>
          <span>LIVE OBSERVABILITY</span><i>◆</i>
          <span>DETERMINISTIC REPLAY</span>
        </div>
      </section>

      <section className="shell royal-environment-body">
        <div className="royal-story">
          <span>01 / THE CONTEST</span>
          <h2>Not chess decoration. A real multi-agent experiment.</h2>
          <p>
            Royal Chess extends the ArenaOS experiment contract with explicit white
            and black participants. The authoritative backend selects the active
            participant, validates its structured move through chess.js, advances the
            position, and records the resulting FEN, PGN, notation, events, evaluations,
            and replay frame.
          </p>
          <div className="royal-facts">
            <article><strong>8×8</strong><span>AUTHORITATIVE BOARD</span></article>
            <article><strong>2</strong><span>INDEPENDENT AGENTS</span></article>
            <article><strong>100%</strong><span>RECORDED MOVES</span></article>
          </div>
          <span>02 / THE ROYAL SET</span>
          <h2>Ivory Crown versus Obsidian Crown.</h2>
          <p>
            The procedural 3D pieces borrow the weight and silhouette of carved royal
            sets: crowned monarchs, armored horses, clerical bishops, castle rooks, and
            guard-like pawns. The board uses walnut, ivory, brass, and theatrical warm
            light without requiring external model files.
          </p>
          <div className="capability-grid">
            {Object.entries(environment.capabilities).map(([key, value]) => (
              <div key={key}><span>{key}</span><b>{String(value)}</b></div>
            ))}
          </div>
        </div>
        <aside><RoyalChessLauncher /></aside>
      </section>
    </div>
  );
}

const pieces = "rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR";
const symbolMap: Record<
  string,
  { type: ChessPieceSymbol; side: "white" | "black" }
> = {};
for (const symbol of ["p", "n", "b", "r", "q", "k"]) {
  symbolMap[symbol] = { type: symbol as ChessPieceSymbol, side: "black" };
  symbolMap[symbol.toUpperCase()] = {
    type: symbol as ChessPieceSymbol,
    side: "white"
  };
}

const standardRoyalState: RoyalChessState = {
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  pgn: "",
  turn: "white",
  ply: 0,
  fullMoveNumber: 1,
  status: "ready",
  inCheck: false,
  isCheckmate: false,
  isDraw: false,
  history: [],
  board: [...pieces].flatMap((symbol, index) => {
    if (symbol === ".") return [];
    const file = index % 8;
    const rank = 8 - Math.floor(index / 8);
    return [{
      square: `${String.fromCharCode(97 + file)}${rank}`,
      ...symbolMap[symbol]!
    }];
  }),
  capturedPieces: { white: [], black: [] },
  invalidActions: { white: 0, black: 0 },
  participants: { white: "white", black: "black" },
  maxPlies: 120
};
