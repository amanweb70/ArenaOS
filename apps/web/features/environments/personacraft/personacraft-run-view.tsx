"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArenaEvent, ExperimentConfig, RunRecord } from "@arena/contracts";
import type { StreamState } from "@/hooks/use-run-stream";
import { arenaApi } from "@/lib/arena-api";
import { shortId } from "@/lib/format";
import type { PersonaCraftState, PersonaDefinition } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { isPersonaCraftState, PersonaCouncilScene } from "./persona-council-scene";
import { usePersonaSpeech } from "./use-persona-speech";

const phases = ["speaking", "cross_examination", "negotiation", "voting"];

export function PersonaCraftRunView({
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
  const stageRef = useRef<HTMLElement>(null);
  const [replayIndex, setReplayIndex] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [message, setMessage] = useState("We should choose a measurable path that preserves public trust and can be revised as new evidence arrives.");
  const [target, setTarget] = useState("cyan");
  const [stance, setStance] = useState("support");
  const [rhetoric, setRhetoric] = useState("logical");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [run.id]);

  const streamedFrames = useMemo(
    () => events.flatMap((event) => {
      if (event.type !== "environment.step_completed") return [];
      const state = (event.payload as { state?: unknown }).state;
      return isPersonaCraftState(state) ? [{ step: event.step ?? 0, state }] : [];
    }),
    [events]
  );
  const resetEvent = [...events].reverse().find((event) => event.type === "environment.reset");
  const resetState = (resetEvent?.payload as { state?: unknown } | undefined)?.state;
  const frames = useMemo(
    () => buildPersonaReplayFrames(resetState, run.replay, streamedFrames),
    [resetState, run.replay, streamedFrames]
  );
  const latestEvent = [...events].reverse().find((event) => event.type === "environment.step_completed");
  const latest = (latestEvent?.payload as { state?: unknown } | undefined)?.state ??
    run.finalState ?? (resetEvent?.payload as { state?: unknown } | undefined)?.state;
  const replayState = replayIndex === undefined ? undefined : frames[replayIndex]?.state;
  const state = isPersonaCraftState(replayState) ? replayState : isPersonaCraftState(latest) ? latest : undefined;
  const speech = usePersonaSpeech(state);
  const terminalAtTail = run.status === "completed" || run.status === "failed" || state?.status === "completed";

  useEffect(() => {
    if (!playing || !frames.length) return;
    if (speech.enabled && speech.hasSpeech && !speech.turnComplete) return;
    const delay = replayIndex === 0 ? 1_200 : speech.enabled && speech.hasSpeech ? 520 : 1_450;
    const timer = window.setTimeout(() => {
      setReplayIndex((current) => {
        const next = (current ?? 0) + 1;
        if (next >= frames.length) {
          if (terminalAtTail) setPlaying(false);
          return frames.length - 1;
        }
        return next;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, frames.length, replayIndex, speech.enabled, speech.hasSpeech, speech.speechKey, speech.turnComplete, terminalAtTail]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (!autoplayRequested || autoplayStarted.current || frames.length < 2) return;
    autoplayStarted.current = true;
    setReplayIndex(0);
    setPlaying(true);
  }, [autoplayRequested, frames.length]);

  if (!state) return <div className="system-message"><h2>Opening the Grand AI Council…</h2></div>;

  const presentedSpeakerId = speech.speakerId ?? state.activeParticipantId;
  const presentationState = presentedSpeakerId === state.activeParticipantId
    ? state
    : { ...state, activeParticipantId: presentedSpeakerId };
  const human = run.config.participants?.find(
    (participant) => participant.kind === "human" && participant.id === state.activeParticipantId
  );
  const active = state.personas.find((persona) => persona.id === presentedSpeakerId);
  const nextDelegate = state.personas.find((persona) => persona.id === state.activeParticipantId);
  const winner = state.personas.find((persona) => persona.id === state.winner?.participantId);
  const frame = Math.min(replayIndex ?? Math.max(0, frames.length - 1), Math.max(0, frames.length - 1));
  const availableFacts = state.scenario.publicFacts.filter((fact) => fact.unlockedRound <= state.round);
  const terminal = run.status === "completed" || run.status === "failed" || state.status === "completed";

  async function rerun() {
    if (!terminal) {
      await recover();
      return;
    }
    if (rematchStarted.current) return;
    rematchStarted.current = true;
    setBusy(true);
    setActionError(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await arenaApi.startRun(
        buildPersonaRematchConfig(run.config, state?.seed ?? run.config.seed ?? 505),
        controller.signal
      );
      router.push(`/runs/${response.runId}?broadcast=1`, { scroll: true });
    } catch (reason) {
      setActionError(reason instanceof DOMException && reason.name === "AbortError" ? "The rematch request timed out. Try again without losing this result." : reason instanceof Error ? reason.message : String(reason));
      rematchStarted.current = false;
      setBusy(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function toggleFullscreen() {
    if (!stageRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stageRef.current.requestFullscreen();
  }

  async function act(type: string, args: Record<string, unknown>, summary: string) {
    if (!human || busy || replayIndex !== undefined) return;
    setBusy(true);
    setActionError(undefined);
    try {
      await arenaApi.submitAction(run.id, human.id, {
        id: crypto.randomUUID(), type, arguments: args, summary
      });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function submitCurrent() {
    if (!state) return;
    if (state.phase === "speaking") {
      void act("persona.speak", {
        message, stance, rhetoricalMode: rhetoric,
        targetParticipantId: target,
        evidenceIds: availableFacts[0] ? [availableFacts[0].id] : []
      }, "Human council statement");
    } else if (state.phase === "cross_examination") {
      void act("persona.challenge", { targetParticipantId: target, claim: message, message }, "Human challenge");
    } else if (state.phase === "negotiation") {
      void act("persona.negotiate", {
        targetParticipantId: target, proposal: message, offerResources: 4, requestResources: 2
      }, "Human negotiation");
    }
  }

  return (
    <div className="persona-run">
      <header className="persona-runbar">
        <div><Link href="/environments/personacraft-v1">← PERSONACRAFT</Link><span>SESSION {shortId(run.id)}</span></div>
        <div><b>ROUND {state.round}/{state.maxRounds}</b><span>{state.mode.replaceAll("_", " ")}</span></div>
        <div><span className={`connection-state ${replayIndex !== undefined ? "live" : connection}`}><i />{replayIndex !== undefined ? "broadcast" : connection}</span><StatusChip status={replayIndex !== undefined ? "running" : run.status} /><button className={speech.enabled ? "persona-voice-active" : ""} onClick={speech.toggle} disabled={!speech.supported} aria-label={speech.enabled ? "Mute council voices" : "Enable council voices"}>{speech.speaking ? "◉ SPEAKING" : speech.enabled ? "VOICE ON" : "VOICE OFF"}</button><button onClick={() => void toggleFullscreen()}>{fullscreen ? "EXIT FULLSCREEN" : "EXPAND STAGE"}</button><button onClick={() => void rerun()} disabled={busy}>{busy ? "OPENING…" : terminal ? "↻ REMATCH" : "SYNC"}</button></div>
      </header>
      {error && <div className="stream-warning">COUNCIL LINK / {error}</div>}

      <section className="persona-phasebar">
        {phases.map((phase, index) => (
          <div className={state.phase === phase ? "active" : state.phaseIndex > index ? "done" : ""} key={phase}>
            <i>{String(index + 1).padStart(2, "0")}</i><span>{phase.replaceAll("_", " ")}</span>
          </div>
        ))}
      </section>

      <section className="persona-live-grid">
        <aside className="persona-roster-panel">
          <header><span>COUNCIL SEATS</span><b>{state.personas.length} DELEGATES</b></header>
          {state.personas.map((persona) => <PersonaHud persona={persona} active={persona.id === presentedSpeakerId} key={persona.id} />)}
        </aside>

        <article className="persona-stage" ref={stageRef}>
          <div className="persona-broadcast"><span>ARENAOS COUNCIL NETWORK</span><b>{state.status === "completed" ? "FINAL" : speech.speaking ? "ON AIR" : state.activeParticipantId !== presentedSpeakerId ? `NEXT · ${nextDelegate?.displayName ?? "DELEGATE"}` : "LIVE"}</b></div>
          <PersonaCouncilScene state={presentationState} />
          <div className="persona-topic"><small>{state.scenario.title}</small><strong>{state.scenario.topic}</strong></div>
          {winner && (
            <div className="persona-winner">
              <span>COUNCIL NETWORK / FINAL DECISION</span><strong>{winner.displayName}</strong><b>{state.winner?.reason.replaceAll("_", " ")}</b>
              <div>{state.finalRanking?.map((rank, index) => <p key={rank.participantId}><i>#{index + 1}</i><span>{state.personas.find((persona) => persona.id === rank.participantId)?.displayName}</span><b>{rank.score.toFixed(0)} PTS</b></p>)}</div>
              <button onClick={() => void rerun()} disabled={busy} aria-busy={busy}>{busy ? "CONVENING NEW DEBATE…" : "RUN REMATCH"}</button>
            </div>
          )}
        </article>

        <aside className="persona-inspector">
          <header><span>{human ? "YOUR COUNCIL ACTION" : "LIVE ARGUMENT"}</span><b>{active?.displayName}</b></header>
          {human ? (
            state.phase === "voting" ? (
              <div className="persona-vote-controls">
                <p>Cast your vote. This enters the persisted ArenaOS action stream.</p>
                {state.scenario.decisionChoices.map((choice) => (
                  <button disabled={busy} key={choice.id} onClick={() => act("persona.vote", { choiceId: choice.id, rationale: message }, `Vote for ${choice.label}`)}>
                    <b>{choice.label}</b><small>{choice.description}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="persona-human-controls">
                <label>STATEMENT<textarea aria-label="Council statement" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
                <div>
                  <label>TARGET<select aria-label="Target delegate" value={target} onChange={(event) => setTarget(event.target.value)}>
                    {state.personas.filter((persona) => persona.id !== human.id).map((persona) => <option value={persona.id} key={persona.id}>{persona.displayName}</option>)}
                  </select></label>
                  <label>STANCE<select aria-label="Statement stance" value={stance} onChange={(event) => setStance(event.target.value)}><option>support</option><option>oppose</option><option>neutral</option></select></label>
                </div>
                <label>RHETORIC<select aria-label="Rhetorical mode" value={rhetoric} onChange={(event) => setRhetoric(event.target.value)}>
                  <option>logical</option><option>pragmatic</option><option>visionary</option><option>conciliatory</option><option>confrontational</option><option>emotional</option>
                </select></label>
                <button className="persona-submit-action" disabled={busy || message.trim().length < 12} onClick={submitCurrent}>{busy ? "TRANSMITTING…" : `SUBMIT ${state.phase.replaceAll("_", " ").toUpperCase()}`}</button>
              </div>
            )
          ) : (
            <div className="persona-current-argument">
              <span>{state.audience.dominantReaction.replaceAll("_", " ")}</span>
              <blockquote>“{state.transcript.at(-1)?.message ?? "The council has not yet taken the floor."}”</blockquote>
              <dl><div><dt>LOGIC</dt><dd>{state.transcript.at(-1)?.scores.logic.toFixed(0) ?? "—"}</dd></div><div><dt>PERSUASION</dt><dd>{state.transcript.at(-1)?.scores.persuasion.toFixed(0) ?? "—"}</dd></div></dl>
            </div>
          )}
          {actionError && <p className="form-error">{actionError}</p>}
          <div className="persona-world">
            <span>WORLD STATE</span>
            <Metric label="TENSION" value={state.world.tension} />
            <Metric label="CONSENSUS" value={state.world.consensus} />
            <Metric label="INFORMATION" value={state.world.informationLevel} />
            <p>{state.world.update}</p>
          </div>
        </aside>
      </section>

      <section className="persona-lower-grid">
        <div className="persona-transcript">
          <header><span>COUNCIL RECORD</span><b>{state.transcript.length} STATEMENTS</b></header>
          {[...state.transcript].reverse().slice(0, 10).map((statement) => {
            const speaker = state.personas.find((persona) => persona.id === statement.speakerId);
            return <article key={statement.id}><i style={{ background: speaker?.color }} /><div><span>R{statement.round} · {statement.actionType.replace("persona.", "")}</span><b>{speaker?.displayName}</b><p>{statement.message}</p></div><strong>{statement.audienceReaction.replaceAll("_", " ")}</strong></article>;
          })}
        </div>
        <div className="persona-relations">
          <header><span>SOCIAL GRAPH</span><b>LIVE RELATIONSHIPS</b></header>
          {state.personas.map((persona) => (
            <article key={persona.id}><b>{persona.displayName}</b><span>{persona.alliances.length ? `ALLIED: ${persona.alliances.map((id) => state.personas.find((other) => other.id === id)?.displayName).join(", ")}` : "NO ACTIVE ALLIANCE"}</span><Metric label="TRUST" value={persona.metrics.trust} /></article>
          ))}
        </div>
      </section>

      <section className="persona-replay">
        <button onClick={() => { setReplayIndex(0); setPlaying(false); }} disabled={!frames.length}>|◀</button>
        <button onClick={() => setPlaying((value) => !value)} disabled={!frames.length}>{playing ? "PAUSE" : "PLAY"}</button>
        <input aria-label="Replay frame" type="range" min="0" max={Math.max(0, frames.length - 1)} value={frame} onChange={(event) => { setPlaying(false); setReplayIndex(Number(event.target.value)); }} />
        <span>FRAME {frame + 1} / {Math.max(1, frames.length)}</span>
        <button onClick={() => { setReplayIndex(undefined); setPlaying(false); }}>LIVE</button>
      </section>
    </div>
  );
}

export function buildPersonaReplayFrames(
  resetState: unknown,
  persisted: PersonaReplayFrame[],
  streamed: PersonaReplayFrame[]
): PersonaReplayFrame[] {
  const frames: PersonaReplayFrame[] = [];
  const seen = new Set<string>();
  const candidates: PersonaReplayFrame[] = [
    ...(isPersonaCraftState(resetState) ? [{ step: 0, state: resetState }] : []),
    ...persisted,
    ...streamed
  ];
  for (const candidate of candidates) {
    if (!isPersonaCraftState(candidate.state)) continue;
    const state = candidate.state;
    const key = `${state.round}/${state.phase}/${state.activeParticipantId}/${state.transcript.length}/${state.eventHistory.length}/${state.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push(candidate);
  }
  return frames;
}

type PersonaReplayFrame = { step: number; state?: unknown };

export function buildPersonaRematchConfig(config: ExperimentConfig, currentSeed: number): Partial<ExperimentConfig> {
  const { id: _experimentId, ...reusable } = config;
  const baseName = config.name.replace(/(?:\s*\/\s*rematch)+$/i, "");
  const nextSeed = ((Number.isFinite(currentSeed) ? Math.trunc(currentSeed) : 504) + 1) % 2_147_483_647;
  return { ...reusable, name: `${baseName} / rematch`, seed: nextSeed || 1 };
}

function PersonaHud({ persona, active }: { persona: PersonaDefinition; active: boolean }) {
  return (
    <article className={`persona-hud ${active ? "active" : ""}`}>
      <i style={{ background: persona.color }} /><div><span>{persona.title}</span><b>{persona.displayName}</b><small>{persona.traits.join(" · ")}</small></div>
      <dl><div><dt>REP</dt><dd>{persona.metrics.reputation.toFixed(0)}</dd></div><div><dt>INF</dt><dd>{persona.metrics.influence.toFixed(0)}</dd></div><div><dt>SUS</dt><dd>{persona.metrics.suspicion.toFixed(0)}</dd></div></dl>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="persona-meter"><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i><strong>{value.toFixed(0)}</strong></div>;
}
