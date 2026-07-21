"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArenaEvent, ExperimentConfig, RunRecord } from "@arena/contracts";
import type { StreamState } from "@/hooks/use-run-stream";
import { arenaApi } from "@/lib/arena-api";
import { shortId } from "@/lib/format";
import type { PhysicalAIState, PhysicalAIRobot } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { isPhysicalAIState, PhysicalAIMissionScene } from "./physical-ai-scene";

type CameraMode = "broadcast" | "overhead" | "robot" | "arm";

export function PhysicalAIRunView({
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
  const hasHumanParticipant = Boolean(run.config.participants?.some((participant) => participant.kind === "human"));
  const autoplayRequested = searchParams.get("broadcast") === "1" && !hasHumanParticipant;
  const autoplayStarted = useRef(false);
  const rematchStarted = useRef(false);
  const stageRef = useRef<HTMLElement>(null);
  const [replayIndex, setReplayIndex] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("broadcast");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [run.id]);

  const streamedFrames = useMemo(
    () => events.flatMap((event) => {
      if (event.type !== "environment.step_completed") return [];
      const state = (event.payload as { state?: unknown }).state;
      return isPhysicalAIState(state) ? [{ step: event.step ?? 0, state }] : [];
    }),
    [events]
  );
  const resetEvent = [...events].reverse().find((event) => event.type === "environment.reset");
  const resetState = (resetEvent?.payload as { state?: unknown } | undefined)?.state;
  const frames = useMemo(
    () => buildPhysicalReplayFrames(resetState, run.replay, streamedFrames),
    [resetState, run.replay, streamedFrames]
  );
  const latestEvent = [...events].reverse().find((event) => event.type === "environment.step_completed");
  const latest = (latestEvent?.payload as { state?: unknown } | undefined)?.state ??
    run.finalState ?? (resetEvent?.payload as { state?: unknown } | undefined)?.state;
  const replayState = replayIndex === undefined ? undefined : frames[replayIndex]?.state;
  const state = isPhysicalAIState(replayState) ? replayState : isPhysicalAIState(latest) ? latest : undefined;
  const terminalAtTail = run.status === "completed" || run.status === "failed" || state?.result !== undefined;

  useEffect(() => {
    if (!playing || !frames.length) return;
    const timer = window.setTimeout(() => {
      setReplayIndex((current) => {
        const next = (current ?? 0) + 1;
        if (next >= frames.length) {
          if (terminalAtTail) setPlaying(false);
          return frames.length - 1;
        }
        return next;
      });
    }, 1_050);
    return () => window.clearTimeout(timer);
  }, [playing, frames.length, replayIndex, terminalAtTail]);

  useEffect(() => {
    if (!autoplayRequested || autoplayStarted.current || frames.length < 2) return;
    autoplayStarted.current = true;
    setReplayIndex(0);
    setPlaying(true);
  }, [autoplayRequested, frames.length]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  if (!state) return <div className="system-message"><h2>Loading mission telemetry…</h2></div>;

  const human = run.config.participants?.find(
    (participant) => participant.kind === "human" && participant.id === state.activeParticipantId
  );
  const frame = Math.min(replayIndex ?? Math.max(0, frames.length - 1), Math.max(0, frames.length - 1));
  const visibleStep = frames[frame]?.step ?? latestEvent?.step ?? state.step;
  const presentedActorId = state.recentEvents.find((event) => event.actorId)?.actorId ?? state.activeParticipantId;
  const presentationState = presentedActorId === state.activeParticipantId
    ? state
    : { ...state, activeParticipantId: presentedActorId };
  const carrier = state.robots.find((robot) => robot.payloadObjectId === "package-p3");
  const activeRobot = state.robots.find((robot) => robot.assignedParticipantId === presentedActorId && robot.type === "mobile");
  const humanRobot = human
    ? state.robots.find((robot) => robot.assignedParticipantId === human.id && robot.type === "mobile")
    : undefined;
  const terminal = terminalAtTail;
  const lastMissionEvent = state.recentEvents.at(-1) ?? state.eventHistory.at(-1);
  const generatedEvent = [...events].reverse().find((event) => event.type === "agent.action_generated" && (event.step ?? 0) <= visibleStep);
  const generated = generatedEvent?.payload as { action?: { type?: string; summary?: string; metadata?: Record<string, unknown> }; participant?: { id?: string; displayName?: string }; usage?: { inputTokens?: number; outputTokens?: number } } | undefined;
  const controller = run.config.participants?.find((participant) => participant.id === presentedActorId);

  async function rerun() {
    if (rematchStarted.current) return;
    rematchStarted.current = true;
    setBusy(true);
    setActionError(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await arenaApi.startRun(
        buildPhysicalRematchConfig(run.config, state?.seed ?? run.config.seed ?? 606),
        controller.signal
      );
      router.push(hasHumanParticipant ? `/runs/${response.runId}` : `/runs/${response.runId}?broadcast=1`, { scroll: true });
    } catch (reason) {
      setActionError(reason instanceof DOMException && reason.name === "AbortError" ? "The new mission timed out while starting. This result is still safe." : reason instanceof Error ? reason.message : String(reason));
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

  return (
    <div className="physical-run">
      <header className="physical-runbar">
        <div><Link href="/environments/physical-ai-mission-lab-v1">← PHYSICAL AI LAB</Link><span>RUN {shortId(run.id)}</span></div>
        <div><b>{state.missionName}</b><span>{formatClock(state.timeLimitSeconds - state.simulationTime)} REMAINING</span></div>
        <div><span className={`connection-state ${replayIndex !== undefined ? "live" : connection}`}><i />{replayIndex !== undefined ? "broadcast" : connection}</span><StatusChip status={replayIndex !== undefined ? "running" : run.status} /><button onClick={() => void toggleFullscreen()}>{fullscreen ? "EXIT VIEW" : "EXPAND"}</button><button onClick={() => void recover()} disabled={busy}>SYNC</button><button className="physical-rerun-button" onClick={() => void rerun()} disabled={busy}>{busy ? "STARTING…" : terminal ? "↻ RUN AGAIN" : "↻ RESTART"}</button></div>
      </header>
      {error && <div className="stream-warning">MISSION LINK / {error}</div>}
      <section className={`physical-backend-banner ${state.backend.isaacAvailable ? "isaac" : "reference"}`}>
        <div><i /><b>{state.backend.isaacAvailable ? "ISAAC SIM BRIDGE" : "SEEDED REFERENCE BACKEND"}</b><span>{state.backend.physicsEngine}</span></div>
        <p>{state.backend.disclosure}</p>
      </section>

      <section className="physical-mission-grid">
        <aside className="physical-objective-panel">
          <header><span>MISSION OBJECTIVES</span><b>{state.completionPercent}%</b></header>
          <div className="physical-progress"><i><b style={{ width: `${state.completionPercent}%` }} /></i></div>
          {state.objectives.map((objective, index) => (
            <article className={objective.status} key={objective.id}>
              <i>{objective.status === "completed" ? "✓" : objectiveIcon(objective.id, index)}</i>
              <div><b>{objective.label}</b><p>{objective.description}</p></div>
            </article>
          ))}
          <div className="physical-minimap">
            <span>FACILITY MAP</span>
            {state.zones.map((zone) => <i key={zone.id} className={zone.type} style={{ left: `${((zone.center.x + 8) / 16) * 100}%`, top: `${((zone.center.z + 6) / 12) * 100}%` }} title={zone.label} />)}
            {state.robots.filter((robot) => robot.type === "mobile").map((robot) => <b key={robot.id} style={{ left: `${((robot.pose.x + 8) / 16) * 100}%`, top: `${((robot.pose.z + 6) / 12) * 100}%`, background: robot.color }} title={robot.displayName} />)}
          </div>
        </aside>

        <article className="physical-stage" ref={stageRef}>
          <div className="physical-stage-top"><span>MISSION VIEW / {cameraMode.toUpperCase()}</span><b>{state.status === "completed" ? "EXTRACTION COMPLETE" : state.phase.toUpperCase()}</b></div>
          <PhysicalAIMissionScene state={presentationState} cameraMode={cameraMode} />
          {lastMissionEvent && (
            <div className={`physical-action-callout ${lastMissionEvent.result}`}>
              <span>STEP {visibleStep} · {lastMissionEvent.type.toUpperCase()}</span>
              <strong>{controller?.displayName ?? presentedActorId.toUpperCase()}</strong>
              <p>{lastMissionEvent.description}</p>
            </div>
          )}
          <div className="physical-camera-controls">
            {(["broadcast", "overhead", "robot", "arm"] as CameraMode[]).map((mode) => <button className={cameraMode === mode ? "active" : ""} onClick={() => setCameraMode(mode)} key={mode}>{mode.toUpperCase()}</button>)}
          </div>
          {state.result && (
            <div className={`physical-result ${state.result.success ? "success" : "failure"}`}>
              <span>{state.result.success ? "MISSION ACCOMPLISHED" : "MISSION FAILED"}</span>
              <strong>{state.result.success ? "P3 EXTRACTED" : state.result.reason.replaceAll("_", " ")}</strong>
              <b>SCORE {state.result.finalScore.toFixed(1)}</b>
              <button onClick={() => void rerun()} disabled={busy}>{busy ? "INITIALIZING CELL…" : "RUN NEW MISSION"}</button>
            </div>
          )}
        </article>

        <aside className="physical-telemetry">
          <header><span>{human ? "OPERATOR COMMANDS" : hasHumanParticipant ? "AI TEAMMATE ACTING" : "FLEET TELEMETRY"}</span><b>{state.phase}</b></header>
          <div className="physical-robot-stack">
            {state.robots.map((robot) => <RobotTelemetry robot={robot} active={robot === activeRobot} key={robot.id} />)}
          </div>
          {human && humanRobot && (
            <HumanMissionControls
              state={state}
              robot={humanRobot}
              carrier={carrier}
              busy={busy}
              act={act}
            />
          )}
          {hasHumanParticipant && !human && !terminal && (
            <div className="physical-human-wait">
              <i /><span>TEAMMATE TURN</span>
              <b>{run.config.participants?.find((participant) => participant.id === state.activeParticipantId)?.displayName ?? state.activeParticipantId}</b>
              <p>The AI teammate is choosing one validated action. Your controls unlock automatically when ATLAS-01 returns to you.</p>
            </div>
          )}
          {actionError && <p className="form-error">{actionError}</p>}
          {!human && (
            <div className="physical-agent-plan">
              <span>AGENT CONTROL CHANNEL</span>
              <div className="physical-agent-chip"><i /><b>{controller?.displayName ?? presentedActorId}</b><small>{generated?.action?.metadata?.provider ? `${generated.action.metadata.provider} / ${generated.action.metadata.model ?? "model"}` : controller?.agentId ?? "default policy"}</small></div>
              <dl><div><dt>TOOL</dt><dd>{generated?.action?.type ?? "mission.wait"}</dd></div><div><dt>TOKENS</dt><dd>{(generated?.usage?.inputTokens ?? 0) + (generated?.usage?.outputTokens ?? 0) || "LOCAL"}</dd></div></dl>
              <p>{state.plan?.summary ?? "Awaiting the initial mission plan."}</p>
              <b>{generated?.action?.summary ?? state.eventHistory.at(-1)?.description ?? "Robots awaiting authorization."}</b>
            </div>
          )}
        </aside>
      </section>

      <section className="physical-metrics">
        <Metric label="MISSION SCORE" value={state.metrics.scoreEstimate} unit="/ 100" />
        <Metric label="ENERGY USED" value={state.metrics.energyUsed} unit="units" />
        <Metric label="DISTANCE" value={state.metrics.distanceTravelled} unit="m" />
        <Metric label="COLLISIONS" value={state.metrics.collisions} unit="" />
        <Metric label="HAZARD CONTACTS" value={state.metrics.hazardContacts} unit="" />
        <Metric label="VALID ACTIONS" value={state.metrics.validActions} unit="" />
      </section>

      <section className="physical-bottom-grid">
        <div className="physical-timeline">
          <header><span>MISSION TIMELINE</span><b>{state.eventHistory.length} SEMANTIC EVENTS</b></header>
          {[...state.eventHistory].reverse().slice(0, 14).map((event) => (
            <article className={event.result} key={event.id}><i>{String(event.sequence).padStart(2, "0")}</i><div><span>{event.type} · T+{event.simulationTime.toFixed(0)}S</span><p>{event.description}</p></div><b>{event.result}</b></article>
          ))}
        </div>
        <div className="physical-snapshots">
          <header><span>AUTHORITATIVE SNAPSHOTS</span><b>{state.snapshots.length}</b></header>
          {state.snapshots.map((snapshot) => <article key={snapshot.id}><i>◆</i><div><b>{snapshot.reason.replaceAll("_", " ")}</b><span>STEP {snapshot.step} · {snapshot.phase}</span></div></article>)}
        </div>
      </section>

      <section className="physical-replay">
        <button onClick={() => { setReplayIndex(0); setPlaying(false); }} disabled={!frames.length}>|◀</button>
        <button onClick={() => setPlaying((value) => !value)} disabled={!frames.length}>{playing ? "PAUSE" : "PLAY"}</button>
        <input aria-label="Physical mission replay frame" type="range" min="0" max={Math.max(0, frames.length - 1)} value={frame} onChange={(event) => { setPlaying(false); setReplayIndex(Number(event.target.value)); }} />
        <span>FRAME {frame + 1} / {Math.max(1, frames.length)}</span>
        <button onClick={() => { setReplayIndex(undefined); setPlaying(false); }}>LIVE</button>
      </section>
    </div>
  );
}

function HumanMissionControls({
  state,
  robot,
  carrier,
  busy,
  act
}: {
  state: PhysicalAIState;
  robot: PhysicalAIRobot;
  carrier?: PhysicalAIRobot;
  busy: boolean;
  act: (type: string, args: Record<string, unknown>, summary: string) => Promise<void>;
}) {
  const obstacle = state.objects.find((object) => object.id === "obstacle-o2")!;
  const packageObject = state.objects.find((object) => object.id === "package-p3")!;
  if (!state.plan) {
    return <div className="physical-command-grid"><button disabled={busy} onClick={() => act("mission.submit_plan", {
      summary: "Inspect the facility, clear O2, receive P3 from the fixed arm, and extract along the safe corridor.",
      assignments: [
        { robotId: "mobile-01", objective: "Clear route and deliver P3." },
        { robotId: "mobile-02", objective: "Inspect and coordinate." },
        { robotId: "arm-01", objective: "Transfer P3." }
      ]
    }, "Human submits warehouse rescue plan.")}>SUBMIT SAFETY-FIRST PLAN</button></div>;
  }
  return (
    <div className="physical-command-grid">
      <span>HIGH-LEVEL ACTIONS / {robot.displayName}</span>
      <button disabled={busy} onClick={() => act("robot.navigate", { robotId: robot.id, target: { type: "object", objectId: "conveyor-01" }, speedProfile: "safe" }, "Navigate to conveyor.")}>GO TO CONVEYOR</button>
      <button disabled={busy} onClick={() => act("robot.inspect", { robotId: robot.id, targetId: "conveyor-01", sensor: "camera" }, "Inspect conveyor.")}>INSPECT CONVEYOR</button>
      <button disabled={busy} onClick={() => act("robot.navigate", { robotId: robot.id, target: { type: "object", objectId: "obstacle-o2" }, speedProfile: "safe" }, "Approach blocked aisle.")}>GO TO OBSTACLE</button>
      <button disabled={busy || obstacle.state === "cleared"} onClick={() => act("robot.inspect", { robotId: robot.id, targetId: "obstacle-o2", sensor: "depth" }, "Inspect obstacle.")}>SCAN OBSTACLE</button>
      <button disabled={busy || obstacle.state === "cleared"} onClick={() => act("robot.push", { robotId: robot.id, objectId: "obstacle-o2", destinationId: "clearance-bay" }, "Clear obstacle.")}>CLEAR ROUTE</button>
      <button disabled={busy} onClick={() => act("robot.navigate", { robotId: robot.id, target: { type: "waypoint", waypointId: "package-bay" }, speedProfile: "safe" }, "Approach package bay.")}>GO TO PACKAGE BAY</button>
      <button disabled={busy || packageObject.inspected} onClick={() => act("robot.inspect", { robotId: robot.id, targetId: "package-p3", sensor: "camera" }, "Inspect priority package.")}>IDENTIFY P3</button>
      <button disabled={busy || packageObject.state === "carried" || packageObject.state === "delivered"} onClick={() => act("robot.activate_station", { robotId: "arm-01", stationId: "arm-01", commandId: "transfer-package" }, "Activate fixed arm transfer.")}>ACTIVATE ARM</button>
      <button disabled={busy || !carrier} onClick={() => act("robot.navigate", { robotId: carrier?.id ?? robot.id, target: { type: "zone", zoneId: "extraction-e1" }, speedProfile: "safe" }, "Carry P3 to extraction.")}>GO TO EXTRACTION</button>
      <button disabled={busy || !carrier} onClick={() => act("robot.place", { robotId: carrier?.id ?? robot.id, objectId: "package-p3", destinationId: "extraction-e1" }, "Place P3 in extraction zone.")}>DELIVER P3</button>
      <button disabled={busy} onClick={() => act("robot.stop", { robotId: robot.id }, "Emergency safe stop.")}>SAFE STOP</button>
    </div>
  );
}

function RobotTelemetry({ robot, active }: { robot: PhysicalAIRobot; active: boolean }) {
  return (
    <article className={active ? "active" : ""}>
      <i style={{ background: robot.color }} /><div><span>{robot.type.replaceAll("_", " ")}</span><b>{robot.displayName}</b><small>{robot.status}</small></div>
      <dl><div><dt>BAT</dt><dd>{robot.battery.toFixed(0)}%</dd></div><div><dt>ACT</dt><dd>{robot.stats.actions}</dd></div><div><dt>COL</dt><dd>{robot.stats.collisions}</dd></div></dl>
    </article>
  );
}

function Metric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <article><span>{label}</span><strong>{value.toFixed(value % 1 ? 1 : 0)}</strong><small>{unit}</small></article>;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

type PhysicalReplayFrame = { step: number; state?: unknown };

export function buildPhysicalReplayFrames(
  resetState: unknown,
  persisted: PhysicalReplayFrame[],
  streamed: PhysicalReplayFrame[]
): PhysicalReplayFrame[] {
  const frames: PhysicalReplayFrame[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...(isPhysicalAIState(resetState) ? [{ step: 0, state: resetState }] : []),
    ...persisted,
    ...streamed
  ];
  for (const candidate of candidates) {
    if (!isPhysicalAIState(candidate.state)) continue;
    const state = candidate.state;
    const robotState = state.robots.map((robot) => `${robot.id}:${robot.pose.x}:${robot.pose.z}:${robot.payloadObjectId ?? "-"}`).join("|");
    const key = `${state.step}/${state.phase}/${state.activeParticipantId}/${state.eventHistory.length}/${state.completionPercent}/${robotState}`;
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push(candidate);
  }
  return frames;
}

export function buildPhysicalRematchConfig(config: ExperimentConfig, currentSeed: number): Partial<ExperimentConfig> {
  const { id: _experimentId, ...reusable } = config;
  const baseName = config.name.replace(/(?:\s*\/\s*(?:rerun|rematch))+$/i, "");
  const nextSeed = ((Number.isFinite(currentSeed) ? Math.trunc(currentSeed) : 606) + 1) % 2_147_483_647;
  return { ...reusable, name: `${baseName} / rerun`, seed: nextSeed || 1 };
}

function objectiveIcon(id: string, index: number): string {
  return ({ plan: "⌁", inspect: "◉", clear: "↗", arm: "⌇", deliver: "◆" } as Record<string, string>)[id] ?? String(index + 1).padStart(2, "0");
}
