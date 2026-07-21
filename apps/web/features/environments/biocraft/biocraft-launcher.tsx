"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { arenaApi } from "@/lib/arena-api";
import { AgentPicker } from "@/components/agent-picker";

type Mode = "agent" | "human";

export function BioCraftLauncher() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("agent");
  const [agentId, setAgentId] = useState("biocraft-researcher");
  const [toolBudget, setToolBudget] = useState(12);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  async function launch() {
    setStarting(true);
    setError(undefined);
    try {
      const response = await arenaApi.startRun({
        name:
          mode === "agent"
            ? "BioCraft / deterministic research baseline"
            : "BioCraft / human research session",
        environmentId: "biocraft-v1",
        agentId,
        participants:
          mode === "human"
            ? [
                {
                  id: "primary",
                  kind: "human",
                  displayName: "Human Researcher",
                  role: "primary"
                }
              ]
            : undefined,
        evaluatorIds: ["biocraft-scientific-score"],
        seed: 7,
        scenario: {
          id: "ubiquitin-preservation-001",
          name: "Ubiquitin Functional Preservation",
          environmentId: "biocraft-v1",
          parameters: {
            maxToolCalls: toolBudget,
            presentationDelayMs: mode === "agent" ? 420 : 0
          }
        },
        episodeLimits: {
          maxSteps: 18,
          maxDurationMs: 15 * 60_000,
          maxToolCalls: toolBudget,
          maxTokens: 100_000,
          maxCostUsd: 5
        }
      });
      router.push(`/runs/${response.runId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStarting(false);
    }
  }

  return (
    <div className="biocraft-launcher">
      <header>
        <span>EXPERIMENT COMMISSION</span>
        <b>OFFLINE / REPRODUCIBLE</b>
      </header>
      <div className="bio-mode-switch" role="group" aria-label="Research control mode">
        <button
          type="button"
          className={mode === "agent" ? "active" : ""}
          onClick={() => setMode("agent")}
        >
          <b>AUTO RESEARCH</b>
          <small>Watch the deterministic baseline use every public tool.</small>
        </button>
        <button
          type="button"
          className={mode === "human" ? "active" : ""}
          onClick={() => setMode("human")}
        >
          <b>HUMAN RESEARCH</b>
          <small>Operate the same scientific tools yourself.</small>
        </button>
      </div>
      <section>
        <span>CHALLENGE PACK</span>
        <strong>Ubiquitin Functional Preservation</strong>
        <p>1UBQ · 76 residues · 5 candidate substitutions · bundled homologs</p>
      </section>
      {mode === "agent" && (
        <AgentPicker value={agentId} onChange={setAgentId} label="RESEARCH AGENT" baselineIds={["biocraft-researcher"]} />
      )}
      <label className="bio-budget-control">
        <span>TOOL BUDGET</span>
        <input
          type="range"
          min="10"
          max="12"
          value={toolBudget}
          onChange={(event) => setToolBudget(Number(event.target.value))}
        />
        <b>{toolBudget} CALLS</b>
      </label>
      <div className="bio-integrity-list">
        <span><i /> No runtime network access</span>
        <span><i /> Ground truth isolated until submission</span>
        <span><i /> RCSB / UniProt provenance bundled</span>
        <span><i /> Heavy unavailable tools fail honestly</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="bio-launch-button" onClick={launch} disabled={starting}>
        {starting ? "PREPARING LAB…" : mode === "agent" ? "START OBSERVABLE RUN" : "ENTER THE LAB"}
        <span>→</span>
      </button>
    </div>
  );
}
