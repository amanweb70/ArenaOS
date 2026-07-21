"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess, type Move, type Square } from "chess.js";
import type { ArenaEvent, RunRecord } from "@arena/contracts";
import type { StreamState } from "@/hooks/use-run-stream";
import { arenaApi } from "@/lib/arena-api";
import { formatDuration, durationMs, shortId } from "@/lib/format";
import type {
  ChessPieceSymbol,
  ChessSide,
  RoyalChessMoveRecord,
  RoyalChessState
} from "@/lib/types";
import {
  isRoyalChessState,
  RoyalChessScene,
  type ChessCameraMode
} from "./royal-chess-scene";
import { StatusChip } from "@/components/status-chip";

export function RoyalChessRunView({
  run,
  events,
  connection,
  error,
  recover
}: {
  run: RunRecord;
  events: ArenaEvent[];
  connection: StreamState;
  error?: string;
  recover: () => Promise<RunRecord | undefined>;
}) {
  const [camera, setCamera] = useState<ChessCameraMode>("broadcast");
  const [replayIndex, setReplayIndex] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string>();
  const [moveError, setMoveError] = useState<string>();
  const [submittingMove, setSubmittingMove] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
    moves: Move[];
  }>();
  const audioRef = useRef<AudioContext | null>(null);
  const latestStepEvent = [...events]
    .reverse()
    .find((event) => event.type === "environment.step_completed");
  const streamedState = (
    latestStepEvent?.payload as { state?: unknown } | undefined
  )?.state;
  const resetEvent = [...events]
    .reverse()
    .find((event) => event.type === "environment.reset");
  const resetState = (resetEvent?.payload as { state?: unknown } | undefined)?.state;
  const latestState = isRoyalChessState(streamedState)
    ? streamedState
    : isRoyalChessState(run.finalState)
      ? run.finalState
      : resetState;
  const replayFrames = useMemo(() => {
    const byPly = new Map<number, RoyalChessState>();
    if (isRoyalChessState(resetState)) byPly.set(0, resetState);
    for (const frame of run.replay) {
      if (isRoyalChessState(frame.state)) byPly.set(frame.state.ply, frame.state);
    }
    for (const event of events) {
      if (event.type !== "environment.step_completed") continue;
      const eventState = (event.payload as { state?: unknown } | undefined)?.state;
      if (isRoyalChessState(eventState)) byPly.set(eventState.ply, eventState);
    }
    return [...byPly.values()].sort((left, right) => left.ply - right.ply);
  }, [events, resetState, run.replay]);
  const replayState = replayIndex === undefined ? undefined : replayFrames[replayIndex];
  const state = (isRoyalChessState(replayState) ? replayState : latestState) as RoyalChessState;
  const lastSoundPly = useRef(0);

  useEffect(() => {
    setSelectedSquare(undefined);
    setMoveError(undefined);
    setSubmittingMove(false);
    setPendingPromotion(undefined);
  }, [state?.ply]);

  useEffect(() => {
    let soundPreferred = false;
    try {
      const preferences = JSON.parse(
        window.localStorage.getItem("arena:royal-preferences") ?? "{}"
      ) as { sound?: boolean; reducedMotion?: boolean; camera?: ChessCameraMode };
      soundPreferred = Boolean(preferences.sound);
      setSound(soundPreferred);
      setReducedMotion(Boolean(preferences.reducedMotion));
      if (preferences.camera) setCamera(preferences.camera);
    } catch {}
    const unlockAudio = () => {
      if (!soundPreferred) return;
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => {
    if (!playing || replayFrames.length < 2) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        const next = (current ?? 0) + 1;
        if (next >= replayFrames.length) {
          setPlaying(false);
          return replayFrames.length - 1;
        }
        return next;
      });
    }, reducedMotion ? 850 : 620);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, replayFrames.length]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === " ") {
        event.preventDefault();
        if (replayFrames.length > 1) {
          setReplayIndex((value) =>
            value === undefined || value >= replayFrames.length - 1 ? 0 : value
          );
          setPlaying((value) => !value);
        }
      }
      if (event.key === "ArrowLeft") {
        setPlaying(false);
        setReplayIndex((value) => Math.max(0, (value ?? replayFrames.length - 1) - 1));
      }
      if (event.key === "ArrowRight") {
        setPlaying(false);
        setReplayIndex((value) => Math.min(replayFrames.length - 1, (value ?? 0) + 1));
      }
      if (event.key.toLowerCase() === "r") setCamera("broadcast");
      if (event.key.toLowerCase() === "t") setCamera("top");
      if (event.key.toLowerCase() === "m") setSound((value) => !value);
      if (event.key === "Escape") {
        setInspector(false);
        setSelectedSquare(undefined);
        setPendingPromotion(undefined);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [replayFrames.length]);

  useEffect(() => {
    if (!sound || !state?.lastMove || state.lastMove.ply === lastSoundPly.current) return;
    lastSoundPly.current = state.lastMove.ply;
    playTone(audioRef, state.lastMove.captured ? 140 : state.inCheck ? 260 : 190);
  }, [sound, state?.inCheck, state?.lastMove]);

  if (!isRoyalChessState(state)) {
    return <div className="system-message"><h2>Waiting for the royal board state…</h2></div>;
  }

  const participants = participantDetails(run);
  const isTerminal = run.status === "completed" || run.status === "failed";
  const activeParticipantId = state.participants[state.turn];
  const activeParticipant = run.config.participants?.find(
    (participant) => participant.id === activeParticipantId
  );
  const isHumanTurn =
    !isTerminal &&
    replayIndex === undefined &&
    activeParticipant?.kind === "human";
  const hasHumanParticipant = run.config.participants?.some(
    (participant) => participant.kind === "human"
  );
  const legalMoves = selectedSquare
    ? new Chess(state.fen).moves({ square: selectedSquare as Square, verbose: true })
    : [];
  const legalTargets = [...new Set(legalMoves.map((move) => move.to))];
  const completeHistory = isRoyalChessState(latestState) ? latestState.history : state.history;
  const frameValue = Math.min(
    replayIndex ?? Math.max(0, replayFrames.length - 1),
    Math.max(0, replayFrames.length - 1)
  );

  async function selectSquare(square: string) {
    if (!isHumanTurn || submittingMove) return;
    setMoveError(undefined);
    const piece = state.board.find((item) => item.square === square);
    if (!selectedSquare) {
      if (piece?.side === state.turn) setSelectedSquare(square);
      return;
    }
    const candidates = legalMoves.filter((move) => move.to === square);
    if (!candidates.length) {
      setSelectedSquare(piece?.side === state.turn ? square : undefined);
      return;
    }
    await chooseMove(selectedSquare, square, candidates);
  }

  async function dropMove(from: string, to: string) {
    if (!isHumanTurn || submittingMove) return;
    setMoveError(undefined);
    const piece = state.board.find((item) => item.square === from);
    if (piece?.side !== state.turn) {
      setMoveError("Choose a piece from your own crown.");
      return;
    }
    setSelectedSquare(from);
    const candidates = new Chess(state.fen)
      .moves({ square: from as Square, verbose: true })
      .filter((move) => move.to === to);
    if (!candidates.length) {
      setMoveError(`${from.toUpperCase()} → ${to.toUpperCase()} is not legal in this position.`);
      return;
    }
    await chooseMove(from, to, candidates);
  }

  async function chooseMove(from: string, to: string, candidates: Move[]) {
    const promotionMoves = candidates.filter((move) => move.promotion);
    if (promotionMoves.length > 1) {
      setPendingPromotion({ from, to, moves: promotionMoves });
      return;
    }
    await submitMove(candidates[0]!);
  }

  async function submitMove(selectedMove: Move) {
    setSubmittingMove(true);
    setPendingPromotion(undefined);
    try {
      await arenaApi.submitAction(run.id, activeParticipantId, {
        id: crypto.randomUUID(),
        type: "chess.move",
        arguments: {
          from: selectedMove.from,
          to: selectedMove.to,
          promotion: selectedMove.promotion
        },
        summary: `Human played ${selectedMove.san}`
      });
      setSelectedSquare(undefined);
    } catch (reason) {
      setMoveError(reason instanceof Error ? reason.message : String(reason));
      setSubmittingMove(false);
    }
  }

  return (
    <div className="royal-run">
      <header className="royal-matchbar">
        <div>
          <Link href="/environments/royal-chess-v1">← ROYAL CHESS</Link>
          <i />
          <span>RUN {shortId(run.id)}</span>
        </div>
        <div className="royal-match-title">
          <span>CROWN PROTOCOL</span>
          <b>MOVE {state.fullMoveNumber} · {state.turn.toUpperCase()} TO ACT</b>
        </div>
        <div>
          <span className={`connection-state ${connection}`}><i />{connection}</span>
          <StatusChip status={run.status} />
          <button onClick={() => recover()}>SYNC</button>
        </div>
      </header>

      {error && <div className="stream-warning">LIVE LINK / {error}</div>}

      <section className="royal-competitors">
        <CompetitorCard
          side="white"
          participant={participants.white}
          active={!isTerminal && state.turn === "white"}
          events={events}
          state={state}
        />
        <div className="royal-versus">
          <span>{state.inCheck ? (state.isCheckmate ? "CHECKMATE" : "CHECK") : "VERSUS"}</span>
          <b>{state.lastMove?.san ?? "OPENING POSITION"}</b>
        </div>
        <CompetitorCard
          side="black"
          participant={participants.black}
          active={!isTerminal && state.turn === "black"}
          events={events}
          state={state}
        />
      </section>

      <section className="royal-arena-grid">
        <aside className="royal-move-panel">
          <header><span>MATCH SCORE</span><b>{state.ply} PLIES</b></header>
          <CapturedPieces state={state} />
          <div className="notation-list">
            {pairMoves(completeHistory).map((pair) => (
              <button
                key={pair.number}
                className={
                  replayIndex === (pair.black?.ply ?? pair.white?.ply ?? -1) ? "active" : ""
                }
                onClick={() => {
                  const targetPly = pair.black?.ply ?? pair.white?.ply ?? 1;
                  setPlaying(false);
                  setReplayIndex(Math.max(0, targetPly));
                }}
              >
                <span>{pair.number}.</span>
                <b>{pair.white?.san ?? "—"}</b>
                <b>{pair.black?.san ?? "—"}</b>
              </button>
            ))}
            {!completeHistory.length && <p>Awaiting the opening move.</p>}
          </div>
        </aside>

        <article className="royal-board-stage" id="royal-board-stage">
          <div className="royal-stage-toolbar">
            <div>
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
            <div>
              <button
                className={sound ? "active" : ""}
                onClick={() => {
                  setSound((value) => !value);
                  if (!audioRef.current) audioRef.current = new AudioContext();
                }}
                aria-label={sound ? "Mute sounds" : "Enable sounds"}
              >
                {sound ? "SOUND ON" : "SOUND OFF"}
              </button>
              <button onClick={() => setInspector((value) => !value)}>INSPECT</button>
              <button
                onClick={() =>
                  document.getElementById("royal-board-stage")?.requestFullscreen?.()
                }
              >
                FULLSCREEN
              </button>
            </div>
          </div>
          <div className="royal-live-scene">
            <RoyalChessScene
              state={state}
              cameraMode={camera}
              reducedMotion={reducedMotion}
              interactive={isHumanTurn}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              onSquareSelect={(square) => void selectSquare(square)}
              onMoveDrop={(from, to) => void dropMove(from, to)}
            />
            {isHumanTurn && (
              <div className="human-turn-prompt">
                <b>{submittingMove ? "SUBMITTING MOVE…" : "YOUR TURN"}</b>
                <span>
                  {selectedSquare
                    ? "Drop or click a highlighted destination"
                    : "Drag a piece, or click it and choose a destination"}
                </span>
              </div>
            )}
            {!isTerminal && hasHumanParticipant && !isHumanTurn && replayIndex === undefined && (
              <div className="agent-turn-prompt">
                <i /> <span>{activeParticipant?.displayName ?? "Opponent"} is thinking…</span>
              </div>
            )}
            {pendingPromotion && (
              <div className="promotion-picker" role="dialog" aria-label="Choose promotion piece">
                <span>PROMOTE PAWN TO</span>
                <div>
                  {pendingPromotion.moves.map((move) => (
                    <button key={move.promotion} onClick={() => void submitMove(move)}>
                      {move.promotion === "q"
                        ? "♛ QUEEN"
                        : move.promotion === "r"
                          ? "♜ ROOK"
                          : move.promotion === "b"
                            ? "♝ BISHOP"
                            : "♞ KNIGHT"}
                    </button>
                  ))}
                </div>
                <button className="cancel" onClick={() => setPendingPromotion(undefined)}>CANCEL</button>
              </div>
            )}
            {moveError && <div className="human-move-error">{moveError}</div>}
            {state.inCheck && (
              <div className={`royal-alert ${state.isCheckmate ? "mate" : ""}`}>
                <span>{state.isCheckmate ? "CHECKMATE" : "CHECK"}</span>
              </div>
            )}
          </div>
          <div className="royal-replaybar">
            <button
              aria-label="Previous replay position"
              onClick={() => {
                setPlaying(false);
                setReplayIndex((value) => Math.max(0, (value ?? replayFrames.length - 1) - 1));
              }}
              disabled={replayFrames.length < 2}
            >◀</button>
            <button
              aria-label={playing ? "Pause replay" : "Play replay"}
              onClick={() => {
                if (!playing) {
                  setReplayIndex((value) =>
                    value === undefined || value >= replayFrames.length - 1 ? 0 : value
                  );
                }
                setPlaying((value) => !value);
              }}
              disabled={replayFrames.length < 2}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <input
              type="range"
              aria-label="Chess replay frame"
              min="0"
              max={Math.max(0, replayFrames.length - 1)}
              value={frameValue}
              disabled={replayFrames.length < 2}
              onChange={(event) => {
                setReplayIndex(Number(event.target.value));
                setPlaying(false);
              }}
            />
            <span>{frameValue === 0 ? "OPENING" : `PLY ${frameValue}`} / {Math.max(0, replayFrames.length - 1)}</span>
            <button
              className={replayIndex === undefined ? "active" : ""}
              onClick={() => {
                setPlaying(false);
                setReplayIndex(undefined);
              }}
            >LIVE</button>
            <button
              aria-label="Next replay position"
              onClick={() => {
                setPlaying(false);
                setReplayIndex((value) => Math.min(replayFrames.length - 1, (value ?? 0) + 1));
              }}
              disabled={replayFrames.length < 2}
            >▶</button>
          </div>
        </article>

        <aside className="royal-observer-panel">
          <header><span>ARENAOS OBSERVER</span><b>{events.length} EVENTS</b></header>
          <ObserverState
            run={run}
            events={events}
            state={state}
            replayFrameCount={Math.max(0, replayFrames.length - 1)}
          />
        </aside>
      </section>

      <section className="royal-shortcuts">
        <span>SPACE <b>PLAY/PAUSE</b></span>
        <span>← → <b>STEP REPLAY</b></span>
        <span>R <b>RESET CAMERA</b></span>
        <span>T <b>TOP VIEW</b></span>
        <span>M <b>MUTE</b></span>
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)}
          />
          REDUCED MOTION
        </label>
      </section>

      {inspector && (
        <section className="royal-inspector">
          <header>
            <span>ADVANCED EVENT INSPECTOR</span>
            <button onClick={() => setInspector(false)}>CLOSE ×</button>
          </header>
          <div>
            <article>
              <span>AUTHORITATIVE STATE</span>
              <pre>{JSON.stringify(state, null, 2)}</pre>
            </article>
            <article>
              <span>LATEST NORMALIZED EVENTS</span>
              <pre>{JSON.stringify(events.slice(-8), null, 2)}</pre>
            </article>
          </div>
        </section>
      )}

      {isTerminal && state.result && (
        <ResultsBoard
          run={run}
          state={state}
          participants={participants}
          onWatchReplay={() => {
            setReplayIndex(0);
            setPlaying(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}

function CompetitorCard({
  side,
  participant,
  active,
  events,
  state
}: {
  side: ChessSide;
  participant: ParticipantDetail;
  active: boolean;
  events: ArenaEvent[];
  state: RoyalChessState;
}) {
  const actions = events.filter(
    (event) =>
      event.type === "agent.action_generated" &&
      (event.payload as { participant?: { id?: string } }).participant?.id === side
  );
  const latest = actions.at(-1);
  return (
    <article className={`competitor-card ${side} ${active ? "active" : ""}`}>
      <div className="competitor-crest">{side === "white" ? "♔" : "♚"}</div>
      <div>
        <span>{side === "white" ? "IVORY CROWN" : "OBSIDIAN CROWN"}</span>
        <h2>{participant.name}</h2>
        <p>{participant.agentId} / {participant.provider}</p>
      </div>
      <dl>
        <div><dt>STATUS</dt><dd>{active ? (participant.kind === "human" ? "YOUR TURN" : "THINKING") : state.status === "completed" ? "FINISHED" : "WAITING"}</dd></div>
        <div><dt>MOVES</dt><dd>{actions.length}</dd></div>
        <div><dt>LEGAL</dt><dd>{state.invalidActions[side] === 0 ? "100%" : "REVIEW"}</dd></div>
        <div><dt>LAST</dt><dd>{((latest?.payload as { action?: { summary?: string } })?.action?.summary ?? "—").slice(0, 28)}</dd></div>
      </dl>
    </article>
  );
}

function CapturedPieces({ state }: { state: RoyalChessState }) {
  const symbols: Record<ChessPieceSymbol, string> = {
    p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚"
  };
  return (
    <div className="captured-pieces">
      <div><span>IVORY LOST</span><p>{state.capturedPieces.white.map((piece, index) => <b key={index}>{symbols[piece]}</b>)}</p></div>
      <div><span>OBSIDIAN LOST</span><p>{state.capturedPieces.black.map((piece, index) => <b key={index}>{symbols[piece]}</b>)}</p></div>
    </div>
  );
}

function ObserverState({
  run,
  events,
  state,
  replayFrameCount
}: {
  run: RunRecord;
  events: ArenaEvent[];
  state: RoyalChessState;
  replayFrameCount: number;
}) {
  const action = [...events].reverse().find((event) => event.type === "agent.action_generated");
  const actionPayload = action?.payload as
    | { action?: { summary?: string; metadata?: Record<string, unknown> }; participant?: { id?: string } }
    | undefined;
  return (
    <>
      <div className="observer-block active">
        <span>TURN ROUTING</span>
        <strong>{state.turn.toUpperCase()} / {state.participants[state.turn]}</strong>
        <small>Observation routed by activeParticipantId</small>
      </div>
      <div className="observer-block">
        <span>LAST DECISION</span>
        <strong>{actionPayload?.participant?.id?.toUpperCase() ?? "AWAITING"}</strong>
        <p>{actionPayload?.action?.summary ?? "The arena is waiting for a structured move."}</p>
      </div>
      <div className="observer-block">
        <span>POSITION</span>
        <code>{state.fen}</code>
      </div>
      <div className="observer-block">
        <span>VALIDATION</span>
        <div className="observer-metrics">
          <div><b>{state.invalidActions.white + state.invalidActions.black}</b><small>REJECTIONS</small></div>
          <div><b>{state.history.length}</b><small>ACCEPTED</small></div>
          <div><b>{replayFrameCount}</b><small>FRAMES</small></div>
          <div><b>{formatDuration(durationMs(run))}</b><small>ELAPSED</small></div>
        </div>
      </div>
      <div className="observer-block">
        <span>LAST MOVE CONTRACT</span>
        <pre>{JSON.stringify(state.lastMove ?? { status: "opening" }, null, 2)}</pre>
      </div>
    </>
  );
}

function ResultsBoard({
  run,
  state,
  participants,
  onWatchReplay
}: {
  run: RunRecord;
  state: RoyalChessState;
  participants: Record<ChessSide, ParticipantDetail>;
  onWatchReplay: () => void;
}) {
  const winner = state.result?.winner;
  const title = winner ? `${participants[winner].name} wins` : "The crowns draw";
  const captures = state.history.filter((move) => move.captured).length;
  const checks = state.history.filter((move) => move.inCheck).length;
  return (
    <section className="royal-results">
      <div className="result-crown">{winner === "black" ? "♚" : "♔"}</div>
      <span>{state.result?.type.toUpperCase()}</span>
      <h2>{title}</h2>
      <p>{state.result?.reason}</p>
      <div className="result-metrics">
        <article><strong>{state.ply}</strong><span>TOTAL PLIES</span></article>
        <article><strong>{captures}</strong><span>CAPTURES</span></article>
        <article><strong>{checks}</strong><span>CHECKS</span></article>
        <article><strong>{formatDuration(durationMs(run))}</strong><span>DURATION</span></article>
        <article><strong>{state.invalidActions.white + state.invalidActions.black}</strong><span>INVALID</span></article>
      </div>
      <div className="result-actions">
        <button onClick={onWatchReplay}>WATCH REPLAY</button>
        <Link href="/environments/royal-chess-v1">NEW MATCH</Link>
        <button onClick={() => navigator.clipboard.writeText(window.location.href)}>COPY RUN URL</button>
        <button onClick={() => downloadRun(run)}>EXPORT REPLAY JSON</button>
      </div>
    </section>
  );
}

type ParticipantDetail = {
  name: string;
  agentId: string;
  provider: string;
  kind: "agent" | "human";
};

function participantDetails(run: RunRecord): Record<ChessSide, ParticipantDetail> {
  const find = (id: ChessSide): ParticipantDetail => {
    const participant = run.config.participants?.find((item) => item.id === id);
    return {
      name: participant?.displayName ?? participant?.agentId ?? id,
      agentId: participant?.agentId ?? "browser-input",
      provider: String(participant?.metadata?.provider ?? (participant?.kind === "human" ? "Local player" : "ArenaOS")),
      kind: participant?.kind ?? "agent"
    };
  };
  return { white: find("white"), black: find("black") };
}

function pairMoves(history: RoyalChessMoveRecord[]) {
  const pairs: Array<{ number: number; white?: RoyalChessMoveRecord; black?: RoyalChessMoveRecord }> = [];
  for (const move of history) {
    const index = Math.floor((move.ply - 1) / 2);
    pairs[index] ??= { number: index + 1 };
    pairs[index]![move.side] = move;
  }
  return pairs;
}

function playTone(ref: React.MutableRefObject<AudioContext | null>, frequency: number) {
  const context = ref.current;
  if (!context || context.state !== "running") {
    void context?.resume();
    return;
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.13, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.22);
}

function downloadRun(run: RunRecord) {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `arenaos-royal-chess-${run.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
