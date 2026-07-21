"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ArenaEvent, ReplayFrame, RunRecord } from "@arena/contracts";
import { useRunStream } from "@/hooks/use-run-stream";
import { formatDate, formatDuration, durationMs, evaluation, shortId } from "@/lib/format";
import type { GridState, StepPayload } from "@/lib/types";
import { GridRenderer, isGridState } from "./grid-renderer";
import { StatusChip } from "./status-chip";
import { LoadingBlock } from "./query-state";
import { RoyalChessRunView } from "@/features/environments/royal-chess/royal-chess-run-view";
import { BioCraftRunView } from "@/features/environments/biocraft/biocraft-run-view";
import { ChemCraftRunView } from "@/features/environments/chemcraft/chemcraft-run-view";
import { RumbleRunView } from "@/features/environments/agent-rumble/rumble-run-view";
import { PersonaCraftRunView } from "@/features/environments/personacraft/personacraft-run-view";
import { PhysicalAIRunView } from "@/features/environments/physical-ai/physical-ai-run-view";

type WorkspaceTab = "trace" | "metrics" | "state" | "replay";

export function RunWorkspace({ runId }: { runId: string }) {
  const { run, events, connection, error, recover } = useRunStream(runId);
  const [tab, setTab] = useState<WorkspaceTab>("trace");
  const [replayIndex, setReplayIndex] = useState<number>();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || !run?.replay.length) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        const last = run.replay.length - 1;
        const next = (current ?? 0) + 1;
        if (next > last) {
          setPlaying(false);
          return last;
        }
        return next;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing, run?.replay.length]);

  const latestStep = useMemo(
    () => [...events].reverse().find((event) => event.type === "environment.step_completed"),
    [events]
  );
  const selectedFrame =
    replayIndex === undefined ? undefined : run?.replay[replayIndex];
  const displayedState = (selectedFrame?.state ??
    (latestStep?.payload as StepPayload | undefined)?.state ??
    run?.finalState) as unknown;
  const latestAction = [...events]
    .reverse()
    .find((event) => event.type === "agent.action_generated");

  if (!run) return <LoadingBlock label="Recovering persisted run state" />;

  if (run.config.environmentId === "royal-chess-v1") {
    return (
      <RoyalChessRunView
        run={run}
        events={events}
        connection={connection}
        error={error}
        recover={recover}
      />
    );
  }
  if (run.config.environmentId === "biocraft-v1") {
    return (
      <BioCraftRunView
        run={run}
        events={events}
        connection={connection}
        error={error}
        recover={recover}
      />
    );
  }
  if (run.config.environmentId === "chemcraft-v1") {
    return (
      <ChemCraftRunView
        run={run}
        events={events}
        connection={connection}
        error={error}
        recover={recover}
      />
    );
  }
  if (run.config.environmentId === "agent-rumble-v1") {
    return (
      <RumbleRunView
        run={run}
        events={events}
        connection={connection}
        error={error}
        recover={recover}
      />
    );
  }
  if (run.config.environmentId === "personacraft-v1") {
    return (
      <PersonaCraftRunView
        run={run}
        events={events}
        connection={connection}
        error={error}
        recover={recover}
      />
    );
  }
  if (run.config.environmentId === "physical-ai-mission-lab-v1") {
    return (
      <PhysicalAIRunView
        run={run}
        events={events}
        connection={connection}
        error={error}
        recover={recover}
      />
    );
  }

  return (
    <div className="run-workspace">
      <section className="run-commandbar">
        <div>
          <Link href="/runs">← RUNS</Link>
          <span>/</span>
          <b>{shortId(run.id)}</b>
        </div>
        <div>
          <span className={`connection-state ${connection}`}><i />{connection}</span>
          <StatusChip status={run.status} />
          <button onClick={() => recover()}>SYNC</button>
        </div>
      </section>

      {error && <div className="stream-warning">STREAM NOTE / {error}</div>}

      <section className="run-overview">
        <div>
          <span>LIVE EXPERIMENT WORKSPACE</span>
          <h1>{run.config.environmentId}</h1>
          <p>{run.config.agentId} / {run.config.evaluatorIds.length} evaluators / seed {run.config.seed ?? "auto"}</p>
        </div>
        <dl>
          <div><dt>STEP</dt><dd>{run.steps} / {run.config.episodeLimits.maxSteps ?? "—"}</dd></div>
          <div><dt>EVENTS</dt><dd>{events.length}</dd></div>
          <div><dt>DURATION</dt><dd>{formatDuration(durationMs(run))}</dd></div>
          <div><dt>STARTED</dt><dd>{formatDate(run.startedAt)}</dd></div>
        </dl>
      </section>

      <section className="workspace-grid">
        <article className="viewport-panel">
          <header>
            <span>ENVIRONMENT VIEWPORT</span>
            <b>{selectedFrame ? `REPLAY / FRAME ${replayIndex! + 1}` : "LATEST STATE"}</b>
          </header>
          <div className="viewport">
            {isGridState(displayedState) ? (
              <GridRenderer state={displayedState} />
            ) : (
              <pre>{JSON.stringify(displayedState ?? { status: "Awaiting state" }, null, 2)}</pre>
            )}
          </div>
          <ReplayBar
            frames={run.replay}
            index={replayIndex}
            playing={playing}
            setIndex={setReplayIndex}
            toggle={() => setPlaying((current) => !current)}
          />
        </article>

        <aside className="context-panel">
          <header><span>RUN CONTEXT</span><b>{shortId(run.episodeId)}</b></header>
          <ContextBlock label="AGENT">
            <strong>{run.config.agentId}</strong>
            <small>Registered plugin</small>
          </ContextBlock>
          <ContextBlock label="LAST ACTION">
            {latestAction ? (
              <JsonPreview value={(latestAction.payload as { action?: unknown }).action} />
            ) : <small>Awaiting action</small>}
          </ContextBlock>
          <ContextBlock label="TERMINATION">
            <strong>{run.terminationReason ?? "IN PROGRESS"}</strong>
            <small>{run.error?.message ?? "No runtime error recorded"}</small>
          </ContextBlock>
          <ContextBlock label="EVALUATORS">
            <div className="evaluation-list">
              {run.config.evaluatorIds.map((id) => {
                const result = evaluation(run, id);
                return <div key={id}><span>{id}</span><b>{result?.score ?? (result?.passed === undefined ? "—" : result.passed ? "PASS" : "FAIL")}</b></div>;
              })}
            </div>
          </ContextBlock>
        </aside>
      </section>

      <section className="evidence-panel">
        <nav aria-label="Run evidence views">
          {(["trace", "metrics", "state", "replay"] as const).map((item) => (
            <button
              key={item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item.toUpperCase()}
              {item === "trace" && <span>{events.length}</span>}
            </button>
          ))}
        </nav>
        <div className="evidence-content">
          {tab === "trace" && <Trace events={events} />}
          {tab === "metrics" && <Metrics run={run} events={events} />}
          {tab === "state" && <JsonPreview value={displayedState ?? run.finalState ?? {}} expanded />}
          {tab === "replay" && (
            <ReplayFrames
              frames={run.replay}
              selected={replayIndex}
              onSelect={setReplayIndex}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ContextBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="context-block"><span>{label}</span>{children}</section>;
}

function JsonPreview({ value, expanded = false }: { value: unknown; expanded?: boolean }) {
  return <pre className={expanded ? "json-expanded" : ""}>{JSON.stringify(value, null, 2)}</pre>;
}

function ReplayBar({
  frames,
  index,
  playing,
  setIndex,
  toggle
}: {
  frames: ReplayFrame[];
  index?: number;
  playing: boolean;
  setIndex: (value: number) => void;
  toggle: () => void;
}) {
  const max = Math.max(0, frames.length - 1);
  const value = Math.min(index ?? max, max);
  return (
    <div className="replay-bar">
      <button onClick={() => setIndex(0)} disabled={!frames.length}>|◀</button>
      <button onClick={toggle} disabled={!frames.length}>{playing ? "Ⅱ" : "▶"}</button>
      <input
        aria-label="Replay frame"
        type="range"
        min="0"
        max={max}
        value={value}
        disabled={!frames.length}
        onChange={(event) => setIndex(Number(event.target.value))}
      />
      <span>FRAME {frames.length ? value + 1 : 0} / {frames.length}</span>
    </div>
  );
}

function Trace({ events }: { events: ArenaEvent[] }) {
  return (
    <div className="trace-list">
      {[...events].reverse().map((event) => (
        <div className="trace-row" key={event.id}>
          <time>{new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}</time>
          <span>{event.step === undefined ? "SYS" : String(event.step).padStart(2, "0")}</span>
          <code>{event.type}</code>
          <b>{event.source}</b>
          <details>
            <summary>PAYLOAD</summary>
            <JsonPreview value={event.payload} />
          </details>
        </div>
      ))}
      {events.length === 0 && <p>No events have been persisted yet.</p>}
    </div>
  );
}

function Metrics({ run, events }: { run: RunRecord; events: ArenaEvent[] }) {
  const reward = events
    .filter((event) => event.type === "environment.step_completed")
    .reduce((sum, event) => sum + Number((event.payload as StepPayload).reward ?? 0), 0);
  return (
    <div className="metrics-grid">
      <article><span>TOTAL REWARD</span><strong>{reward.toFixed(2)}</strong><small>from recorded steps</small></article>
      <article><span>STEPS</span><strong>{run.steps}</strong><small>environment transitions</small></article>
      <article><span>TRACE EVENTS</span><strong>{events.length}</strong><small>normalized records</small></article>
      <article><span>REPLAY FRAMES</span><strong>{run.replay.length}</strong><small>stored states</small></article>
      {run.evaluations.map((item) => (
        <article key={item.evaluatorId}>
          <span>{item.evaluatorId}</span>
          <strong>{item.score ?? (item.passed === undefined ? "—" : item.passed ? "PASS" : "FAIL")}</strong>
          <small>{item.summary ?? "episode evaluator"}</small>
        </article>
      ))}
    </div>
  );
}

function ReplayFrames({
  frames,
  selected,
  onSelect
}: {
  frames: ReplayFrame[];
  selected?: number;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="frame-list">
      {frames.map((frame, index) => (
        <button
          className={selected === index ? "active" : ""}
          onClick={() => onSelect(index)}
          key={`${frame.step}-${frame.timestamp}`}
        >
          <span>FRAME {String(index + 1).padStart(2, "0")}</span>
          <b>STEP {frame.step}</b>
          <small>{frame.events.length} events</small>
        </button>
      ))}
      {frames.length === 0 && <p>No replay frames have been persisted.</p>}
    </div>
  );
}
