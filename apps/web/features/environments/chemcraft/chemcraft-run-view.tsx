"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgentAction, ArenaEvent, RunRecord } from "@arena/contracts";
import type { StreamState } from "@/hooks/use-run-stream";
import { arenaApi } from "@/lib/arena-api";
import { durationMs, formatDuration, shortId } from "@/lib/format";
import type { ChemCraftMolecule, ChemCraftState } from "@/lib/types";
import { StatusChip } from "@/components/status-chip";
import { ChemCraftMoleculeViewer } from "./chemcraft-molecule-viewer";
import { buildChemCraftReplayFrames, isChemCraftState } from "./chemcraft-replay";
import { buildChemCraftTasks, type ChemCraftTask } from "./chemcraft-progress";

type ChemView = "3d" | "2d" | "descriptors" | "constraints";

export function ChemCraftRunView({
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
  const [view, setView] = useState<ChemView>("3d");
  const [selectedMoleculeId, setSelectedMoleculeId] = useState<string>();
  const [selectedAtom, setSelectedAtom] = useState<number>();
  const [replayIndex, setReplayIndex] = useState<number>();
  const [playing, setPlaying] = useState(false);
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
      buildChemCraftReplayFrames([
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
  const state = isChemCraftState(stateCandidate) ? stateCandidate : undefined;

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
    }, 760);
    return () => window.clearInterval(timer);
  }, [playing, replayFrames.length]);

  useEffect(() => {
    if (state?.workspace.selectedMoleculeId) {
      setSelectedMoleculeId((current) => current ?? state.workspace.selectedMoleculeId);
    }
    setBusy(false);
  }, [state?.toolHistory.length, state?.workspace.notes.length, state?.status]);

  if (!state) {
    return (
      <div className="chemcraft-run chem-boot-screen">
        <div className="chem-boot-orbit"><i /><i /><i /><b>RD</b></div>
        <span>LOCAL SCIENTIFIC RUNTIME</span>
        <h2>Preparing the RDKit molecular station</h2>
        <p>Sanitizing the challenge library, calculating reproducible geometry, and isolating the hidden evaluator.</p>
        <div className="chem-boot-steps"><b>CHALLENGE PACK</b><b>LOCAL WORKER</b><b>NO NETWORK</b></div>
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
  const selected =
    state.molecularAssets.molecules.find((molecule) => molecule.id === selectedMoleculeId) ??
    state.molecularAssets.molecules.find(
      (molecule) => molecule.id === state.molecularAssets.leadMoleculeId
    )!;
  const candidates = state.molecularAssets.molecules.filter(
    (molecule) => molecule.kind === "candidate"
  );
  const frameValue = Math.min(
    replayIndex ?? Math.max(0, replayFrames.length - 1),
    Math.max(0, replayFrames.length - 1)
  );
  const tasks = buildChemCraftTasks(state);
  const progressPercent = Math.round(
    (tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) * 100
  );
  const latestAction = ([...events]
    .reverse()
    .find((event) => event.type === "agent.action_generated")?.payload as
      | { action?: { type?: string } }
      | undefined)?.action;
  const currentTool = state.submission
    ? "chemistry.submit"
    : !isTerminal && latestAction?.type?.startsWith("chemistry.")
      ? latestAction.type
      : state.toolHistory.at(-1)?.tool ?? "chemistry.inspect_molecule";

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
      metadata: { declaredPlan: summary, source: "chemcraft-human-workbench" }
    };
    try {
      await arenaApi.submitAction(run.id, humanParticipant.id, action);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  function submitCurrentRanking() {
    const evidenceIds = state!.toolHistory
      .filter((invocation) => invocation.status === "completed")
      .map((invocation) => invocation.id);
    const ranked = [...candidates].sort(
      (left, right) =>
        candidateUtility(right) - candidateUtility(left) ||
        left.id.localeCompare(right.id)
    );
    void send(
      "chemistry.submit",
      {
        rankedCandidates: ranked.map((candidate, index) => ({
          moleculeId: candidate.id,
          rank: index + 1,
          confidence: candidate.validation?.passed ? 0.75 : 0.95,
          evidenceIds,
          justification: candidate.validation?.passed
            ? "The local descriptor, similarity, and validation outputs support this position under the declared benchmark objective."
            : "One or more independently calculated hard constraints failed."
        })),
        recommendedMoleculeId: ranked[0]?.id,
        overallConfidence: 0.75,
        constraintAssessment: uniqueChecks(candidates).map(([constraintId, satisfied]) => ({
          constraintId,
          satisfied,
          evidenceIds
        })),
        limitations: [
          "Calculated descriptors are not experimental measurements.",
          "Fingerprint similarity does not imply equivalent activity.",
          "Force-field conformers are model-dependent estimates."
        ],
        summary:
          "Evidence-linked ranking for the offline RDKit molecular-optimization benchmark."
      },
      "Submit the current evidence-linked molecular ranking."
    );
  }

  return (
    <div className="chemcraft-run">
      <header className="chem-run-header">
        <div><Link href="/environments/chemcraft-v1">← CHEMCRAFT</Link><span>/</span><b>{shortId(run.id)}</b></div>
        <div className="chem-run-title"><span>CONSTRAINED MOLECULAR OPTIMIZATION</span><b>{state.challengeTitle}</b></div>
        <div>
          <span className={`connection-state ${connection}`}><i />{connection}</span>
          <StatusChip status={displayStatus} />
          <button
            className={`chem-run-control ${isTerminal ? "complete" : "active"}`}
            onClick={() => void rerunExperiment()}
            disabled={rerunning}
          >
            <i />
            {rerunning ? "STARTING…" : isTerminal ? "↻ RERUN" : `${state.status.toUpperCase()} / SYNC`}
          </button>
        </div>
      </header>

      {(error || actionError) && (
        <div className="stream-warning">WORKER LINK / {actionError ?? error}</div>
      )}

      <section className="chem-status-strip">
        <div><span>RDKIT</span><b>{state.reproducibility.rdkitVersion}</b></div>
        <div><span>PYTHON</span><b>{state.reproducibility.pythonVersion}</b></div>
        <div><span>TOOL CALLS</span><b>{state.budget.toolCallsUsed} / {state.budget.maxToolCalls}</b></div>
        <div><span>COMPUTE</span><b>{state.budget.computeUnitsUsed} / {state.budget.maxComputeUnits}</b></div>
        <div><span>NETWORK</span><b className="safe">DISABLED</b></div>
        <div><span>SCORE</span><b>{state.evaluation ? `${(state.evaluation.overallScore * 100).toFixed(1)}%` : "PENDING"}</b></div>
      </section>

      <ChemToolTelemetry
        currentTool={currentTool}
        state={state}
        agentId={humanParticipant ? "human-chemist" : run.config.agentId}
        isTerminal={isTerminal}
        isReplay={replayIndex !== undefined}
      />

      <ChemTaskProgress
        tasks={tasks}
        progressPercent={progressPercent}
        isReplay={replayIndex !== undefined}
      />

      {isHumanTurn && (
        <section className="chem-human-controls">
          <header><span>HUMAN TOOL CONSOLE</span><b>{busy ? "RUNNING…" : "READY"}</b></header>
          <div>
            <button disabled={busy || completedTool(state, "chemistry.inspect_molecule")} onClick={() => void send("chemistry.inspect_molecule", { moleculeId: selected.id }, `Inspect ${selected.id}.`)}>{completedTool(state, "chemistry.inspect_molecule") ? "✓ INSPECTED" : "INSPECT"}</button>
            <button disabled={busy || completedTool(state, "chemistry.calculate_descriptors")} onClick={() => void send("chemistry.calculate_descriptors", { moleculeIds: [state.molecularAssets.leadMoleculeId, ...candidates.map((item) => item.id)] }, "Calculate descriptors for the local library.")}>{completedTool(state, "chemistry.calculate_descriptors") ? "✓ DESCRIPTORS" : "DESCRIPTORS"}</button>
            <button disabled={busy || completedTool(state, "chemistry.inspect_functional_groups")} onClick={() => void send("chemistry.inspect_functional_groups", { moleculeId: selected.id, groupSet: "chemcraft-functional-groups-v1" }, `Inspect functional groups for ${selected.id}.`)}>{completedTool(state, "chemistry.inspect_functional_groups") ? "✓ GROUPS" : "GROUPS"}</button>
            <button disabled={busy || completedTool(state, "chemistry.calculate_similarity")} onClick={() => void send("chemistry.calculate_similarity", { referenceMoleculeId: state.molecularAssets.leadMoleculeId, candidateMoleculeIds: candidates.map((item) => item.id), fingerprint: "morgan", metric: "tanimoto" }, "Calculate Morgan/Tanimoto similarity.")}>{completedTool(state, "chemistry.calculate_similarity") ? "✓ SIMILARITY" : "SIMILARITY"}</button>
            <button disabled={busy || completedTool(state, "chemistry.validate_molecule")} onClick={() => void send("chemistry.validate_molecule", { moleculeIds: candidates.map((item) => item.id) }, "Validate every hard molecular constraint.")}>{completedTool(state, "chemistry.validate_molecule") ? "✓ VALIDATED" : "VALIDATE"}</button>
            <button disabled={busy || completedTool(state, "chemistry.generate_conformers")} onClick={() => void send("chemistry.generate_conformers", { moleculeId: selected.id, count: 1, method: "ETKDG", optimization: "MMFF", seed: 1701 }, `Generate a seeded conformer for ${selected.id}.`)}>{completedTool(state, "chemistry.generate_conformers") ? "✓ 3D READY" : "3D CONFORMER"}</button>
            <button disabled={busy || state.workspace.notes.length > 0} onClick={() => void send("chemistry.write_note", { category: "observation", content: `${selected.name} reviewed in the human molecular workbench.`, moleculeIds: [selected.id], evidenceIds: state.toolHistory.map((item) => item.id) }, "Record a public evidence note.")}>{state.workspace.notes.length ? "✓ NOTE SAVED" : "ADD NOTE"}</button>
            <button className="submit" disabled={busy || state.toolHistory.length < 3 || Boolean(state.submission)} onClick={submitCurrentRanking}>{state.submission ? "✓ SUBMITTED" : "SUBMIT RANKING"}</button>
          </div>
        </section>
      )}

      {humanParticipant && replayIndex !== undefined && (
        <div className="chem-replay-notice">
          <span>REPLAY IS READ-ONLY</span>
          <p>Return to Live to continue operating the molecular workbench.</p>
          <button onClick={() => { setReplayIndex(undefined); setPlaying(false); }}>RETURN TO LIVE</button>
        </div>
      )}

      <section className="chem-workbench">
        <aside className="chem-inventory">
          <header><span>MOLECULAR INVENTORY</span><b>{state.molecularAssets.molecules.length}</b></header>
          <div className="chem-objective"><span>OBJECTIVE</span><p>{state.objective}</p></div>
          <div className="chem-molecule-list">
            {state.molecularAssets.molecules.map((molecule) => (
              <button
                className={selected.id === molecule.id ? "active" : ""}
                onClick={() => {
                  setSelectedMoleculeId(molecule.id);
                  setSelectedAtom(undefined);
                }}
                key={molecule.id}
              >
                <i>{molecule.kind === "lead" ? "LD" : "C"}</i>
                <span><b>{molecule.name}</b><small>{molecule.descriptors?.formula ?? molecule.canonicalSmiles}</small></span>
                <em className={molecule.validation ? (molecule.validation.passed ? "pass" : "fail") : ""}>
                  {molecule.validation ? (molecule.validation.passed ? "PASS" : "FAIL") : "—"}
                </em>
              </button>
            ))}
          </div>
          <div className="chem-budget">
            <span>COMPUTE BUDGET</span>
            <div><i style={{ width: `${(state.budget.computeUnitsUsed / state.budget.maxComputeUnits) * 100}%` }} /></div>
            <b>{state.budget.maxComputeUnits - state.budget.computeUnitsUsed} units remaining</b>
          </div>
        </aside>

        <main className="chem-central">
          <header>
            <div><span>ACTIVE MOLECULE</span><b>{selected.name}</b></div>
            <nav>
              {(["3d", "2d", "descriptors", "constraints"] as const).map((item) => (
                <button className={view === item ? "active" : ""} onClick={() => setView(item)} key={item}>{item.toUpperCase()}</button>
              ))}
            </nav>
          </header>
          <div className="chem-main-stage">
            {view === "3d" && (
              <ChemCraftMoleculeViewer
                molecule={selected}
                selectedAtom={selectedAtom}
                onSelectAtom={setSelectedAtom}
              />
            )}
            {view === "2d" && (
              <div className="chem-2d-view">
                {selected.depictionSvg ? (
                  <div dangerouslySetInnerHTML={{ __html: selected.depictionSvg }} />
                ) : (
                  <div><span>NO DEPICTION ARTIFACT</span><p>Invoke INSPECT to generate a genuine local RDKit SVG.</p></div>
                )}
                <code>{selected.canonicalSmiles}</code>
              </div>
            )}
            {view === "descriptors" && <DescriptorBoard molecule={selected} />}
            {view === "constraints" && <ConstraintBoard molecule={selected} state={state} />}
          </div>
          <footer className="chem-model-notice">
            <span>{selected.conformer ? `${selected.conformer.forceFieldEnergy} ${selected.conformer.energyUnits}` : "NO ENERGY"}</span>
            <p>{selected.conformer?.limitation ?? "3D coordinates appear only after a local conformer calculation."}</p>
          </footer>
        </main>

        <aside className="chem-activity">
          <header><span>AGENT ACTIVITY</span><b>{run.config.agentId}</b></header>
          <div className="chem-tool-feed">
            {state.toolHistory.length === 0 && <p>Waiting for the first scientific action…</p>}
            {[...state.toolHistory].reverse().map((invocation) => (
              <article className={invocation.status} key={invocation.id}>
                <div><span>STEP {invocation.step}</span><b>{invocation.computeUnits} CU</b></div>
                <strong>{invocation.tool.replace("chemistry.", "")}</strong>
                <p>{invocation.outputSummary ?? invocation.error}</p>
                <small>{invocation.backend} {invocation.backendVersion} · {invocation.durationMs.toFixed(1)} ms</small>
              </article>
            ))}
          </div>
          <div className="chem-notebook">
            <span>EVIDENCE NOTEBOOK</span>
            {state.workspace.notes.map((note) => (
              <article key={note.id}><b>{note.category}</b><p>{note.content}</p><small>{note.evidenceIds.length} citations</small></article>
            ))}
            {!state.workspace.notes.length && <p>No public notes recorded.</p>}
          </div>
          <div className="chem-artifacts">
            <span>ARTIFACTS</span>
            {state.artifacts.map((artifact) => (
              <a href={artifact.uri} download={artifact.name} key={artifact.id}><b>{artifact.name}</b><small>{artifact.mediaType}</small></a>
            ))}
          </div>
        </aside>
      </section>

      <section className="chem-replay">
        <div>
          <span>EVENT TIMELINE / {replayIndex === undefined ? "LIVE" : `FRAME ${replayIndex + 1}`}</span>
          <b>{replayFrames.length} scientific states</b>
        </div>
        <button aria-label="Opening state" onClick={() => { setReplayIndex(0); setPlaying(false); }} disabled={!replayFrames.length}>|◀</button>
        <button aria-label="Previous replay state" onClick={() => setReplayIndex((current) => Math.max(0, (current ?? replayFrames.length - 1) - 1))} disabled={!replayFrames.length}>◀</button>
        <button aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => { setReplayIndex((current) => current ?? 0); setPlaying((current) => !current); }} disabled={replayFrames.length < 2}>{playing ? "Ⅱ" : "▶"}</button>
        <button aria-label="Next replay state" onClick={() => setReplayIndex((current) => Math.min(replayFrames.length - 1, (current ?? -1) + 1))} disabled={!replayFrames.length}>▶</button>
        <button aria-label="Final replay state" onClick={() => { setReplayIndex(replayFrames.length - 1); setPlaying(false); }} disabled={!replayFrames.length}>▶|</button>
        <button aria-label="Return to live state" className={replayIndex === undefined ? "active" : ""} onClick={() => { setReplayIndex(undefined); setPlaying(false); }}>LIVE</button>
        <input
          aria-label="ChemCraft replay frame"
          type="range"
          min="0"
          max={Math.max(0, replayFrames.length - 1)}
          value={frameValue}
          onChange={(event) => { setReplayIndex(Number(event.target.value)); setPlaying(false); }}
          disabled={!replayFrames.length}
        />
        <div><span>RUN TIME</span><b>{formatDuration(durationMs(run))}</b></div>
      </section>

      {state.evaluation && <ChemEvaluation state={state} />}

      <section className="chem-event-log">
        <header><span>CHEMCRAFT EVENT STREAM</span><b>REPLAY SOURCE OF TRUTH</b></header>
        <div>
          {events.filter((event) => event.type.startsWith("chemcraft.")).map((event) => (
            <article key={event.id}><span>{event.step ?? "—"}</span><b>{event.type.replace("chemcraft.", "")}</b><small>{new Date(event.timestamp).toLocaleTimeString()}</small></article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChemToolTelemetry({
  currentTool,
  state,
  agentId,
  isTerminal,
  isReplay
}: {
  currentTool: string;
  state: ChemCraftState;
  agentId: string;
  isTerminal: boolean;
  isReplay: boolean;
}) {
  const completed = new Set(
    state.toolHistory.filter((item) => item.status === "completed").map((item) => item.tool)
  );
  const failed = new Set(
    state.toolHistory.filter((item) => item.status === "failed").map((item) => item.tool)
  );
  return (
    <section className="chem-tool-telemetry">
      <div className="chem-tool-focus">
        <span>{isReplay ? "REPLAYED TOOL STATE" : isTerminal ? "FINAL SCIENTIFIC ACTION" : "AGENT TOOL IN USE"}</span>
        <strong>{currentTool.replace("chemistry.", "")}</strong>
        <small>{agentId} · local deterministic RDKit backend</small>
      </div>
      <div className="chem-tool-map">
        {state.availableTools.map((tool) => {
          const isCompleted =
            completed.has(tool) ||
            (tool === "chemistry.write_note" && state.workspace.notes.length > 0) ||
            (tool === "chemistry.submit" && Boolean(state.submission));
          const status = failed.has(tool) ? "failed" : isCompleted ? "completed" : tool === currentTool ? "active" : "queued";
          return <div className={status} key={tool}><i /><span>{tool.replace("chemistry.", "")}</span><b>{status}</b></div>;
        })}
      </div>
      <div className="chem-unavailable-tools">
        <span>OPTIONAL BACKENDS</span>
        {state.unavailableTools.map((tool) => <div title={tool.reason} key={tool.id}><i />{tool.id}<b>UNAVAILABLE</b></div>)}
      </div>
    </section>
  );
}

function ChemTaskProgress({
  tasks,
  progressPercent,
  isReplay
}: {
  tasks: ChemCraftTask[];
  progressPercent: number;
  isReplay: boolean;
}) {
  return (
    <section className="chem-task-progress">
      <header>
        <div><span>MOLECULAR RESEARCH PLAN</span><b>{isReplay ? "REPLAY SNAPSHOT" : "LIVE PROGRESSION"}</b></div>
        <strong>{progressPercent}%</strong>
        <i><em style={{ width: `${progressPercent}%` }} /></i>
      </header>
      <div className="chem-task-grid">
        {tasks.map((task, index) => (
          <article className={task.status} key={task.id}>
            <div><TaskIcon icon={task.icon} /><span>{String(index + 1).padStart(2, "0")}</span></div>
            <b>{task.label}</b>
            <small>{task.detail}</small>
            <i><em style={{ width: `${task.progress * 100}%` }} /></i>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskIcon({ icon }: { icon: ChemCraftTask["icon"] }) {
  const paths: Record<ChemCraftTask["icon"], React.ReactNode> = {
    molecule: <><circle cx="8" cy="12" r="3"/><circle cx="18" cy="7" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m10.5 10.5 5-2.3m-5 5.4 5.2 3"/></>,
    measure: <><path d="M5 20V8m7 12V4m7 16v-9"/><path d="M3 20h18"/></>,
    groups: <><circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m8 8.5 3 7m5-7-3 7M8.5 7h7"/></>,
    compare: <><path d="M4 7h14l-3-3m3 3-3 3M20 17H6l3 3m-3-3 3-3"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
    cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
    note: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h6m-6 4h6"/></>,
    report: <><path d="M4 20h16M6 17l4-4 3 2 5-7"/><circle cx="18" cy="8" r="2"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[icon]}</svg>;
}

function DescriptorBoard({ molecule }: { molecule: ChemCraftMolecule }) {
  const descriptors = molecule.descriptors;
  if (!descriptors) return <div className="chem-empty-board"><span>DESCRIPTORS UNCALCULATED</span><p>Invoke the RDKit descriptor instrument.</p></div>;
  const rows: Array<[string, string | number, string]> = [
    ["Formula", descriptors.formula, "exact graph-derived"],
    ["Molecular weight", descriptors.molecularWeight, "g/mol · calculated"],
    ["RDKit LogP", descriptors.calculatedLogP, "heuristic · not experimental"],
    ["TPSA", descriptors.tpsa, "Å² · calculated"],
    ["H-bond donors", descriptors.hydrogenBondDonors, "count"],
    ["H-bond acceptors", descriptors.hydrogenBondAcceptors, "count"],
    ["Rotatable bonds", descriptors.rotatableBondCount, "count"],
    ["Fraction sp3", descriptors.fractionSp3, "calculated"],
    ["Similarity to lead", molecule.similarityToLead ?? "—", "Morgan / Tanimoto"]
  ];
  return <div className="chem-descriptor-board">{rows.map(([label, value, note]) => <div key={label}><span>{label}</span><b>{value}</b><small>{note}</small></div>)}</div>;
}

function ConstraintBoard({
  molecule,
  state
}: {
  molecule: ChemCraftMolecule;
  state: ChemCraftState;
}) {
  return (
    <div className="chem-constraint-board">
      <header><span>HARD CONSTRAINTS</span><b>{molecule.validation ? (molecule.validation.passed ? "VALID" : "REJECTED") : "UNCHECKED"}</b></header>
      {(molecule.validation?.checks ?? []).map((check) => (
        <div className={check.passed ? "pass" : "fail"} key={check.id}><i /> <span>{check.id}</span><b>{check.passed ? "PASS" : "FAIL"}</b><small>{formatObserved(check.observed)}</small></div>
      ))}
      {!molecule.validation && <p>Invoke VALIDATE to independently check sanitization, elements, charge, fragments, SMARTS, descriptors, and similarity.</p>}
      <footer>Similarity threshold ≥ {state.constraints.minimumSimilarityToLead.threshold} / Morgan radius 2</footer>
    </div>
  );
}

function ChemEvaluation({ state }: { state: ChemCraftState }) {
  const evaluation = state.evaluation!;
  return (
    <section className="chem-evaluation">
      <header><div><span>DETERMINISTIC EVALUATION</span><h2>{(evaluation.overallScore * 100).toFixed(1)}%</h2></div><p>{evaluation.groundTruth.methodology}</p></header>
      <div className="chem-score-grid">
        {[
          ["Candidate quality", evaluation.candidateQualityScore],
          ["Ranking accuracy", evaluation.rankingScore],
          ["Constraints", evaluation.constraintSatisfactionScore],
          ["Evidence grounding", evaluation.evidenceGroundingScore],
          ["Tool efficiency", evaluation.toolEfficiencyScore],
          ["Confidence", evaluation.confidenceScore],
          ["Completeness", evaluation.completenessScore]
        ].map(([label, score]) => <article key={String(label)}><span>{label}</span><b>{(Number(score) * 100).toFixed(0)}%</b><i><em style={{ width: `${Number(score) * 100}%` }} /></i></article>)}
      </div>
      <div className="chem-ranking-compare">
        <article><span>SUBMITTED RANKING</span><ol>{[...(state.submission?.rankedCandidates ?? [])].sort((a, b) => a.rank - b.rank).map((item) => <li key={item.moleculeId}>{item.moleculeId}</li>)}</ol></article>
        <article><span>INDEPENDENT RDKIT RANKING</span><ol>{evaluation.groundTruth.ranking.map((id) => <li key={id}>{id}<b>{evaluation.candidateUtilities[id]?.toFixed(3)}</b></li>)}</ol></article>
      </div>
    </section>
  );
}

function candidateUtility(candidate: ChemCraftMolecule): number {
  if (!candidate.validation?.passed || !candidate.descriptors || candidate.similarityToLead === undefined) return 0;
  const descriptor = candidate.descriptors;
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return (
    0.3 * candidate.similarityToLead +
    0.2 * clamp((235 - descriptor.molecularWeight) / 60) +
    0.2 * clamp((2.5 - descriptor.calculatedLogP) / 2) +
    0.15 * clamp(1 - Math.abs(descriptor.tpsa - 32) / 17) +
    0.1 * clamp((descriptor.fractionSp3 - 0.1) / 0.4) +
    0.05 * clamp((6 - descriptor.rotatableBondCount) / 5)
  );
}

function uniqueChecks(candidates: ChemCraftMolecule[]): Array<[string, boolean]> {
  const checks = new Map<string, boolean>();
  for (const candidate of candidates) {
    for (const check of candidate.validation?.checks ?? []) {
      checks.set(check.id, (checks.get(check.id) ?? true) && check.passed);
    }
  }
  return [...checks];
}

function formatObserved(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value ?? "—");
}

function completedTool(state: ChemCraftState, tool: string): boolean {
  return state.toolHistory.some(
    (invocation) => invocation.tool === tool && invocation.status === "completed"
  );
}
