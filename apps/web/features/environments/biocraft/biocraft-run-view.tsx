"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgentAction, ArenaEvent, RunRecord } from "@arena/contracts";
import type { StreamState } from "@/hooks/use-run-stream";
import { arenaApi } from "@/lib/arena-api";
import { durationMs, formatDuration, shortId } from "@/lib/format";
import type { BioCraftState, BioCraftToolInvocation } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { BioCraftStructureViewer } from "./biocraft-structure-viewer";
import {
  bioCraftProgressIndex,
  buildBioCraftReplayFrames,
  isBioCraftState
} from "./biocraft-replay";
import { buildBioCraftTasks, type BioCraftTask } from "./biocraft-progress";

type WorkspaceView = "sequence" | "structure" | "alignment" | "mutations";

export function BioCraftRunView({
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
  const [view, setView] = useState<WorkspaceView>("sequence");
  const [selectedResidue, setSelectedResidue] = useState<number>();
  const [replayIndex, setReplayIndex] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [rerunning, setRerunning] = useState(false);
  const latestStep = [...events]
    .reverse()
    .find((event) => event.type === "environment.step_completed");
  const reset = [...events].reverse().find((event) => event.type === "environment.reset");
  const streamed = (latestStep?.payload as { state?: unknown } | undefined)?.state;
  const resetState = (reset?.payload as { state?: unknown } | undefined)?.state;
  const replayFrames = useMemo(
    () =>
      buildBioCraftReplayFrames([
        resetState,
        ...run.replay.map((frame) => frame.state),
        ...events
          .filter((event) => event.type === "environment.step_completed")
          .map((event) => (event.payload as { state?: unknown } | undefined)?.state)
      ]),
    [events, resetState, run.replay]
  );
  const replayState = replayIndex === undefined ? undefined : replayFrames[replayIndex];
  const stateCandidate =
    replayState ??
    streamed ??
    run.finalState ??
    resetState;
  const state = isBioCraftState(stateCandidate) ? stateCandidate : undefined;

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
    }, 720);
    return () => window.clearInterval(timer);
  }, [playing, replayFrames.length]);

  useEffect(() => {
    if (state?.workspace.selectedResidue) {
      setSelectedResidue(state.workspace.selectedResidue);
    }
    setBusy(false);
  }, [state?.toolHistory.length, state?.workspace.notes.length, state?.status]);

  if (!state) {
    return (
      <div className="system-message">
        <h2>Loading the BioCraft challenge pack…</h2>
      </div>
    );
  }

  const humanParticipant = run.config.participants?.find(
    (participant) => participant.kind === "human"
  );
  const isTerminal =
    state.status === "completed" || run.status === "completed" || run.status === "failed";
  const displayStatus = state.status === "completed" ? "completed" : run.status;
  const isHumanTurn =
    Boolean(humanParticipant) &&
    !isTerminal &&
    replayIndex === undefined;
  const reference = state.biologicalAssets.sequences.find(
    (sequence) => sequence.kind === "reference"
  )!;
  const structure = state.biologicalAssets.structures[0];
  const conservation = alignmentConservation(state.toolHistory);
  const tasks = buildBioCraftTasks(state);
  const latestActionEvent = [...events]
    .reverse()
    .find((event) => event.type === "agent.action_generated");
  const latestAction = (latestActionEvent?.payload as { action?: { type?: string } } | undefined)
    ?.action;
  const latestInvocation = state.toolHistory.at(-1);
  const currentTool =
    state.submission
      ? "biology.submit"
      : !isTerminal && latestAction?.type?.startsWith("biology.")
      ? latestAction.type
      : latestInvocation?.tool ?? "biology.inspect_sequence";
  const frameValue = Math.min(
    replayIndex ?? Math.max(0, replayFrames.length - 1),
    Math.max(0, replayFrames.length - 1)
  );
  const progressPercent = Math.round(
    (tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) * 100
  );

  async function rerunExperiment() {
    if (!isTerminal) {
      await recover();
      return;
    }
    setRerunning(true);
    setActionError(undefined);
    try {
      const response = await arenaApi.startRun({
        ...run.config,
        name: `${run.config.name} / rerun`
      });
      router.push(`/runs/${response.runId}`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      setRerunning(false);
    }
  }

  async function send(type: string, args: Record<string, unknown>, summary: string) {
    if (!humanParticipant || busy) return;
    setBusy(true);
    setActionError(undefined);
    const action: AgentAction = {
      id: crypto.randomUUID(),
      type,
      arguments: args,
      summary,
      metadata: { declaredPlan: summary, source: "biocraft-human-workbench" }
    };
    try {
      await arenaApi.submitAction(run.id, humanParticipant.id, action);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  return (
    <div className="biocraft-run">
      <header className="bio-run-header">
        <div>
          <Link href="/environments/biocraft-v1">← BIOCRAFT</Link>
          <span>/</span>
          <b>{shortId(run.id)}</b>
        </div>
        <div className="bio-run-title">
          <span>PROTEIN MUTATION ANALYSIS</span>
          <b>{state.challengeTitle}</b>
        </div>
        <div>
          <span className={`connection-state ${connection}`}><i />{connection}</span>
          <StatusChip status={displayStatus} />
          <button
            className={`bio-run-control ${isTerminal ? "complete" : "active"}`}
            onClick={() => void rerunExperiment()}
            disabled={rerunning}
          >
            <i />
            {rerunning
              ? "STARTING…"
              : isTerminal
                ? "↻ RERUN"
                : `${state.status.toUpperCase()} / SYNC`}
          </button>
        </div>
      </header>

      {(error || actionError) && (
        <div className="stream-warning">LAB LINK / {actionError ?? error}</div>
      )}

      <section className="bio-status-strip">
        <div><span>CHALLENGE</span><b>{state.challengeId}</b></div>
        <div><span>REFERENCE</span><b>1UBQ / {reference.length} AA</b></div>
        <div><span>TOOLS</span><b>{state.budget.toolCallsUsed} / {state.budget.maxToolCalls}</b></div>
        <div><span>NETWORK</span><b className="safe">DISABLED</b></div>
        <div><span>REPLAY</span><b>{Math.max(0, replayFrames.length - 1)} FRAMES</b></div>
        <div><span>SCORE</span><b>{state.evaluation ? `${(state.evaluation.overallScore * 100).toFixed(1)}%` : "PENDING"}</b></div>
      </section>

      <ToolTelemetry
        currentTool={currentTool}
        state={state}
        agentId={humanParticipant ? "human-researcher" : run.config.agentId}
        isTerminal={isTerminal}
        isReplay={replayIndex !== undefined}
      />

      <BioTaskProgress
        tasks={tasks}
        progressPercent={progressPercent}
        isReplay={replayIndex !== undefined}
      />

      {isHumanTurn && (
        <HumanResearchControls
          state={state}
          busy={busy}
          selectedResidue={selectedResidue}
          send={send}
        />
      )}

      <section className="bio-workbench">
        <aside className="bio-challenge-panel">
          <header><span>CHALLENGE BRIEF</span><b>LIVE</b></header>
          <div className="bio-objective">
            <span>OBJECTIVE</span>
            <p>{state.objective}</p>
          </div>
          <div className="bio-assets">
            <span>INPUT ASSETS</span>
            <button className="active"><b>FA</b><span>1UBQ_A<small>reference.fasta</small></span></button>
            <button><b>MSA</b><span>Homolog set<small>3 aligned sequences</small></span></button>
            <button><b>3D</b><span>1UBQ<small>RCSB structure</small></span></button>
            <button><b>ANN</b><span>Annotations<small>{state.biologicalAssets.annotations.length} curated tracks</small></span></button>
          </div>
          <div className="bio-candidates">
            <span>CANDIDATE MUTATIONS</span>
            {state.biologicalAssets.candidateMutations.map((candidate) => {
              const result = mutationInvocation(state.toolHistory, candidate.mutation);
              return (
                <button
                  className={selectedResidue === candidate.position ? "active" : ""}
                  onClick={() => {
                    setSelectedResidue(candidate.position);
                    setView("mutations");
                  }}
                  key={candidate.mutation}
                >
                  <b>{candidate.mutation}</b>
                  <small>{result ? `BLOSUM ${String(result.output?.blosum62)}` : "UNTESTED"}</small>
                </button>
              );
            })}
          </div>
          <div className="bio-budget">
            <span>TOOL BUDGET</span>
            <div><i style={{ width: `${(state.budget.toolCallsUsed / state.budget.maxToolCalls) * 100}%` }} /></div>
            <b>{state.budget.maxToolCalls - state.budget.toolCallsUsed} calls remaining</b>
          </div>
        </aside>

        <main className="bio-center-workspace">
          <nav>
            {(["sequence", "structure", "alignment", "mutations"] as const).map((item) => (
              <button
                className={view === item ? "active" : ""}
                onClick={() => setView(item)}
                key={item}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </nav>
          {view === "sequence" && (
            <SequenceWorkspace
              state={state}
              selectedResidue={selectedResidue}
              setSelectedResidue={setSelectedResidue}
              conservation={conservation}
            />
          )}
          {view === "structure" && structure && (
            <section className="bio-structure-workspace">
              <header>
                <div><span>STRUCTURE VIEWER</span><b>1UBQ / ACTUAL Cα COORDINATES</b></div>
                <small>DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A RESIDUE</small>
              </header>
              <BioCraftStructureViewer
                residues={structure.residues}
                selectedPosition={selectedResidue}
                onSelect={setSelectedResidue}
              />
              <StructureEvidence
                invocation={latestTool(state.toolHistory, "biology.inspect_structure")}
              />
            </section>
          )}
          {view === "alignment" && (
            <AlignmentWorkspace state={state} selectedResidue={selectedResidue} />
          )}
          {view === "mutations" && (
            <MutationWorkspace
              state={state}
              selectedResidue={selectedResidue}
              setSelectedResidue={setSelectedResidue}
            />
          )}
        </main>

        <aside className="bio-evidence-panel">
          <header><span>AGENT ACTIVITY</span><b>{state.status.toUpperCase()}</b></header>
          <div className="bio-agent-card">
            <i><BioTaskIcon icon="context" /></i>
            <div>
              <b>{humanParticipant ? "Human Researcher" : run.config.agentId}</b>
              <span>{humanParticipant ? "browser-controlled" : "ArenaOS registered research agent"}</span>
            </div>
          </div>
          <ActivityFeed history={state.toolHistory} busy={busy} />
          <div className="bio-notebook">
            <header><span>EVIDENCE NOTEBOOK</span><b>{state.workspace.notes.length}</b></header>
            {state.workspace.notes.map((note) => (
              <article key={note.id}>
                <span>{note.category.toUpperCase()} / STEP {note.createdAtStep}</span>
                <p>{note.content}</p>
                <small>{note.evidenceIds.length} linked results</small>
              </article>
            ))}
            {!state.workspace.notes.length && <p>Research notes will appear here.</p>}
          </div>
          <div className="bio-artifacts">
            <header><span>ARTIFACTS</span><b>{state.artifacts.length}</b></header>
            {state.artifacts.map((artifact) => (
              <a href={artifact.uri} download={artifact.name} key={artifact.id}>
                <b>FA</b><span>{artifact.name}<small>{artifact.mediaType}</small></span>
              </a>
            ))}
            {!state.artifacts.length && <p>No generated artifacts yet.</p>}
          </div>
        </aside>
      </section>

      <section className="bio-bottom-panel">
        <header>
          <span>ARENA EVENT TIMELINE</span>
          <div>
            <button onClick={() => setInspector((value) => !value)}>RAW INSPECTOR</button>
            <b>{events.length} EVENTS</b>
          </div>
        </header>
        <div className="bio-event-track">
          {events
            .filter((event) => event.type.startsWith("biocraft."))
            .map((event) => (
              <button
                title={event.type}
                className={
                  event.type.includes("failed")
                    ? "failed"
                    : event.type.includes("evaluation")
                      ? "evaluation"
                      : ""
                }
                onClick={() => {
                  setPlaying(false);
                  setReplayIndex(
                    Math.min(Math.max(0, event.step ?? 0), replayFrames.length - 1)
                  );
                }}
                key={event.id}
              >
                <i />
                <span>{event.type.replace("biocraft.", "")}</span>
                <small>{event.step ?? "—"}</small>
              </button>
            ))}
        </div>
        <div className="bio-replay-controls">
          <button
            aria-label="Previous BioCraft replay frame"
            onClick={() => {
              setPlaying(false);
              setReplayIndex((value) => Math.max(0, (value ?? replayFrames.length - 1) - 1));
            }}
            disabled={replayFrames.length < 2}
          >◀</button>
          <button
            aria-label={playing ? "Pause BioCraft replay" : "Play BioCraft replay"}
            onClick={() => {
              if (!playing) {
                setReplayIndex((value) =>
                  value === undefined || value >= replayFrames.length - 1 ? 0 : value
                );
              }
              setPlaying((value) => !value);
            }}
            disabled={replayFrames.length < 2}
          >{playing ? "Ⅱ" : "▶"}</button>
          <input
            aria-label="BioCraft replay frame"
            type="range"
            min="0"
            max={Math.max(0, replayFrames.length - 1)}
            value={frameValue}
            disabled={replayFrames.length < 2}
            onChange={(event) => {
              setPlaying(false);
              setReplayIndex(Number(event.target.value));
            }}
          />
          <span>
            {frameValue === 0 ? "OPENING" : `STEP ${bioCraftProgressIndex(replayFrames[frameValue] ?? state)}`}
            {" / "}{Math.max(0, replayFrames.length - 1)}
          </span>
          <button
            className={replayIndex === undefined ? "active" : ""}
            onClick={() => {
              setPlaying(false);
              setReplayIndex(undefined);
            }}
          >LIVE</button>
          <button
            aria-label="Next BioCraft replay frame"
            onClick={() => {
              setPlaying(false);
              setReplayIndex((value) => Math.min(replayFrames.length - 1, (value ?? 0) + 1));
            }}
            disabled={replayFrames.length < 2}
          >▶</button>
        </div>
      </section>

      {state.evaluation && <EvaluationBoard state={state} run={run} />}

      {inspector && (
        <section className="bio-raw-inspector">
          <header><span>REPRODUCIBILITY INSPECTOR</span><button onClick={() => setInspector(false)}>CLOSE ×</button></header>
          <div>
            <article><span>STATE</span><pre>{JSON.stringify(state, null, 2)}</pre></article>
            <article><span>EVENTS</span><pre>{JSON.stringify(events.slice(-12), null, 2)}</pre></article>
          </div>
        </section>
      )}
    </div>
  );
}

function ToolTelemetry({
  currentTool,
  state,
  agentId,
  isTerminal,
  isReplay
}: {
  currentTool: string;
  state: BioCraftState;
  agentId: string;
  isTerminal: boolean;
  isReplay: boolean;
}) {
  const toolState = (tool: string) => {
    const invocation = [...state.toolHistory].reverse().find((item) => item.tool === tool);
    if (invocation?.status === "failed") return "failed";
    if (invocation?.status === "completed") return "completed";
    if (!isTerminal && !isReplay && tool === currentTool) return "active";
    return "queued";
  };
  return (
    <section className="bio-tool-telemetry">
      <div className="bio-current-tool">
        <span className="bio-tool-glyph"><BioTaskIcon icon="context" /></span>
        <div>
          <small>{isReplay ? "REPLAYED TOOL STATE" : isTerminal ? "FINAL TOOL STATE" : "AGENT TOOL CHANNEL"}</small>
          <strong>{toolLabel(currentTool)}</strong>
          <span>{agentId} · local deterministic backend</span>
        </div>
        <b className={isReplay ? "replay" : isTerminal ? "complete" : "running"}>
          {isReplay ? "READ ONLY" : isTerminal ? "COMPLETE" : "RUNNING LOCALLY"}
        </b>
      </div>
      <div className="bio-tool-dock" aria-label="Available BioCraft tools">
        {state.availableTools.filter((tool) => tool !== "biology.submit").map((tool) => (
          <div className={toolState(tool)} title={tool} key={tool}>
            <i />
            <span>{toolLabel(tool)}</span>
          </div>
        ))}
        {state.unavailableTools.map((tool) => (
          <div className="unavailable" title={tool.reason} key={tool.id}>
            <i />
            <span>{toolLabel(tool.id)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BioTaskProgress({
  tasks,
  progressPercent,
  isReplay
}: {
  tasks: BioCraftTask[];
  progressPercent: number;
  isReplay: boolean;
}) {
  return (
    <section className="bio-task-progress">
      <header>
        <div>
          <span>EXPERIMENT PROGRESSION</span>
          <b>{isReplay ? "REPLAY SNAPSHOT" : `${progressPercent}% COMPLETE`}</b>
        </div>
        <div className="bio-overall-progress" aria-label={`${progressPercent}% experiment complete`}>
          <i style={{ width: `${progressPercent}%` }} />
        </div>
      </header>
      <div className="bio-task-grid">
        {tasks.map((task, index) => (
          <article className={task.status} key={task.id}>
            <div className="bio-task-icon"><BioTaskIcon icon={task.icon} /></div>
            <span>0{index + 1}</span>
            <b>{task.label}</b>
            <small>{task.detail}</small>
            <div><i style={{ width: `${task.progress * 100}%` }} /></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BioTaskIcon({ icon }: { icon: BioCraftTask["icon"] }) {
  if (icon === "sequence") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3c7 4 3 14 10 18M17 3C10 7 14 17 7 21M8.5 7h7M8.5 12h7M8.5 17h7" /></svg>;
  }
  if (icon === "alignment") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h12M4 18h16M7 4v4M13 10v4M18 16v4" /></svg>;
  }
  if (icon === "variants") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M9.5 9.5l5 5M17 4v6M14 7h6" /></svg>;
  }
  if (icon === "context") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M4.5 8c3-5 12-5 15 0s-1 11-7.5 11S1.5 13 4.5 8Z" /></svg>;
  }
  if (icon === "artifact") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7zM14 3v5h5M10 13h5M10 17h5" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /><path d="m15 16 1.5 1.5L20 14" /></svg>;
}

function toolLabel(tool: string): string {
  const labels: Record<string, string> = {
    "biology.inspect_sequence": "Sequence profile",
    "biology.align_sequences": "Homolog alignment",
    "biology.score_substitution": "Variant scoring",
    "biology.inspect_annotations": "Annotation reader",
    "biology.inspect_structure": "3D neighborhood",
    "biology.apply_mutation": "Mutation builder",
    "biology.write_note": "Evidence notebook",
    "biology.submit": "Scientific report",
    "biology.estimate_stability": "Stability engine",
    "biology.run_python": "Python sandbox"
  };
  return labels[tool] ?? tool.replace("biology.", "").replaceAll("_", " ");
}

function HumanResearchControls({
  state,
  busy,
  selectedResidue,
  send
}: {
  state: BioCraftState;
  busy: boolean;
  selectedResidue?: number;
  send: (type: string, args: Record<string, unknown>, summary: string) => Promise<void>;
}) {
  const reference = state.biologicalAssets.sequences.find((item) => item.kind === "reference")!;
  const homologIds = state.biologicalAssets.sequences
    .filter((item) => item.kind === "homolog")
    .map((item) => item.id);
  const candidate = state.biologicalAssets.candidateMutations.find(
    (item) => item.position === selectedResidue
  ) ?? state.biologicalAssets.candidateMutations[0]!;
  const evidenceIds = state.toolHistory
    .filter((item) => item.status === "completed")
    .map((item) => item.id);
  const ranked = rankHumanEvidence(state);
  const completedTool = (type: string) =>
    state.toolHistory.some((item) => item.tool === type && item.status === "completed");
  const scoredCandidate = Boolean(mutationInvocation(state.toolHistory, candidate.mutation));
  const createdCandidate = state.toolHistory.some(
    (item) =>
      item.tool === "biology.apply_mutation" &&
      item.status === "completed" &&
      item.inputs.mutation === candidate.mutation
  );
  const actions = [
    {
      label: "INSPECT SEQUENCE",
      type: "biology.inspect_sequence",
      args: { sequenceId: reference.id, analyses: ["composition", "molecular_weight", "charge", "hydropathy"] },
      completed: completedTool("biology.inspect_sequence")
    },
    {
      label: "ALIGN HOMOLOGS",
      type: "biology.align_sequences",
      args: { sequenceIds: homologIds, mode: "multiple" },
      completed: completedTool("biology.align_sequences")
    },
    {
      label: `SCORE ${candidate.mutation}`,
      type: "biology.score_substitution",
      args: { sequenceId: reference.id, position: candidate.position, alternateResidue: candidate.alternateResidue },
      completed: scoredCandidate
    },
    {
      label: "READ ANNOTATIONS",
      type: "biology.inspect_annotations",
      args: { sequenceId: reference.id, start: 1, end: reference.length },
      completed: completedTool("biology.inspect_annotations")
    },
    {
      label: `INSPECT RESIDUE ${candidate.position}`,
      type: "biology.inspect_structure",
      args: { structureId: "1UBQ", residuePosition: candidate.position, radiusAngstroms: 8 },
      completed: false
    },
    {
      label: `CREATE ${candidate.mutation}`,
      type: "biology.apply_mutation",
      args: { sequenceId: reference.id, mutation: candidate.mutation },
      completed: createdCandidate
    },
    {
      label: "WRITE NOTE",
      type: "biology.write_note",
      args: {
        category: "observation",
        content: `Reviewed ${candidate.mutation} using the currently available local evidence.`,
        evidenceIds
      },
      completed: false
    }
  ];
  const canSubmit =
    state.biologicalAssets.candidateMutations.every((item) =>
      Boolean(mutationInvocation(state.toolHistory, item.mutation))
    ) && evidenceIds.length > 0;
  return (
    <section className="bio-human-controls">
      <header><span>HUMAN RESEARCH CONTROLS</span><b>{busy ? "TOOL RUNNING…" : "YOUR ACTION"}</b></header>
      <div>
        {actions.map((item) => (
          <button
            className={item.completed ? "completed" : ""}
            disabled={busy || item.completed || state.status === "completed"}
            onClick={() => void send(item.type, item.args, item.label)}
            key={item.type}
          >
            {item.completed ? `✓ ${item.label}` : item.label}
          </button>
        ))}
        <button
          className="submit"
          disabled={busy || !canSubmit || state.status === "completed"}
          onClick={() =>
            void send(
              "biology.submit",
              {
                rankedCandidates: ranked.map((item, index) => ({
                  mutation: item.mutation,
                  rank: index + 1,
                  predictedEffect: item.penalty >= 4 ? "functionally constrained" : "likely function-preserving",
                  confidence: 0.75,
                  evidenceIds,
                  justification: `Human workbench composite evidence score ${item.score.toFixed(2)} using local tool results and annotation context.`
                })),
                recommendedMutation: ranked[0]?.mutation,
                overallConfidence: 0.75,
                limitations: ["This is a computational analysis, not experimental validation."],
                summary: `${ranked[0]?.mutation} is recommended from the collected local evidence.`
              },
              "Submit evidence report"
            )
          }
        >
          SUBMIT REPORT
        </button>
      </div>
    </section>
  );
}

function SequenceWorkspace({
  state,
  selectedResidue,
  setSelectedResidue,
  conservation
}: {
  state: BioCraftState;
  selectedResidue?: number;
  setSelectedResidue: (position: number) => void;
  conservation: Array<{ position: number; conservation: number; entropy: number }>;
}) {
  const sequence = state.biologicalAssets.sequences.find((item) => item.kind === "reference")!;
  const candidatePositions = new Set(
    state.biologicalAssets.candidateMutations.map((candidate) => candidate.position)
  );
  return (
    <section className="bio-sequence-workspace">
      <header>
        <div><span>SEQUENCE VIEWER</span><b>{sequence.id} / {sequence.length} RESIDUES</b></div>
        <small>CLICK A RESIDUE TO SYNCHRONIZE THE LAB</small>
      </header>
      <div className="sequence-ruler">
        {Array.from({ length: sequence.length }, (_, index) => (
          (index + 1) % 10 === 0 ? <span style={{ gridColumn: index + 1 }} key={index}>{index + 1}</span> : null
        ))}
      </div>
      <div className="protein-sequence">
        {sequence.sequence.split("").map((residue, index) => {
          const position = index + 1;
          const annotations = state.biologicalAssets.annotations.filter(
            (annotation) => position >= annotation.start && position <= annotation.end
          );
          return (
            <button
              className={[
                residueClass(residue),
                candidatePositions.has(position) ? "candidate" : "",
                selectedResidue === position ? "selected" : "",
                annotations.some((annotation) => annotation.type.includes("functional")) ? "functional" : ""
              ].join(" ")}
              onClick={() => setSelectedResidue(position)}
              title={`${residue}${position}${annotations.length ? ` / ${annotations.map((item) => item.label).join(", ")}` : ""}`}
              key={position}
            >
              <b>{residue}</b><small>{position}</small>
            </button>
          );
        })}
      </div>
      <div className="sequence-track annotation-track">
        <span>ANNOTATION</span>
        <div>
          {state.biologicalAssets.annotations.map((annotation) => (
            <i
              title={annotation.label}
              style={{
                left: `${((annotation.start - 1) / sequence.length) * 100}%`,
                width: `${((annotation.end - annotation.start + 1) / sequence.length) * 100}%`
              }}
              key={annotation.id}
            />
          ))}
        </div>
      </div>
      <div className="sequence-track conservation-track">
        <span>CONSERVATION</span>
        <div>
          {Array.from({ length: sequence.length }, (_, index) => (
            <i
              style={{ height: `${(conservation[index]?.conservation ?? 0) * 100}%` }}
              key={index}
            />
          ))}
        </div>
      </div>
      <div className="bio-sequence-readouts">
        <SequenceMetrics invocation={latestTool(state.toolHistory, "biology.inspect_sequence")} />
        <ResidueFocus state={state} selectedResidue={selectedResidue} />
      </div>
    </section>
  );
}

function AlignmentWorkspace({
  state,
  selectedResidue
}: {
  state: BioCraftState;
  selectedResidue?: number;
}) {
  const alignment = latestTool(state.toolHistory, "biology.align_sequences");
  const records = (
    alignment?.output?.alignedSequences as
      | Array<{ id: string; sequence: string }>
      | undefined
  ) ?? state.biologicalAssets.sequences.filter((item) => item.kind !== "generated");
  const profile = alignmentConservation(state.toolHistory);
  return (
    <section className="bio-alignment-workspace">
      <header><div><span>MULTIPLE ALIGNMENT</span><b>BUNDLED HOMOLOG SET</b></div><small>NO LIVE DATABASE ACCESS</small></header>
      <div className="alignment-grid">
        {records.map((record) => (
          <div key={record.id}>
            <b>{record.id}</b>
            <p>
              {record.sequence.split("").map((residue, index) => (
                <span className={selectedResidue === index + 1 ? "selected" : ""} key={index}>{residue}</span>
              ))}
            </p>
          </div>
        ))}
        <div className="consensus">
          <b>CONSENSUS</b>
          <p>{profile.map((position, index) => <span key={index}>{position.conservation === 1 ? "*" : position.conservation >= 0.66 ? ":" : "."}</span>)}</p>
        </div>
      </div>
      {!alignment && <div className="bio-empty-state">Run the homolog alignment tool to calculate conservation and entropy.</div>}
    </section>
  );
}

function MutationWorkspace({
  state,
  selectedResidue,
  setSelectedResidue
}: {
  state: BioCraftState;
  selectedResidue?: number;
  setSelectedResidue: (position: number) => void;
}) {
  return (
    <section className="bio-mutation-workspace">
      <header><div><span>MUTATION COMPARISON</span><b>CALCULATED EVIDENCE</b></div><small>NO CLAIM OF EXPERIMENTAL STABILITY</small></header>
      <div className="mutation-table">
        <div className="table-head">
          <span>MUTATION</span><span>CONS.</span><span>BLOSUM62</span><span>CHARGE Δ</span><span>HYDROPATHY Δ</span><span>CONTEXT</span>
        </div>
        {state.biologicalAssets.candidateMutations.map((candidate) => {
          const invocation = mutationInvocation(state.toolHistory, candidate.mutation);
          const output = invocation?.output;
          const conservation = output?.conservation as { conservation?: number } | undefined;
          const overlaps = output?.annotationOverlaps as Array<{ label: string }> | undefined;
          return (
            <button
              className={selectedResidue === candidate.position ? "selected" : ""}
              onClick={() => setSelectedResidue(candidate.position)}
              key={candidate.mutation}
            >
              <b>{candidate.mutation}</b>
              <span>{conservation?.conservation === undefined ? "—" : `${(conservation.conservation * 100).toFixed(0)}%`}</span>
              <span>{String(output?.blosum62 ?? "—")}</span>
              <span>{String(output?.chargeChange ?? "—")}</span>
              <span>{String(output?.hydropathyChange ?? "—")}</span>
              <small>{overlaps?.map((item) => item.label).join(", ") || "No critical overlap returned"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SequenceMetrics({ invocation }: { invocation?: BioCraftToolInvocation }) {
  const output = invocation?.output;
  const metrics: Array<[string, unknown]> = [
    ["MASS", output?.molecularWeightDa ? `${output.molecularWeightDa} Da` : "—"],
    ["pI", output?.estimatedIsoelectricPoint ?? "—"],
    ["CHARGE pH7", output?.estimatedChargeAtPh7 ?? "—"],
    ["HYDROPATHY", output?.meanHydropathy ?? "—"]
  ];
  return (
    <div className="bio-metric-bank">
      {metrics.map(([label, value]) => <div key={label}><span>{label}</span><b>{String(value)}</b></div>)}
    </div>
  );
}

function ResidueFocus({
  state,
  selectedResidue
}: {
  state: BioCraftState;
  selectedResidue?: number;
}) {
  if (!selectedResidue) return <div className="residue-focus"><span>RESIDUE FOCUS</span><p>Select a residue.</p></div>;
  const reference = state.biologicalAssets.sequences.find((item) => item.kind === "reference")!;
  const annotations = state.biologicalAssets.annotations.filter(
    (item) => selectedResidue >= item.start && selectedResidue <= item.end
  );
  return (
    <div className="residue-focus">
      <span>RESIDUE FOCUS</span>
      <b>{reference.sequence[selectedResidue - 1]}{selectedResidue}</b>
      <p>{annotations.map((item) => item.label).join(" · ") || "No bundled annotation at this position."}</p>
    </div>
  );
}

function StructureEvidence({ invocation }: { invocation?: BioCraftToolInvocation }) {
  const output = invocation?.output;
  return (
    <div className="structure-evidence">
      <div><span>BACKEND</span><b>{invocation?.backend ?? "RCSB 1UBQ"}</b></div>
      <div><span>NEIGHBORS</span><b>{Array.isArray(output?.neighbors) ? output.neighbors.length : "—"}</b></div>
      <div><span>EXPOSURE</span><b>{String(output?.exposureApproximation ?? "—")}</b></div>
      <p>{String(output?.approximationNotice ?? "Run structure inspection to calculate a local neighborhood.")}</p>
    </div>
  );
}

function ActivityFeed({
  history,
  busy
}: {
  history: BioCraftToolInvocation[];
  busy: boolean;
}) {
  return (
    <div className="bio-activity-feed">
      {busy && <article className="running"><i /><div><b>TOOL REQUEST PENDING</b><span>Waiting for the local scientific result.</span></div></article>}
      {[...history].reverse().slice(0, 7).map((item) => (
        <article className={item.status} key={item.id}>
          <i />
          <div>
            <b>{item.tool.replace("biology.", "").replaceAll("_", " ").toUpperCase()}</b>
            <span>{item.outputSummary ?? item.error}</span>
            <small>{item.backend} · {item.durationMs.toFixed(2)}ms</small>
          </div>
        </article>
      ))}
      {!history.length && !busy && <p>Awaiting the first scientific action.</p>}
    </div>
  );
}

function EvaluationBoard({ state, run }: { state: BioCraftState; run: RunRecord }) {
  const evaluation = state.evaluation!;
  const metrics = [
    ["RANKING", evaluation.rankingScore, "40%"],
    ["RECOMMENDATION", evaluation.recommendationScore, "20%"],
    ["EVIDENCE", evaluation.evidenceGroundingScore, "15%"],
    ["COMPLIANCE", evaluation.constraintComplianceScore, "10%"],
    ["EFFICIENCY", evaluation.toolEfficiencyScore, "5%"],
    ["CONFIDENCE", evaluation.confidenceScore, "5%"],
    ["COMPLETENESS", evaluation.completenessScore, "5%"]
  ] as const;
  return (
    <section className="bio-evaluation-board">
      <header><span>DETERMINISTIC EVALUATION</span><b>GROUND TRUTH REVEALED</b></header>
      <div className="bio-score-hero">
        <span>OVERALL SCIENTIFIC SCORE</span>
        <strong>{(evaluation.overallScore * 100).toFixed(1)}</strong>
        <b>/ 100</b>
        <p>{evaluation.groundTruth.labelType}</p>
      </div>
      <div className="bio-score-breakdown">
        {metrics.map(([label, value, weight]) => (
          <article key={label}>
            <div><span>{label}</span><b>{weight}</b></div>
            <strong>{(value * 100).toFixed(0)}%</strong>
            <i><b style={{ width: `${value * 100}%` }} /></i>
          </article>
        ))}
      </div>
      <div className="bio-result-comparison">
        <article>
          <span>AGENT RANKING</span>
          <ol>{[...(state.submission?.rankedCandidates ?? [])].sort((a, b) => a.rank - b.rank).map((item) => <li key={item.mutation}>{item.mutation}</li>)}</ol>
        </article>
        <article>
          <span>BENCHMARK TARGET</span>
          <ol>{evaluation.groundTruth.rankedCandidates.map((mutation) => <li key={mutation}>{mutation}</li>)}</ol>
        </article>
        <article>
          <span>SCIENTIFIC LIMIT</span>
          <p>{evaluation.groundTruth.methodology}</p>
          <small>Run duration {formatDuration(durationMs(run))} · {state.budget.toolCallsUsed} tool calls</small>
        </article>
      </div>
      <div className="bio-result-actions">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>REVIEW WORKFLOW</button>
        <Link href="/environments/biocraft-v1">NEW ANALYSIS</Link>
        <button onClick={() => downloadRun(run)}>EXPORT RUN JSON</button>
      </div>
    </section>
  );
}

function alignmentConservation(history: BioCraftToolInvocation[]) {
  const invocation = latestTool(history, "biology.align_sequences");
  return (
    invocation?.output?.conservationProfile as
      | Array<{ position: number; conservation: number; entropy: number }>
      | undefined
  ) ?? [];
}

function latestTool(history: BioCraftToolInvocation[], type: string) {
  return [...history].reverse().find((item) => item.tool === type && item.status === "completed");
}

function mutationInvocation(history: BioCraftToolInvocation[], mutation: string) {
  return history.find(
    (item) =>
      item.tool === "biology.score_substitution" &&
      item.status === "completed" &&
      item.output?.mutation === mutation
  );
}

function rankHumanEvidence(state: BioCraftState) {
  return state.biologicalAssets.candidateMutations
    .map((candidate) => {
      const invocation = mutationInvocation(state.toolHistory, candidate.mutation);
      const overlapLabels = (
        invocation?.output?.annotationOverlaps as Array<{ label?: string }> | undefined
      )?.map((item) => item.label ?? "") ?? [];
      const penalty = overlapLabels.some((label) => label.includes("diglycine"))
        ? 10
        : overlapLabels.some((label) => label.includes("Lys48"))
          ? 5
          : overlapLabels.some((label) => label.includes("Ile44"))
            ? 2
            : overlapLabels.some((label) => label.includes("Beta"))
              ? 1
              : 0;
      const conservation = Number(
        (invocation?.output?.conservation as { conservation?: number } | undefined)
          ?.conservation ?? 0
      );
      return {
        mutation: candidate.mutation,
        penalty,
        score: Number(invocation?.output?.blosum62 ?? -10) * 2 + conservation * 3 - penalty
      };
    })
    .sort((left, right) => right.score - left.score || left.mutation.localeCompare(right.mutation));
}

function residueClass(residue: string) {
  if ("DE".includes(residue)) return "acidic";
  if ("KRH".includes(residue)) return "basic";
  if ("FWY".includes(residue)) return "aromatic";
  if ("STNQC".includes(residue)) return "polar";
  if ("GPA".includes(residue)) return "special";
  return "nonpolar";
}

function downloadRun(run: RunRecord) {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `arenaos-biocraft-${run.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
