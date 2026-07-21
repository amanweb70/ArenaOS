"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { arenaApi, getEnvironmentBuildSocketUrl } from "@/lib/arena-api";
import type {
  EnvironmentBuildArtifact,
  EnvironmentBuildRecord,
  GeneratedEnvironmentPreview
} from "@/lib/types";

const stages = [
  ["created", "Brief accepted"], ["generating", "Codex building"],
  ["validating", "ArenaOS validation"], ["awaiting_approval", "Review preview"],
  ["approved", "Registered"]
] as const;

export function EnvironmentBuilder() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["environment-builder-status"], queryFn: arenaApi.environmentBuilderStatus });
  const history = useQuery({ queryKey: ["environment-builds"], queryFn: arenaApi.environmentBuilds });
  const [build, setBuild] = useState<EnvironmentBuildRecord>();
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("Interactive reasoning");
  const [visualStyle, setVisualStyle] = useState("Dark editorial world with a vivid green accent");
  const [mechanics, setMechanics] = useState("Navigate from start to goal while avoiding obstacles");
  const [agents, setAgents] = useState("One agent chooses move or wait each turn");
  const [scoring, setScoring] = useState("Reward completion, penalize collisions, prefer efficient paths");
  const [refinement, setRefinement] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [artifacts, setArtifacts] = useState<EnvironmentBuildArtifact[]>([]);
  const [selectedFile, setSelectedFile] = useState("environment.json");
  const [preview, setPreview] = useState<GeneratedEnvironmentPreview>();

  const selectedArtifact = artifacts.find((artifact) => artifact.path === selectedFile) ?? artifacts[0];
  const activeStage = useMemo(() => {
    if (!build) return -1;
    return stages.findIndex(([value]) => value === build.status);
  }, [build]);

  useEffect(() => {
    if (!build?.id || ["approved", "cancelled"].includes(build.status)) return;
    const socket = new WebSocket(getEnvironmentBuildSocketUrl(build.id));
    socket.onmessage = () => {
      void arenaApi.environmentBuild(build.id).then((next) => setBuild(next));
    };
    return () => socket.close();
  }, [build?.id, build?.status]);

  useEffect(() => {
    if (!build || !["awaiting_approval", "approved"].includes(build.status)) return;
    void Promise.all([
      arenaApi.environmentBuildArtifacts(build.id),
      arenaApi.environmentBuildPreview(build.id)
    ]).then(([nextArtifacts, nextPreview]) => {
      setArtifacts(nextArtifacts);
      setPreview(nextPreview);
      if (!nextArtifacts.some((artifact) => artifact.path === selectedFile)) setSelectedFile(nextArtifacts[0]?.path ?? "");
    }).catch((reason) => setError(errorMessage(reason)));
  }, [build?.id, build?.status]);

  async function createBuild() {
    setWorking(true); setError(undefined); setArtifacts([]); setPreview(undefined);
    try {
      const next = await arenaApi.createEnvironmentBuild({ prompt, category, visualStyle, mechanics, agents, scoring });
      setBuild(next);
      await queryClient.invalidateQueries({ queryKey: ["environment-builds"] });
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setWorking(false); }
  }

  async function refineBuild() {
    if (!build || !refinement.trim()) return;
    setWorking(true); setError(undefined);
    try {
      setBuild(await arenaApi.refineEnvironmentBuild(build.id, refinement));
      setRefinement(""); setArtifacts([]); setPreview(undefined);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setWorking(false); }
  }

  async function approveBuild() {
    if (!build) return;
    setWorking(true); setError(undefined);
    try {
      setBuild(await arenaApi.approveEnvironmentBuild(build.id));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["environments"] }),
        queryClient.invalidateQueries({ queryKey: ["environment-builds"] })
      ]);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setWorking(false); }
  }

  async function cancelBuild() {
    if (!build) return;
    setBuild(await arenaApi.cancelEnvironmentBuild(build.id));
  }

  return (
    <div className="env-builder">
      <div className="env-builder-status">
        <div className={status.data?.configured ? "ready" : "offline"}><i /> CODEX {status.data?.configured ? "READY" : "KEY REQUIRED"}</div>
        <span>{status.data?.model ?? "Checking model…"}</span>
        <span>SERVER-SIDE KEY</span>
        <span>NETWORK OFF IN BUILD WORKSPACE</span>
      </div>

      {!status.data?.configured && (
        <div className="env-builder-key-notice">
          <KeyIcon />
          <div><b>Connect Codex to start building</b><p>Add <code>OPENAI_API_KEY</code> to <code>.env.local</code>, then restart <code>pnpm dev</code>. The key never enters Next.js or generated workspaces.</p></div>
        </div>
      )}

      <div className="env-builder-layout">
        <section className="env-builder-brief">
          <header><div><span>01 / CREATIVE BRIEF</span><h2>Describe the world.</h2></div><SparkIcon /></header>
          <label className="env-builder-prompt">
            Environment idea
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={6000} placeholder="Build a museum-heist world where an agent must collect three artifacts, avoid laser corridors, and reach the extraction tile…" />
            <small>{prompt.length} / 6,000</small>
          </label>
          <div className="env-builder-fields">
            <BuilderField label="CATEGORY" value={category} onChange={setCategory} />
            <BuilderField label="VISUAL STYLE" value={visualStyle} onChange={setVisualStyle} />
            <BuilderField label="CORE MECHANICS" value={mechanics} onChange={setMechanics} />
            <BuilderField label="AGENT BEHAVIOR" value={agents} onChange={setAgents} />
            <BuilderField label="SCORING" value={scoring} onChange={setScoring} wide />
          </div>
          {error && <p className="env-builder-error">{error}</p>}
          <button className="env-builder-primary" onClick={createBuild} disabled={working || !status.data?.configured || prompt.trim().length < 12}>
            <SparkIcon /> {working ? "CREATING WORKSPACE…" : "BUILD WITH CODEX"}<span>→</span>
          </button>
          <p className="env-builder-safety"><ShieldIcon /> Nothing reaches the ArenaOS registry until every validation gate passes and you approve it.</p>
        </section>

        <aside className="env-builder-history">
          <header><span>RECENT BUILDS</span><b>{history.data?.length ?? 0}</b></header>
          <div>
            {history.data?.slice(0, 6).map((item) => (
              <button key={item.id} className={item.id === build?.id ? "active" : ""} onClick={() => setBuild(item)}>
                <i className={item.status} />
                <span><b>{item.environmentId ?? item.request.prompt.slice(0, 36)}</b><small>{item.status.replaceAll("_", " ")}</small></span>
                <em>↗</em>
              </button>
            ))}
            {!history.data?.length && <p>No builds yet. Your generated environments will stay here across restarts.</p>}
          </div>
        </aside>
      </div>

      {build && (
        <section className="env-builder-workspace">
          <header>
            <div><span>BUILD / {build.id.slice(0, 8)}</span><h2>{build.environmentId ?? "Codex environment workshop"}</h2></div>
            <div className={`env-build-state ${build.status}`}><i />{build.status.replaceAll("_", " ")}</div>
          </header>
          <div className="env-builder-stages">
            {stages.map(([value, label], index) => <div key={value} className={index < activeStage || build.status === "approved" ? "done" : index === activeStage ? "active" : ""}><i>{index < activeStage || build.status === "approved" ? "✓" : index + 1}</i><span>{label}</span></div>)}
          </div>

          <div className="env-builder-console-grid">
            <article className="env-builder-timeline">
              <header><span>LIVE BUILD ACTIVITY</span><b>{build.events.length} EVENTS</b></header>
              <div>
                {build.events.slice().reverse().map((event) => <div key={event.id}><i /><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><p><b>{event.type.replace("environment_build.", "").replaceAll("_", " ")}</b>{event.message}</p></div>)}
              </div>
            </article>
            <article className="env-builder-validation">
              <header><span>VALIDATION GATES</span><b>{build.validation.filter((item) => item.status === "passed").length}/{build.validation.length || 6}</b></header>
              <div>
                {build.validation.length ? build.validation.map((check) => <div key={check.id} className={check.status}><i>{check.status === "passed" ? "✓" : "!"}</i><p><b>{check.label}</b><small>{check.detail}</small></p></div>) : ["Package structure", "Manifest schema", "Reachable world", "Dependencies", "Lifecycle", "Deterministic replay"].map((label) => <div key={label}><i>·</i><p><b>{label}</b><small>Waiting for Codex output</small></p></div>)}
              </div>
            </article>
          </div>

          {preview && <BuildPreview preview={preview} />}

          {!!artifacts.length && (
            <div className="env-builder-artifacts">
              <aside><span>GENERATED PACKAGE</span>{artifacts.map((artifact) => <button key={artifact.path} className={artifact.path === selectedArtifact?.path ? "active" : ""} onClick={() => setSelectedFile(artifact.path)}><FileIcon />{artifact.path}</button>)}</aside>
              <section><header><span>{selectedArtifact?.path}</span><b>READ-ONLY REVIEW</b></header><pre>{selectedArtifact?.content}</pre></section>
            </div>
          )}

          {build.status === "awaiting_approval" && (
            <div className="env-builder-review">
              <div><span>REFINE WITH THE SAME CODEX THREAD</span><textarea value={refinement} onChange={(event) => setRefinement(event.target.value)} placeholder="Make the obstacle pattern more strategic and shift the visual direction toward a moonlit archive…" /></div>
              <button onClick={refineBuild} disabled={working || !refinement.trim()}>SEND REFINEMENT</button>
              <button className="approve" onClick={approveBuild} disabled={working}>APPROVE & REGISTER <span>→</span></button>
            </div>
          )}
          {["created", "generating", "validating"].includes(build.status) && <button className="env-builder-cancel" onClick={cancelBuild}>CANCEL BUILD</button>}
          {build.status === "approved" && <div className="env-builder-success"><i>✓</i><div><b>Environment registered</b><p>It is now discoverable through <code>GET /api/environments</code> and ready for real ArenaOS runs.</p></div><Link href={`/environments/${build.environmentId}`}>OPEN ENVIRONMENT →</Link></div>}
          {build.status === "failed" && <div className="env-builder-failure"><b>BUILD STOPPED</b><p>{build.error}</p><small>The production registry was not changed.</small></div>}
        </section>
      )}
    </div>
  );
}

function BuilderField({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return <label className={wide ? "wide" : ""}>{label}<input value={value} onChange={(event) => onChange(event.target.value)} maxLength={500} /></label>;
}

function BuildPreview({ preview }: { preview: GeneratedEnvironmentPreview }) {
  const blocked = new Set(preview.state.obstacles.map((item) => `${item.x},${item.y}`));
  return <div className="env-builder-preview" style={{ "--build-accent": preview.manifest.visual.accent, "--build-bg": preview.manifest.visual.background } as React.CSSProperties}>
    <section><span>VALIDATED LIVE PREVIEW</span><h3>{preview.manifest.name}</h3><p>{preview.manifest.description}</p><div className="tag-row">{preview.manifest.tags.map((tag) => <b key={tag}>{tag}</b>)}</div><small>{preview.manifest.instructions}</small></section>
    <div className="env-preview-grid" style={{ gridTemplateColumns: `repeat(${preview.state.width}, 1fr)` }}>
      {Array.from({ length: preview.state.width * preview.state.height }, (_, index) => { const x = index % preview.state.width; const y = Math.floor(index / preview.state.width); const key = `${x},${y}`; const isAgent = x === preview.state.agent.x && y === preview.state.agent.y; const isGoal = x === preview.state.goal.x && y === preview.state.goal.y; return <i key={key} className={blocked.has(key) ? "blocked" : isAgent ? "agent" : isGoal ? "goal" : ""}>{isAgent ? preview.manifest.visual.agentGlyph : isGoal ? preview.manifest.visual.goalGlyph : ""}</i>; })}
    </div>
    <aside><div><span>WORLD</span><b>{preview.state.width} × {preview.state.height}</b></div><div><span>STEP BUDGET</span><b>{preview.state.maxSteps}</b></div><div><span>ACTION SPACE</span><b>MOVE / WAIT</b></div><div><span>REPLAY</span><b>DETERMINISTIC</b></div></aside>
  </div>;
}

function errorMessage(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason); }
function SparkIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></svg>; }
function KeyIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4"/><path d="M12 12h9m-3 0v3m-3-3v2"/></svg>; }
function FileIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5"/></svg>; }
