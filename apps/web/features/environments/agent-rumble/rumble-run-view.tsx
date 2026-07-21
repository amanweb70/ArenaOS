"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArenaEvent, ExperimentConfig, RunRecord } from "@arena/contracts";
import type { StreamState } from "@/hooks/use-run-stream";
import { arenaApi } from "@/lib/arena-api";
import { shortId } from "@/lib/format";
import type { RumbleFighter, RumbleState } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { isRumbleState, RumbleArena } from "./rumble-arena";
import { useRumbleAudio } from "./use-rumble-audio";

export function RumbleRunView({
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoplayRequested = searchParams.get("broadcast") === "1";
  const autoplayStarted = useRef(false);
  const rematchStarted = useRef(false);
  const [replayIndex, setReplayIndex] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [rerunning, setRerunning] = useState(false);
  const latestStep = [...events]
    .reverse()
    .find((event) => event.type === "environment.step_completed");
  const reset = [...events].reverse().find((event) => event.type === "environment.reset");
  const resetState = (reset?.payload as { state?: unknown } | undefined)?.state;
  const frames = useMemo(
    () => buildRumbleReplayFrames([
      resetState,
      ...run.replay.map((frame) => frame.state),
      ...events.filter((event) => event.type === "environment.step_completed").map((event) => (event.payload as { state?: unknown }).state)
    ]),
    [events, resetState, run.replay]
  );
  const latest =
    (latestStep?.payload as { state?: unknown } | undefined)?.state ??
    run.finalState ??
    resetState;
  const replayState = replayIndex === undefined ? undefined : frames[replayIndex];
  const state = isRumbleState(replayState) ? replayState : isRumbleState(latest) ? latest : undefined;
  const audio = useRumbleAudio(state);

  useEffect(() => {
    if (!playing || !frames.length) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        const next = (current ?? 0) + 1;
        if (next >= frames.length) {
          setPlaying(false);
          return frames.length - 1;
        }
        return next;
      });
    }, 520);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  useEffect(() => {
    if (
      !autoplayRequested ||
      autoplayStarted.current ||
      frames.length < 2 ||
      (run.status !== "completed" && run.status !== "failed")
    ) return;
    autoplayStarted.current = true;
    setReplayIndex(0);
    setPlaying(true);
  }, [autoplayRequested, frames.length, run.status]);

  const human = run.config.participants?.find(
    (participant) => participant.kind === "human" && participant.id === state?.activeParticipantId
  );
  const humanFighter = state?.fighters.find((fighter) => fighter.id === human?.id);
  const nearest = useMemo(
    () => (state && humanFighter ? nearestOpponent(state, humanFighter) : undefined),
    [state, humanFighter]
  );

  async function act(
    type: string,
    args: Record<string, unknown>,
    summary: string
  ) {
    if (!state || !human || submitting || replayIndex !== undefined) return;
    setSubmitting(true);
    setActionError(undefined);
    try {
      await arenaApi.submitAction(run.id, human.id, {
        id: crypto.randomUUID(),
        type,
        arguments: args,
        summary
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (!human || !nearest || event.repeat) return;
      const key = event.key.toLowerCase();
      const actions: Record<string, () => void> = {
        w: () => act("combat.move_to", { target: { type: "opponent", fighterId: nearest.id }, desiredDistance: 1.4 }, "Human advances"),
        s: () => act("combat.move_to", { target: { type: "position", x: 0, z: 0 }, desiredDistance: 0 }, "Human returns to center"),
        a: () => act("combat.defend", { defense: "dodge_left" }, "Human dodges left"),
        d: () => act("combat.defend", { defense: "dodge_right" }, "Human dodges right"),
        j: () => act("combat.attack", { attack: "jab", targetFighterId: nearest.id }, "Human throws a jab"),
        k: () => act("combat.attack", { attack: "heavy", targetFighterId: nearest.id }, "Human throws a heavy strike"),
        l: () => act("combat.use_ability", { abilityId: "focus_burst", targetFighterId: nearest.id }, "Human activates focus burst")
      };
      if (actions[key]) {
        event.preventDefault();
        actions[key]!();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  if (!state) {
    return <div className="system-message"><h2>Opening Crownfall Coliseum…</h2></div>;
  }

  const winner = state.winner?.fighterId
    ? state.fighters.find((fighter) => fighter.id === state.winner?.fighterId)?.displayName
    : state.winner?.teamId?.toUpperCase();
  const frame = Math.min(
    replayIndex ?? Math.max(0, frames.length - 1),
    Math.max(0, frames.length - 1)
  );
  const isTerminal = state.status === "completed" || run.status === "completed" || run.status === "failed";
  const displayStatus = state.status === "completed" ? "completed" : run.status;
  const ranking = [...state.fighters].sort((left, right) => (left.placement ?? 99) - (right.placement ?? 99) || right.stats.damageDealt - left.stats.damageDealt);
  const currentState = state;

  async function rerun() {
    if (!isTerminal) {
      await recover();
      return;
    }
    if (rematchStarted.current) return;
    rematchStarted.current = true;
    setRerunning(true);
    setActionError(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await arenaApi.startRun(
        buildRumbleRematchConfig(run.config, currentState.seed),
        controller.signal
      );
      router.push(`/runs/${response.runId}?broadcast=1`);
    } catch (reason) {
      setActionError(
        reason instanceof DOMException && reason.name === "AbortError"
          ? "The rematch request timed out. The current result remains available; try again."
          : reason instanceof Error ? reason.message : String(reason)
      );
      rematchStarted.current = false;
      setRerunning(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <div className="rumble-run">
      <header className="rumble-matchbar">
        <div><Link href="/environments/agent-rumble-v1">← AGENT RUMBLE</Link><span>RUN {shortId(run.id)}</span></div>
        <div><b>ROUND {String(state.round).padStart(2, "0")}</b><span>{state.mode.replaceAll("_", " ")}</span></div>
        <div>
          <span className={`connection-state ${connection}`}><i />{connection}</span>
          <StatusChip status={displayStatus} />
          <button className={audio.enabled ? "rumble-audio-active" : ""} onClick={() => void audio.toggle()} aria-label={audio.enabled ? "Mute Agent Rumble audio" : "Enable Agent Rumble audio"}>{audio.enabled ? "♫ AUDIO ON" : "♫ AUDIO OFF"}</button>
          <button onClick={() => void rerun()} disabled={rerunning}>{rerunning ? "OPENING…" : isTerminal ? "↻ REMATCH" : "SYNC"}</button>
        </div>
      </header>
      {error && <div className="stream-warning">LIVE LINK / {error}</div>}

      <section className="rumble-fighter-strip">
        {state.fighters.map((fighter) => <FighterHud fighter={fighter} active={fighter.id === state.activeParticipantId} key={fighter.id} />)}
      </section>

      <section className="rumble-live-grid">
        <aside className="rumble-feed">
          <header><span>COMBAT FEED</span><b>{state.eventHistory.length} EVENTS</b></header>
          <div>
            {[...state.eventHistory].reverse().slice(0, 18).map((event) => (
              <article className={event.type} key={event.id}>
                <i>{String(event.round).padStart(2, "0")}</i>
                <p>{event.description}</p>
              </article>
            ))}
            {!state.eventHistory.length && <p className="rumble-awaiting">Fighters await the bell.</p>}
          </div>
        </aside>

        <article className="rumble-live-stage">
          <div className="rumble-stage-sign">
            <span>CROWNFALL ROYAL BROADCAST</span>
            <b>{state.status === "completed" ? "FINAL" : "LIVE"}</b>
          </div>
          <RumbleArena state={state} />
          {winner && (
            <div className="rumble-winner">
              <span>{state.winner?.reason.replaceAll("_", " ")}</span>
              <strong>{winner}</strong>
              <b>WINS THE RUMBLE</b>
              <div className="rumble-result-table">
                {ranking.map((fighter, index) => <span key={fighter.id}><i>#{fighter.placement ?? index + 1}</i><strong>{fighter.displayName}</strong><b>{Math.round(fighter.stats.damageDealt)} DMG · {fighter.stats.hitsLanded} HITS</b></span>)}
              </div>
              <button onClick={() => void rerun()} disabled={rerunning} aria-busy={rerunning}>{rerunning ? "OPENING NEW BATTLE…" : "RUN REMATCH"}</button>
            </div>
          )}
        </article>

        <aside className="rumble-control-panel">
          <header><span>DECISION PANEL</span><b>{human ? "HUMAN INPUT" : "AGENT TRACE"}</b></header>
          {human && nearest ? (
            <>
              <p>Your actions enter the same ArenaOS pipeline as agent actions.</p>
              <div className="rumble-controls">
                <button onClick={() => act("combat.move_to", { target: { type: "opponent", fighterId: nearest.id }, desiredDistance: 1.4 }, "Human advances")} disabled={submitting}><kbd>W</kbd> ADVANCE</button>
                <button onClick={() => act("combat.defend", { defense: "dodge_left" }, "Human dodges left")} disabled={submitting}><kbd>A</kbd> DODGE L</button>
                <button onClick={() => act("combat.move_to", { target: { type: "position", x: 0, z: 0 }, desiredDistance: 0 }, "Human returns to center")} disabled={submitting}><kbd>S</kbd> CENTER</button>
                <button onClick={() => act("combat.defend", { defense: "dodge_right" }, "Human dodges right")} disabled={submitting}><kbd>D</kbd> DODGE R</button>
                <button onClick={() => act("combat.attack", { attack: "jab", targetFighterId: nearest.id }, "Human throws a jab")} disabled={submitting}><kbd>J</kbd> JAB</button>
                <button onClick={() => act("combat.attack", { attack: "heavy", targetFighterId: nearest.id }, "Human throws a heavy strike")} disabled={submitting}><kbd>K</kbd> HEAVY</button>
                <button onClick={() => act("combat.use_ability", { abilityId: "focus_burst", targetFighterId: nearest.id }, "Human activates focus burst")} disabled={submitting}><kbd>L</kbd> ABILITY</button>
              </div>
            </>
          ) : (
            <AgentDecision events={events} activeId={state.activeParticipantId} run={run} />
          )}
          <div className="rumble-audio-mixer">
            <header><span>ARENA AUDIO</span><b>{audio.enabled ? "PLAYING" : "MUTED"}</b></header>
            <label><span>MUSIC</span><input aria-label="Music volume" type="range" min="0" max="1" step="0.05" value={audio.musicVolume} onChange={(event) => audio.setMusicVolume(Number(event.target.value))} /></label>
            <label><span>COMBAT FX</span><input aria-label="Combat effects volume" type="range" min="0" max="1" step="0.05" value={audio.sfxVolume} onChange={(event) => audio.setSfxVolume(Number(event.target.value))} /></label>
            <small>CC0 BATTLE SCORE · PROCEDURAL IMPACT AUDIO</small>
          </div>
          {actionError && <p className="form-error">{actionError}</p>}
          <div className="rumble-evidence">
            <span>AUTHORITY</span><b>RUMBLECORE</b>
            <span>TIMING</span><b>{state.timingMode}</b>
            <span>SEED</span><b>{state.seed}</b>
            <span>REPLAY</span><b>{frames.length} FRAMES</b>
          </div>
        </aside>
      </section>

      <section className="rumble-replay-bar">
        <button aria-label="Opening frame" onClick={() => { setReplayIndex(0); setPlaying(false); }}>↤</button>
        <button aria-label="Previous frame" onClick={() => setReplayIndex((current) => Math.max(0, (current ?? frames.length - 1) - 1))}>‹</button>
        <button onClick={() => setPlaying((value) => !value)}>{playing ? "PAUSE" : "PLAY"}</button>
        <input
          aria-label="Replay frame"
          type="range"
          min="0"
          max={Math.max(0, frames.length - 1)}
          value={frame}
          onChange={(event) => { setReplayIndex(Number(event.target.value)); setPlaying(false); }}
        />
        <span>FRAME {frames.length ? frame + 1 : 0} / {frames.length}</span>
        <button aria-label="Next frame" onClick={() => setReplayIndex((current) => Math.min(frames.length - 1, (current ?? -1) + 1))}>›</button>
        <button onClick={() => setReplayIndex(undefined)}>LIVE</button>
      </section>
    </div>
  );
}

function FighterHud({ fighter, active }: { fighter: RumbleFighter; active: boolean }) {
  return (
    <article className={`${fighter.id} ${active ? "active" : ""} ${fighter.state === "eliminated" ? "out" : ""}`} style={{ "--fighter": fighter.color } as React.CSSProperties}>
      <header><span>{fighter.displayName}</span><b>{fighter.state}</b></header>
      <div><i style={{ width: `${(fighter.health / fighter.maxHealth) * 100}%` }} /></div>
      <footer><b>{Math.ceil(fighter.health)} HP</b><span>{Math.ceil(fighter.stamina)} STM</span><span>{Math.ceil(fighter.abilityCharge)} ULT</span></footer>
    </article>
  );
}

function AgentDecision({ events, activeId, run }: { events: ArenaEvent[]; activeId: string; run: RunRecord }) {
  const event = [...events].reverse().find(
    (item) =>
      item.type === "agent.action_generated" &&
      (item.payload as { participant?: { id?: string } }).participant?.id === activeId
  );
  const action = (event?.payload as { action?: { type?: string; summary?: string; arguments?: unknown } } | undefined)?.action;
  const participant = run.config.participants?.find((item) => item.id === activeId);
  return (
    <div className="rumble-agent-decision">
      <span>ACTIVE COMPETITOR</span><strong>{participant?.displayName ?? activeId.toUpperCase()}</strong>
      <span>CONTROLLER</span><b>{participant?.agentId ?? "ArenaOS"}</b>
      <span>LAST STRUCTURED ACTION</span><b>{action?.type ?? "AWAITING DECISION"}</b>
      <p>{action?.summary ?? "The active policy is observing the current combat state."}</p>
      {action?.arguments !== undefined && (
        <pre>{JSON.stringify(action.arguments, null, 2)}</pre>
      )}
    </div>
  );
}

export function buildRumbleReplayFrames(candidates: unknown[]): RumbleState[] {
  const frames: RumbleState[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!isRumbleState(candidate)) continue;
    const key = [candidate.round, candidate.activeParticipantId, candidate.status, candidate.eventHistory.length, candidate.fighters.map((fighter) => `${fighter.id}:${fighter.position.x}:${fighter.position.z}:${fighter.health}:${fighter.state}`).join("|")].join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push(candidate);
  }
  return frames;
}

export function buildRumbleRematchConfig(
  config: ExperimentConfig,
  currentSeed: number
): Partial<ExperimentConfig> {
  const { id: _experimentId, ...reusable } = config;
  const baseName = config.name.replace(/(?:\s*\/\s*rematch)+$/i, "");
  const seed = ((Number.isFinite(currentSeed) ? Math.trunc(currentSeed) : 0) + 1) % 2_147_483_647;
  return {
    ...reusable,
    name: `${baseName} / rematch`,
    seed: seed || 1
  };
}

function nearestOpponent(state: RumbleState, self: RumbleFighter) {
  return state.fighters
    .filter(
      (fighter) =>
        fighter.id !== self.id &&
        fighter.state !== "eliminated" &&
        (!self.teamId || fighter.teamId !== self.teamId)
    )
    .sort(
      (left, right) =>
        Math.hypot(left.position.x - self.position.x, left.position.z - self.position.z) -
        Math.hypot(right.position.x - self.position.x, right.position.z - self.position.z)
    )[0];
}
